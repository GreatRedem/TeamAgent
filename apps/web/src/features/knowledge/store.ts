import type {
  CreateKnowledgeBaseInput,
  IngestKnowledgeInput,
  KnowledgeBase,
  KnowledgeItemDetail,
  KnowledgeItemPage,
  KnowledgeItemSummary,
} from "../../lib/knowledge.js";
import {
  completeDetail,
  knowledgeAccess,
  knowledgeFailure,
  knowledgeTrust,
  mergeItems,
  validBase,
  validIngestion,
  validatePage,
  type KnowledgeFailure,
} from "./helpers.js";

export interface KnowledgeTransport {
  permissions: () => Promise<{ permissions: string[] }>;
  bases: () => Promise<{ knowledge_bases: KnowledgeBase[] }>;
  items: (baseId: string, cursor?: string) => Promise<KnowledgeItemPage>;
  detail: (baseId: string, itemId: string) => Promise<KnowledgeItemDetail>;
  create: (input: CreateKnowledgeBaseInput) => Promise<unknown>;
  ingest: (baseId: string, input: IngestKnowledgeInput) => Promise<unknown>;
  trust: (baseId: string, itemId: string, trusted: boolean) => Promise<unknown>;
}

export interface KnowledgeSnapshot {
  kind: "loading" | "ready" | "error";
  permissions: string[];
  bases: KnowledgeBase[];
  baseId: string | null;
  itemId: string | null;
  items: KnowledgeItemSummary[];
  detail: KnowledgeItemDetail | null;
  nextCursor: string | null;
  pageLoading: boolean;
  detailLoading: boolean;
  pageError: KnowledgeFailure | null;
  detailError: KnowledgeFailure | null;
  error: KnowledgeFailure | null;
  result: "created" | "ingested" | "trusted" | "revoked" | KnowledgeFailure | null;
  busy: boolean;
  revision: number;
}

function initial(): KnowledgeSnapshot {
  return {
    kind: "loading",
    permissions: [],
    bases: [],
    baseId: null,
    itemId: null,
    items: [],
    detail: null,
    nextCursor: null,
    pageLoading: false,
    detailLoading: false,
    pageError: null,
    detailError: null,
    error: null,
    result: null,
    busy: false,
    revision: 0,
  };
}

export function canChangeTrust(
  state: KnowledgeSnapshot,
  itemId: string,
  trusted: boolean,
): boolean {
  const access = knowledgeAccess(state.permissions);
  return (
    state.kind === "ready" &&
    access.read &&
    access.write &&
    !state.busy &&
    !state.pageLoading &&
    !state.detailLoading &&
    !state.pageError &&
    !state.detailError &&
    (state.result === null || typeof state.result === "string") &&
    state.baseId !== null &&
    state.itemId === itemId &&
    completeDetail(state.detail, state.baseId, itemId) &&
    knowledgeTrust(state.detail.trust_level) === (trusted ? "untrusted" : "trusted")
  );
}

