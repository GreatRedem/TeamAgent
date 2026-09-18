import type {
  CreateSourceInput,
  Source,
  SourceConnection,
  UpdateSourceInput,
} from "../../lib/sources.js";
import { sourceAccess, sourceFailure, validSourceText, type SourceFailure } from "./helpers.js";

export interface SourcesTransport {
  permissions: () => Promise<{ permissions: string[] }>;
  list: () => Promise<{ sources: Source[] }>;
  get: (id: string) => Promise<Source>;
  connections: (id: string) => Promise<{ connections: SourceConnection[] }>;
  create: (input: CreateSourceInput) => Promise<{ id: string }>;
  update: (id: string, input: UpdateSourceInput) => Promise<Source>;
  connect: (id: string, name: string) => Promise<{ id: string }>;
  disconnect: (id: string, connectionId: string) => Promise<unknown>;
}

export interface SourcesSnapshot {
  kind: "loading" | "ready" | "error";
  permissions: string[];
  selection: string | null;
  sources: Source[];
  source: Source | null;
  connections: SourceConnection[];
  error: SourceFailure | null;
  result: "created" | "saved" | "connectionCreated" | "removed" | SourceFailure | null;
  busy: boolean;
  revision: number;
}

export function createSourcesStore(api: SourcesTransport) {
  let state: SourcesSnapshot = {
    kind: "loading",
    permissions: [],
    selection: null,
    sources: [],
    source: null,
    connections: [],
    error: null,
    result: null,
    busy: false,
    revision: 0,
  };
  let active = false;
  let epoch = 0;
  let request = 0;
  const listeners = new Set<() => void>();
  function update(patch: Partial<SourcesSnapshot>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  async function load() {
    const generation = epoch;
    const ticket = ++request;
    const selection = state.selection;
    const current = () => active && generation === epoch && ticket === request;
    update({ kind: "loading", error: null, source: null, sources: [], connections: [] });
    try {
      const { permissions } = await api.permissions();
      if (!current()) return;
      update({ permissions });
      if (!sourceAccess(permissions).read) {
        update({ kind: "ready", selection: null, revision: state.revision + 1 });
        return;
      }
      if (selection === null) {
        const { sources } = await api.list();
        if (current()) update({ kind: "ready", sources, revision: state.revision + 1 });
      } else {
        const [source, { connections }] = await Promise.all([
          api.get(selection),
          api.connections(selection),
        ]);
        if (source.id !== selection) throw new Error("Source response mismatch");
        if (current()) update({ kind: "ready", source, connections, revision: state.revision + 1 });
      }
    } catch (caught) {
      if (!current()) return;
      const error = sourceFailure(caught);
      update({ kind: "error", error, ...(error.key === "notFound" ? { selection: null } : {}) });
    }
  }
  async function mutate(
    work: () => Promise<unknown>,
    result: "created" | "saved" | "connectionCreated" | "removed",
  ) {
    if (
      !active ||
      state.kind !== "ready" ||
      state.busy ||
      (state.result !== null && typeof state.result !== "string")
    )
      return;
    const generation = epoch;
    const current = () => active && generation === epoch;
    update({ busy: true, result: null });
    try {
      await work();
      if (current()) update({ result });
    } catch (caught) {
      if (current()) {
        const failure = sourceFailure(caught, true);
        update({ result: failure, ...(failure.key === "notFound" ? { selection: null } : {}) });
      }
    } finally {
      if (current()) {
        await load();
        if (current()) update({ busy: false });
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (active) return;
      active = true;
      epoch += 1;
      update({ busy: false, selection: null, result: null });
      void load();
    },
    stop() {
      active = false;
      epoch += 1;
      request += 1;
    },
    reload() {
      if (!active || state.busy || state.kind === "loading") return Promise.resolve();
      update({ result: null });
      return load();
    },
    select(id: string | null) {
      if (!active || state.busy) return Promise.resolve();
      if (
        id !== null &&
        (!sourceAccess(state.permissions).read || !state.sources.some((source) => source.id === id))
      )
        return Promise.resolve();
      update({ selection: id, result: null });
      return load();
    },
    create(input: CreateSourceInput) {
      if (
        !sourceAccess(state.permissions).connect ||
        !validSourceText(input.name) ||
        !validSourceText(input.type, 100)
      )
        return Promise.resolve();
      return mutate(
        () => api.create({ name: input.name.trim(), type: input.type.trim() }),
        "created",
      );
    },
    save(input: UpdateSourceInput) {
      const id = state.source?.id;
      if (
        !id ||
        !sourceAccess(state.permissions).connect ||
        !validSourceText(input.name) ||
        !["active", "disabled"].includes(input.status)
      )
        return Promise.resolve();
      return mutate(
        () => api.update(id, { name: input.name.trim(), status: input.status }),
        "saved",
      );
    },
    connect(name: string) {
      const id = state.source?.id;
      if (!id || !sourceAccess(state.permissions).connect || !validSourceText(name))
        return Promise.resolve();
      return mutate(() => api.connect(id, name.trim()), "connectionCreated");
    },
    remove(connectionId: string) {
      const id = state.source?.id;
      if (
        !id ||
        !sourceAccess(state.permissions).disconnect ||
        !state.connections.some((connection) => connection.id === connectionId)
      )
        return Promise.resolve();
      return mutate(() => api.disconnect(id, connectionId), "removed");
    },
  };
}

export type SourcesStore = ReturnType<typeof createSourcesStore>;
