import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "../../lib/api.js";
import type { Source, SourceConnection } from "../../lib/sources.js";
import { createSourcesStore, type SourcesTransport } from "./store.js";

const source: Source = {
  id: "source-1",
  name: "Source",
  kind: "email",
  status: "active",
  has_webhook: false,
  created_at: "2026-06-01T12:00:00Z",
};
const connection: SourceConnection = {
  id: "connection-1",
  name: "Endpoint",
  owner_scope: "user",
  status: "disconnected",
  created_at: source.created_at,
};
const all = ["source.read", "source.connect", "source.disconnect"];
function setup(permissions = all) {
  const api = {
    permissions: vi.fn().mockResolvedValue({ permissions }),
    list: vi.fn().mockResolvedValue({ sources: [source, { ...source, id: "source-2" }] }),
    get: vi.fn().mockImplementation(async (id: string) => ({ ...source, id })),
    connections: vi
      .fn()
      .mockResolvedValue({ connections: [connection, { ...connection, id: "keep" }] }),
    create: vi.fn().mockResolvedValue({ id: "new-source" }),
    update: vi.fn().mockResolvedValue(source),
    connect: vi.fn().mockResolvedValue({ id: "new-connection" }),
    disconnect: vi.fn().mockResolvedValue({}),
  } satisfies SourcesTransport;
  const store = createSourcesStore(api);
  return { api, store };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}
async function ready(permissions = all) {
  const context = setup(permissions);
  context.store.start();
  await flush();
  return context;
}
async function detail(permissions = all) {
  const context = await ready(permissions);
  await context.store.select(source.id);
  return context;
}