export function createKnowledgeStore(api: KnowledgeTransport) {
  let state = initial();
  let active = false;
  let epoch = 0;
  let loadTicket = 0;
  let pageTicket = 0;
  let detailTicket = 0;
  let cursors = new Set<string>();
  const listeners = new Set<() => void>();
  function update(patch: Partial<KnowledgeSnapshot>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  async function load() {
    const generation = epoch;
    const ticket = ++loadTicket;
    pageTicket += 1;
    detailTicket += 1;
    const { baseId, itemId } = state;
    const current = () => active && generation === epoch && ticket === loadTicket;
    cursors = new Set();
    update({
      kind: "loading",
      permissions: [],
      items: [],
      detail: null,
      nextCursor: null,
      pageLoading: false,
      detailLoading: false,
      pageError: null,
      detailError: null,
      error: null,
    });
    try {
      const { permissions } = await api.permissions();
      if (!current()) return;
      update({ permissions });
      if (!knowledgeAccess(permissions).read) {
        update({
          kind: "ready",
          bases: [],
          baseId: null,
          itemId: null,
          revision: state.revision + 1,
        });
        return;
      }
      const { knowledge_bases: bases } = await api.bases();
      if (!current()) return;
      if (baseId === null || !bases.some((base) => base.id === baseId)) {
        update({ kind: "ready", bases, baseId: null, itemId: null, revision: state.revision + 1 });
        return;
      }
      const [page, detail] = await Promise.all([
        api.items(baseId),
        itemId === null ? null : api.detail(baseId, itemId),
      ]);
      if (!current()) return;
      validatePage(page, baseId, cursors);
      if (itemId !== null && !completeDetail(detail, baseId, itemId))
        throw new Error("Incomplete detail");
      update({
        kind: "ready",
        bases,
        items: mergeItems([], page.items),
        nextCursor: page.next_cursor,
        detail,
        revision: state.revision + 1,
      });
    } catch (caught) {
      if (!current()) return;
      const error = knowledgeFailure(caught);
      update({
        kind: "error",
        bases: [],
        items: [],
        detail: null,
        error,
        ...(error.key === "notFound" ? { baseId: null, itemId: null } : {}),
      });
    }
  }
  function mutable() {
    return (
      active &&
      state.kind === "ready" &&
      !state.busy &&
      !state.pageLoading &&
      !state.detailLoading &&
      !state.pageError &&
      !state.detailError &&
      (state.result === null || typeof state.result === "string")
    );
  }
  async function mutate(
    work: () => Promise<unknown>,
    result: "created" | "ingested" | "trusted" | "revoked",
  ) {
    if (!mutable()) return;
    const generation = epoch;
    const current = () => active && epoch === generation;
    update({ busy: true, result: null });
    try {
      await work();
      if (current()) update({ result });
    } catch (caught) {
      if (current()) update({ result: knowledgeFailure(caught, true) });
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
      update(initial());
      void load();
    },
    stop() {
      active = false;
      epoch += 1;
      loadTicket += 1;
      pageTicket += 1;
      detailTicket += 1;
      state = initial();
    },
    reload() {
      if (!active || state.busy || state.kind === "loading") return Promise.resolve();
      update({ result: null });
      return load();
    },
    selectBase(baseId: string | null) {
      if (
        !active ||
        state.busy ||
        (baseId !== null &&
          (!knowledgeAccess(state.permissions).read ||
            !state.bases.some((base) => base.id === baseId)))
      )
        return Promise.resolve();
      update({ baseId, itemId: null, items: [], detail: null, nextCursor: null });
      return load();
    },
    async selectItem(itemId: string | null) {
      const baseId = state.baseId;
      if (
        !active ||
        state.busy ||
        state.kind !== "ready" ||
        !baseId ||
        !knowledgeAccess(state.permissions).read ||
        (itemId !== null && !state.items.some((item) => item.id === itemId))
      )
        return;
      const ticket = ++detailTicket;
      const generation = epoch;
      const current = () =>
        active && generation === epoch && ticket === detailTicket && state.baseId === baseId;
      update({ itemId, detail: null, detailError: null, detailLoading: itemId !== null });
      if (itemId === null) return;
      try {
        const detail = await api.detail(baseId, itemId);
        if (!current()) return;
        if (!completeDetail(detail, baseId, itemId)) throw new Error("Incomplete detail");
        update({ detail, detailLoading: false, revision: state.revision + 1 });
      } catch (caught) {
        if (current())
          update({ detail: null, detailLoading: false, detailError: knowledgeFailure(caught) });
      }
    },
    async loadMore() {
      const { baseId, nextCursor } = state;
      if (
        !active ||
        state.kind !== "ready" ||
        state.busy ||
        state.pageLoading ||
        state.pageError ||
        !baseId ||
        !nextCursor ||
        !knowledgeAccess(state.permissions).read
      )
        return;
      const ticket = ++pageTicket;
      const generation = epoch;
      const current = () =>
        active && generation === epoch && ticket === pageTicket && state.baseId === baseId;
      update({ pageLoading: true });
      const seen = new Set([...cursors, nextCursor]);
      try {
        const page = await api.items(baseId, nextCursor);
        if (!current()) return;
        validatePage(page, baseId, seen);
        cursors = seen;
        update({
          items: mergeItems(state.items, page.items),
          nextCursor: page.next_cursor,
          pageLoading: false,
        });
      } catch (caught) {
        if (current()) {
          const pageError = knowledgeFailure(caught);
          update({
            pageLoading: false,
            nextCursor: null,
            pageError,
            ...(pageError.key === "denied" ||
            pageError.key === "notFound" ||
            pageError.key === "session"
              ? { items: [], detail: null, itemId: null }
              : {}),
          });
          detailTicket += 1;
          update({ detailLoading: false });
        }
      }
    },
    create(input: CreateKnowledgeBaseInput) {
      if (!knowledgeAccess(state.permissions).write || !validBase(input)) return Promise.resolve();
      return mutate(
        () => api.create({ name: input.name.trim(), description: input.description }),
        "created",
      );
    },
    ingest(input: IngestKnowledgeInput) {
      const baseId = state.baseId;
      if (
        !baseId ||
        !knowledgeAccess(state.permissions).read ||
        !knowledgeAccess(state.permissions).write ||
        !validIngestion(input)
      )
        return Promise.resolve();
      return mutate(
        () =>
          api.ingest(baseId, {
            title: input.title,
            content: input.content,
            ingested_from: input.ingested_from,
          }),
        "ingested",
      );
    },
    trust(itemId: string, trusted: boolean) {
      if (!canChangeTrust(state, itemId, trusted)) return Promise.resolve();
      const baseId = state.baseId!;
      return mutate(() => api.trust(baseId, itemId, trusted), trusted ? "trusted" : "revoked");
    },
  };
}

export type KnowledgeStore = ReturnType<typeof createKnowledgeStore>;