describe("source lifecycle", () => {
  it("starts loading, resolves permissions before records and keeps all returned connections", async () => {
    const { api, store } = setup();
    expect(store.getSnapshot().kind).toBe("loading");
    store.start();
    expect(api.list).not.toHaveBeenCalled();
    await flush();
    expect(store.getSnapshot().sources).toHaveLength(2);
    await store.select(source.id);
    expect(store.getSnapshot().connections.map((item) => item.id)).toEqual([
      "connection-1",
      "keep",
    ]);
    expect(store.getSnapshot().connections[0].owner_scope).toBe("user");
    expect(api.get).toHaveBeenCalledWith(source.id);
  });
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    "enforces permission combination %s without roles",
    async (mask) => {
      const permissions = all.filter((_, index) => mask & (1 << index));
      const { api, store } = await ready(permissions);
      await store.create({ name: "New", type: "email" });
      expect(api.create).toHaveBeenCalledTimes(mask & 2 ? 1 : 0);
      await store.select(source.id);
      await store.save({ name: "Changed", status: "disabled" });
      await store.connect("New endpoint");
      await store.remove(connection.id);
      expect(api.update).toHaveBeenCalledTimes((mask & 3) === 3 ? 1 : 0);
      expect(api.connect).toHaveBeenCalledTimes((mask & 3) === 3 ? 1 : 0);
      expect(api.disconnect).toHaveBeenCalledTimes((mask & 5) === 5 ? 1 : 0);
      if (!(mask & 1)) {
        expect(api.list).not.toHaveBeenCalled();
        expect(api.get).not.toHaveBeenCalled();
        expect(api.connections).not.toHaveBeenCalled();
      }
    },
  );
  it("trims creation and update fields and never replaces other connections", async () => {
    const { api, store } = await detail();
    await store.save({ name: " Changed ", status: "disabled" });
    expect(api.update).toHaveBeenCalledWith(source.id, { name: "Changed", status: "disabled" });
    await store.connect(" New ");
    expect(api.connect).toHaveBeenCalledWith(source.id, "New");
    await store.remove(connection.id);
    expect(api.disconnect.mock.calls).toEqual([[source.id, connection.id]]);
    expect(store.getSnapshot().connections.map((item) => item.id)).toEqual([connection.id, "keep"]);
  });
  it("rejects invalid input and unknown selections without requests", async () => {
    const { api, store } = await detail();
    await store.create({ type: " ", name: "Name" });
    await store.save({ name: " ", status: "active" });
    await store.connect("x".repeat(201));
    await store.remove("not-listed");
    await store.select("not-listed");
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.connect).not.toHaveBeenCalled();
    expect(api.disconnect).not.toHaveBeenCalled();
    expect(store.getSnapshot().selection).toBe(source.id);
  });
  it("holds a synchronous mutation lock through terminal refresh", async () => {
    const { api, store } = await detail();
    const pending = deferred<unknown>();
    api.disconnect.mockImplementationOnce(() => pending.promise);
    const first = store.remove(connection.id);
    await store.remove("keep");
    await store.connect("New");
    await store.select(null);
    await store.reload();
    expect(api.disconnect).toHaveBeenCalledTimes(1);
    expect(api.connect).not.toHaveBeenCalled();
    expect(store.getSnapshot().selection).toBe(source.id);
    const refresh = deferred<{ connections: SourceConnection[] }>();
    api.connections.mockImplementationOnce(() => refresh.promise);
    pending.resolve({});
    await flush();
    expect(store.getSnapshot().busy).toBe(true);
    await store.remove("keep");
    expect(api.disconnect).toHaveBeenCalledTimes(1);
    refresh.resolve({ connections: [{ ...connection, id: "keep" }] });
    await first;
    expect(store.getSnapshot()).toMatchObject({ kind: "ready", busy: false, result: "removed" });
    expect(store.getSnapshot().connections.map((item) => item.id)).toEqual(["keep"]);
  });
  it("does not replay an unknown mutation outcome and requires explicit reload before more changes", async () => {
    const { api, store } = await detail();
    api.connect.mockRejectedValueOnce(new NetworkError());
    await store.connect("New");
    expect(api.connect).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({
      kind: "ready",
      busy: false,
      result: { key: "unknown" },
    });
    expect(api.connections).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().connections).toHaveLength(2);
    await store.connect("New");
    expect(api.connect).toHaveBeenCalledTimes(1);
    await store.reload();
    await store.connect("Reviewed new record");
    expect(api.connect).toHaveBeenCalledTimes(2);
  });
  it("retains the connection-in-use error and reference through reload", async () => {
    const { api, store } = await detail();
    api.disconnect.mockRejectedValueOnce(
      new ApiError("CONNECTION_IN_USE", 409, "private", "in-use-reference"),
    );
    await store.remove(connection.id);
    expect(store.getSnapshot().result).toEqual({
      key: "inUse",
      denied: false,
      requestId: "in-use-reference",
    });
    expect(store.getSnapshot().connections).toHaveLength(2);
  });
  it("clears terminal selection and returns to the source list after a missing mutation target", async () => {
    const { api, store } = await detail();
    api.update.mockRejectedValueOnce(new ApiError("NOT_FOUND", 404, "gone", "missing-reference"));
    await store.save({ name: "Name", status: "active" });
    expect(store.getSnapshot()).toMatchObject({
      kind: "ready",
      selection: null,
      source: null,
      connections: [],
      result: { key: "notFound", requestId: "missing-reference" },
    });
    expect(api.list).toHaveBeenCalledTimes(2);
  });
  it("does not keep a previous source after a detail read fails", async () => {
    const { api, store } = await detail();
    await store.select(null);
    api.get.mockRejectedValueOnce(new ApiError("NOT_FOUND", 404, "gone", "missing"));
    await store.select("source-2");
    expect(store.getSnapshot()).toMatchObject({
      kind: "error",
      selection: null,
      source: null,
      connections: [],
      error: { requestId: "missing" },
    });
    await store.reload();
    expect(store.getSnapshot()).toMatchObject({ kind: "ready", selection: null });
  });
  it("retains mutation success and refresh error separately without showing stale details", async () => {
    const { api, store } = await detail();
    api.connections.mockRejectedValueOnce(
      new ApiError("INTERNAL", 500, "private", "reload-reference"),
    );
    await store.connect("New");
    expect(store.getSnapshot()).toMatchObject({
      kind: "error",
      busy: false,
      source: null,
      connections: [],
      result: "connectionCreated",
      error: { key: "load", requestId: "reload-reference" },
    });
    await store.connect("New");
    expect(api.connect).toHaveBeenCalledTimes(1);
  });
  it("does not hide a failed connection read behind an empty ready list", async () => {
    const { api, store } = await ready();
    api.connections.mockRejectedValueOnce(
      new ApiError("FORBIDDEN", 403, "private", "denied-reference"),
    );
    await store.select(source.id);
    expect(store.getSnapshot()).toMatchObject({
      kind: "error",
      source: null,
      connections: [],
      error: { denied: true, requestId: "denied-reference" },
    });
  });
  it("refreshes effective permissions and prevents revoked actions", async () => {
    const { api, store } = await detail();
    api.permissions.mockResolvedValue({ permissions: ["source.read", "source.disconnect"] });
    await store.reload();
    await store.save({ name: "Name", status: "active" });
    await store.connect("New");
    await store.remove(connection.id);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.connect).not.toHaveBeenCalled();
    expect(api.disconnect).toHaveBeenCalledOnce();
  });
  it("clears details when read permission is revoked", async () => {
    const { api, store } = await detail();
    api.permissions.mockResolvedValue({ permissions: ["source.connect"] });
    await store.reload();
    expect(store.getSnapshot()).toMatchObject({
      kind: "ready",
      selection: null,
      source: null,
      connections: [],
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("ignores out-of-order source reads after returning and selecting another source", async () => {
    const { api, store } = await ready();
    const pending = deferred<Source>();
    api.get.mockImplementationOnce(() => pending.promise);
    const old = store.select(source.id);
    await flush();
    await store.select(null);
    await store.select("source-2");
    pending.resolve(source);
    await old;
    expect(store.getSnapshot().source?.id).toBe("source-2");
  });
  it("ignores stale reads across stop/start remount epochs", async () => {
    const { api, store } = setup();
    const pending = deferred<{ permissions: string[] }>();
    api.permissions.mockImplementationOnce(() => pending.promise);
    store.start();
    store.stop();
    store.start();
    await flush();
    await store.select("source-2");
    pending.resolve({ permissions: [] });
    await flush();
    expect(store.getSnapshot().source?.id).toBe("source-2");
    expect(store.getSnapshot().permissions).toEqual(all);
  });
  it("ignores mutation completion and callbacks after team/source remount", async () => {
    const { api, store } = await detail();
    const pending = deferred<unknown>();
    api.disconnect.mockImplementationOnce(() => pending.promise);
    const old = store.remove(connection.id);
    store.stop();
    store.start();
    await flush();
    await store.select("source-2");
    const current = store.getSnapshot();
    pending.reject(new NetworkError());
    await old;
    expect(store.getSnapshot()).toBe(current);
    expect(store.getSnapshot().source?.id).toBe("source-2");
  });
  it("keeps separate teams isolated and does not publish after stop", async () => {
    const first = await detail();
    const second = await ready();
    const listener = vi.fn();
    const unsubscribe = first.store.subscribe(listener);
    first.store.stop();
    await first.store.remove(connection.id);
    expect(first.api.disconnect).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(second.store.getSnapshot().selection).toBeNull();
    unsubscribe();
  });
  it("rejects a mismatched detail response rather than selecting it", async () => {
    const { api, store } = await ready();
    api.get.mockResolvedValueOnce({ ...source, id: "wrong-source" });
    await store.select(source.id);
    expect(store.getSnapshot()).toMatchObject({ kind: "error", source: null, connections: [] });
  });
});
