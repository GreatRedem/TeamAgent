import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "../../lib/api.js";
import type { KnowledgeItemDetail, KnowledgeItemPage } from "../../lib/knowledge.js";
import { canChangeTrust, createKnowledgeStore, type KnowledgeTransport } from "./store.js";

const all = ["knowledge.read", "knowledge.write"];
const item: KnowledgeItemDetail = {
  id: "item-1",
  knowledge_base_id: "base-1",
  title: null,
  content: "  complete\ncontent\u202e  ",
  metadata: { nested: { retained: true } },
  trust_level: "untrusted",
  trusted_by: null,
  trusted_at: null,
  ingested_from: null,
  ingested_by: null,
  created_at: "2026-09-18T12:00:00.123456Z",
};
const base = {
  id: "base-1",
  name: "Base",
  description: null,
  type: null,
  created_at: item.created_at,
};
function page(items = [item], next_cursor: string | null = null): KnowledgeItemPage {
  return { items, next_cursor, has_more: next_cursor !== null };
}
function setup(permissions = all) {
  const api = {
    permissions: vi.fn().mockResolvedValue({ permissions }),
    bases: vi.fn().mockResolvedValue({ knowledge_bases: [base, { ...base, id: "base-2" }] }),
    items: vi.fn().mockImplementation(async (baseId: string) =>
      page([
        { ...item, knowledge_base_id: baseId },
        { ...item, id: "item-2", knowledge_base_id: baseId },
      ]),
    ),
    detail: vi.fn().mockImplementation(async (baseId: string, itemId: string) => ({
      ...item,
      id: itemId,
      knowledge_base_id: baseId,
    })),
    create: vi.fn().mockResolvedValue({ id: "new" }),
    ingest: vi.fn().mockResolvedValue({ id: "new", chunk_count: 2 }),
    trust: vi.fn().mockResolvedValue({ id: item.id, trust_level: "trusted" }),
  } satisfies KnowledgeTransport;
  return { api, store: createKnowledgeStore(api) };
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
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
}
async function ready(permissions = all) {
  const context = setup(permissions);
  context.store.start();
  await flush();
  return context;
}
async function inventory(permissions = all) {
  const context = await ready(permissions);
  await context.store.selectBase(base.id);
  return context;
}
async function detail(permissions = all) {
  const context = await inventory(permissions);
  await context.store.selectItem(item.id);
  return context;
}

describe("knowledge store permissions and lifecycle", () => {
  it("caches snapshots, subscribes once per update and waits for effective permissions", async () => {
    const { api, store } = setup();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.start();
    store.start();
    expect(api.permissions).toHaveBeenCalledTimes(1);
    expect(api.bases).not.toHaveBeenCalled();
    await flush();
    expect(store.getSnapshot().bases).toHaveLength(2);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await store.reload();
    expect(listener).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3])("enforces read/write combination %s, not roles", async (mask) => {
    const { api, store } = await detail(all.filter((_, index) => mask & (1 << index)));
    await store.create({ name: "New" });
    await store.ingest({ content: "text" });
    await store.trust(item.id, true);
    expect(api.create).toHaveBeenCalledTimes(mask & 2 ? 1 : 0);
    expect(api.ingest).toHaveBeenCalledTimes(mask === 3 ? 1 : 0);
    expect(api.trust).toHaveBeenCalledTimes(mask === 3 ? 1 : 0);
    if (!(mask & 1)) {
      expect(api.bases).not.toHaveBeenCalled();
      expect(api.items).not.toHaveBeenCalled();
      expect(api.detail).not.toHaveBeenCalled();
    }
  });
  it("keeps ingestion content, title and user-supplied source untrimmed and strips extra properties", async () => {
    const { api, store } = await inventory();
    await store.ingest({
      content: item.content,
      title: " Title ",
      ingested_from: " Unverified ",
      trusted: true,
    } as never);
    expect(api.ingest).toHaveBeenCalledWith(base.id, {
      content: item.content,
      title: " Title ",
      ingested_from: " Unverified ",
    });
    await store.create({ name: " Name ", description: " description ", trusted: true } as never);
    expect(api.create).toHaveBeenCalledWith({ name: "Name", description: " description " });
  });
  it("rejects invalid inputs and selections without network requests", async () => {
    const { api, store } = await inventory();
    await store.create({ name: " " });
    await store.create({ name: "Name", description: "x".repeat(2001) });
    await store.ingest({ content: "" });
    await store.ingest({ content: "x".repeat(100001) });
    await store.ingest({ content: "x", title: " " });
    await store.ingest({ content: "x", ingested_from: " " });
    await store.selectBase("unknown");
    await store.selectItem("unknown");
    await store.trust(item.id, true);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.ingest).not.toHaveBeenCalled();
    expect(api.detail).not.toHaveBeenCalled();
    expect(api.trust).not.toHaveBeenCalled();
    expect(store.getSnapshot().baseId).toBe(base.id);
  });
  it("clears all readable records when effective read permission is revoked", async () => {
    const { api, store } = await detail();
    api.permissions.mockResolvedValueOnce({ permissions: ["knowledge.write"] });
    await store.reload();
    expect(store.getSnapshot()).toMatchObject({
      kind: "ready",
      bases: [],
      items: [],
      detail: null,
      baseId: null,
      itemId: null,
    });
    await store.trust(item.id, true);
    expect(api.trust).not.toHaveBeenCalled();
  });
  it("prevents trust after write permission is revoked", async () => {
    const { api, store } = await detail();
    api.permissions.mockResolvedValue({ permissions: ["knowledge.read"] });
    await store.reload();
    await store.trust(item.id, true);
    expect(api.trust).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 500])(
    "does not present failed detail %s as complete or retain a previous detail",
    async (status) => {
      const { api, store } = await detail();
      api.detail.mockRejectedValueOnce(
        new ApiError("FAILURE", status, "private", "detail-reference"),
      );
      await store.selectItem("item-2");
      expect(store.getSnapshot().detail).toBeNull();
      expect(store.getSnapshot().detailError?.requestId).toBe("detail-reference");
      await store.trust("item-2", true);
      expect(api.trust).not.toHaveBeenCalled();
    },
  );
  it.each([
    { id: "wrong" },
    { knowledge_base_id: "wrong" },
    { content: undefined },
    { metadata: undefined },
    { metadata: [] },
    { ingested_by: undefined },
    { trusted_at: undefined },
  ])("fails closed on incomplete or mismatched details %j", async (patch) => {
    const { api, store } = await inventory();
    api.detail.mockResolvedValueOnce({ ...item, ...patch });
    await store.selectItem(item.id);
    expect(store.getSnapshot().detail).toBeNull();
    expect(store.getSnapshot().detailError?.key).toBe("load");
    await store.trust(item.id, true);
    expect(api.trust).not.toHaveBeenCalled();
  });
  it("preserves full detail and null attribution without inventing users or provenance", async () => {
    const { store } = await detail();
    expect(store.getSnapshot().detail).toEqual(item);
    expect(canChangeTrust(store.getSnapshot(), item.id, true)).toBe(true);
  });
});

describe("knowledge pagination", () => {
  it("uses opaque cursors, deduplicates pages, retains null attribution and locks duplicate load-more", async () => {
    const { api, store } = await inventory();
    api.items.mockResolvedValueOnce(page([item, item], "opaque-one"));
    await store.reload();
    expect(store.getSnapshot().items).toHaveLength(1);
    const pending = deferred<KnowledgeItemPage>();
    api.items.mockImplementationOnce(() => pending.promise);
    const request = store.loadMore();
    await store.loadMore();
    expect(api.items).toHaveBeenLastCalledWith(base.id, "opaque-one");
    expect(api.items).toHaveBeenCalledTimes(3);
    pending.resolve(
      page(
        [
          { ...item, trusted_by: "human", trust_level: "trusted" },
          { ...item, id: "item-2" },
        ],
        "opaque-two",
      ),
    );
    await request;
    expect(store.getSnapshot().items.map((entry) => entry.id)).toEqual([item.id, "item-2"]);
    expect(store.getSnapshot().items[0].trusted_by).toBe("human");
    expect(store.getSnapshot().items[1].ingested_from).toBeNull();
    api.items.mockResolvedValueOnce(page([{ ...item, id: "item-3" }]));
    await store.loadMore();
    expect(store.getSnapshot().nextCursor).toBeNull();
    await store.loadMore();
    expect(api.items).toHaveBeenCalledTimes(4);
  });
  it.each([
    { has_more: true, next_cursor: null },
    { has_more: false, next_cursor: "next" },
    { has_more: true, next_cursor: "" },
    { has_more: true, next_cursor: "not opaque!" },
    { has_more: true, next_cursor: "x".repeat(1025) },
    { has_more: true, next_cursor: "next", items: [] },
    { items: [{ ...item, knowledge_base_id: "wrong" }] },
  ])("rejects invalid first-page shape %j", async (patch) => {
    const { api, store } = await ready();
    api.items.mockResolvedValueOnce({ ...page(), ...patch });
    await store.selectBase(base.id);
    expect(store.getSnapshot()).toMatchObject({
      kind: "error",
      items: [],
      detail: null,
      error: { key: "cursor" },
    });
  });
  it("detects repeated and cyclic cursors without corrupting accumulated items", async () => {
    const { api, store } = await inventory();
    api.items.mockResolvedValueOnce(page([item], "one"));
    await store.reload();
    api.items.mockResolvedValueOnce(page([{ ...item, id: "item-2" }], "two"));
    await store.loadMore();
    api.items.mockResolvedValueOnce(page([{ ...item, id: "item-3" }], "one"));
    await store.loadMore();
    expect(store.getSnapshot().items).toHaveLength(2);
    expect(store.getSnapshot().pageError?.key).toBe("cursor");
    expect(store.getSnapshot().nextCursor).toBeNull();
  });
  it.each([
    [400, "INVALID_CURSOR", "cursor"],
    [400, "INVALID_INPUT", "invalid"],
    [403, "FORBIDDEN", "denied"],
    [404, "NOT_FOUND", "notFound"],
    [500, "INTERNAL", "load"],
  ] as const)("retains page failure %s %s and requires reload", async (status, code, key) => {
    const { api, store } = await inventory();
    api.items.mockResolvedValueOnce(page([item], "one"));
    await store.reload();
    await store.selectItem(item.id);
    api.items.mockRejectedValueOnce(new ApiError(code, status, "private", "page-reference"));
    await store.loadMore();
    expect(store.getSnapshot().pageError).toEqual({ key, requestId: "page-reference" });
    const count = api.items.mock.calls.length;
    await store.loadMore();
    await store.trust(item.id, true);
    expect(api.items).toHaveBeenCalledTimes(count);
    expect(api.trust).not.toHaveBeenCalled();
    if (status === 403 || status === 404)
      expect(store.getSnapshot()).toMatchObject({ items: [], detail: null, itemId: null });
    await store.reload();
    expect(store.getSnapshot().pageError).toBeNull();
    expect(api.items).toHaveBeenLastCalledWith(base.id);
  });
});

describe("knowledge mutations", () => {
  it("locks the confirmed ID through authoritative detail and first-page refresh, ignoring partial trust response", async () => {
    const { api, store } = await detail();
    const mutation = deferred<unknown>();
    const refreshedDetail = deferred<KnowledgeItemDetail>();
    const refreshedPage = deferred<KnowledgeItemPage>();
    api.trust.mockImplementationOnce(() => mutation.promise);
    api.detail.mockImplementationOnce(() => refreshedDetail.promise);
    api.items.mockImplementationOnce(() => refreshedPage.promise);
    const request = store.trust(item.id, true);
    await store.trust(item.id, true);
    await store.ingest({ content: "duplicate" });
    await store.create({ name: "duplicate" });
    await store.selectItem("item-2");
    await store.selectBase("base-2");
    await store.reload();
    expect(api.trust.mock.calls).toEqual([[base.id, item.id, true]]);
    expect(api.ingest).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    mutation.resolve({ id: "wrong", trust_level: "trusted" });
    await flush();
    expect(store.getSnapshot()).toMatchObject({
      busy: true,
      detail: null,
      items: [],
      itemId: item.id,
      result: "trusted",
    });
    const trusted = {
      ...item,
      trust_level: "trusted",
      trusted_by: "human-1",
      trusted_at: "2026-09-18T13:00:00.654321Z",
    };
    refreshedDetail.resolve(trusted);
    await flush();
    expect(store.getSnapshot().busy).toBe(true);
    await store.trust(item.id, true);
    refreshedPage.resolve(page([trusted]));
    await request;
    expect(store.getSnapshot()).toMatchObject({
      busy: false,
      detail: trusted,
      items: [trusted],
      result: "trusted",
    });
    await store.trust(item.id, true);
    expect(api.trust).toHaveBeenCalledTimes(1);
  });
  it.each(["detail", "items"] as const)(
    "retains trust success but clears records and blocks changes after %s refresh failure",
    async (method) => {
      const { api, store } = await detail();
      api[method].mockRejectedValueOnce(
        new ApiError("INTERNAL", 500, "private", "refresh-reference"),
      );
      await store.trust(item.id, true);
      expect(store.getSnapshot()).toMatchObject({
        kind: "error",
        busy: false,
        result: "trusted",
        detail: null,
        items: [],
        error: { key: "load", requestId: "refresh-reference" },
      });
      await store.trust(item.id, true);
      expect(api.trust).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["trusted", "future", "Trusted", "user_input", ""])(
    "never sends trusted=true for current trust %s",
    async (trust_level) => {
      const { api, store } = await inventory();
      api.detail.mockResolvedValueOnce({ ...item, trust_level });
      await store.selectItem(item.id);
      await store.trust(item.id, true);
      expect(api.trust).not.toHaveBeenCalled();
    },
  );
  it("revokes only a trusted matching item and refreshes cleared attribution", async () => {
    const { api, store } = await inventory();
    api.detail.mockResolvedValueOnce({
      ...item,
      trust_level: "trusted",
      trusted_by: "human",
      trusted_at: item.created_at,
    });
    await store.selectItem(item.id);
    await store.trust("item-2", false);
    await store.trust(item.id, false);
    expect(api.trust.mock.calls).toEqual([[base.id, item.id, false]]);
    expect(store.getSnapshot()).toMatchObject({
      result: "revoked",
      detail: { trust_level: "untrusted", trusted_by: null, trusted_at: null },
    });
    await store.trust(item.id, false);
    expect(api.trust).toHaveBeenCalledTimes(1);
  });
  it("requires explicit reload after ambiguous mutation and cannot bypass via selection", async () => {
    const { api, store } = await detail();
    api.trust.mockRejectedValueOnce(new NetworkError());
    await store.trust(item.id, true);
    expect(store.getSnapshot().result).toEqual({ key: "unknown", requestId: null });
    await store.selectItem("item-2");
    await store.trust("item-2", true);
    await store.selectBase(null);
    await store.create({ name: "New" });
    expect(api.trust).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
    await store.reload();
    await store.create({ name: "Reviewed" });
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it.each(["create", "ingest", "trust"] as const)(
    "blocks duplicate %s submissions and retains ambiguous request references",
    async (method) => {
      const { api, store } = await detail();
      const pending = deferred<unknown>();
      api[method].mockImplementationOnce(() => pending.promise);
      const call = () =>
        method === "create"
          ? store.create({ name: "Name" })
          : method === "ingest"
            ? store.ingest({ content: "Text" })
            : store.trust(item.id, true);
      const first = call();
      await call();
      pending.reject(new ApiError("INTERNAL", 500, "private", "mutation-reference"));
      await first;
      await call();
      expect(api[method]).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().result).toEqual({
        key: "unknown",
        requestId: "mutation-reference",
      });
    },
  );
  it("retains server denial even if access refresh still reports write", async () => {
    const { api, store } = await detail();
    api.trust.mockRejectedValueOnce(new ApiError("FORBIDDEN", 403, "private", "denied-ref"));
    await store.trust(item.id, true);
    await store.trust(item.id, true);
    expect(api.trust).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().result).toEqual({ key: "denied", requestId: "denied-ref" });
  });
});

describe("knowledge stale response protections", () => {
  it("never publishes previous-base content under a new base selection", async () => {
    const { store } = await detail();
    const snapshots: ReturnType<typeof store.getSnapshot>[] = [];
    store.subscribe(() => snapshots.push(store.getSnapshot()));
    await store.selectBase("base-2");
    for (const snapshot of snapshots) {
      if (snapshot.baseId === "base-2") {
        expect(snapshot.detail).toBeNull();
        expect(snapshot.items.every((entry) => entry.knowledge_base_id === "base-2")).toBe(true);
      }
    }
  });
  it("rejects stale confirmed ID and clears content immediately on new selection", async () => {
    const { api, store } = await detail();
    const pending = deferred<KnowledgeItemDetail>();
    api.detail.mockImplementationOnce(() => pending.promise);
    const request = store.selectItem("item-2");
    expect(store.getSnapshot()).toMatchObject({
      detail: null,
      detailLoading: true,
      itemId: "item-2",
    });
    await store.trust(item.id, true);
    await store.trust("item-2", true);
    expect(api.trust).not.toHaveBeenCalled();
    pending.resolve({ ...item, id: "item-2" });
    await request;
    await store.trust(item.id, true);
    expect(api.trust).not.toHaveBeenCalled();
  });
  it("ignores out-of-order detail successes and errors", async () => {
    const { api, store } = await inventory();
    const first = deferred<KnowledgeItemDetail>();
    const second = deferred<KnowledgeItemDetail>();
    api.detail
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const oldSuccess = store.selectItem(item.id);
    const oldFailure = store.selectItem("item-2");
    await store.selectItem(item.id);
    const snapshot = store.getSnapshot();
    first.resolve({ ...item, content: "stale" });
    second.reject(new NetworkError());
    await Promise.all([oldSuccess, oldFailure]);
    expect(store.getSnapshot()).toBe(snapshot);
  });
  it("ignores a stale first page after switching bases", async () => {
    const { api, store } = await ready();
    const pending = deferred<KnowledgeItemPage>();
    api.items.mockImplementationOnce(() => pending.promise);
    const old = store.selectBase(base.id);
    await flush();
    await store.selectBase("base-2");
    const snapshot = store.getSnapshot();
    pending.resolve(page());
    await old;
    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.getSnapshot().items.every((entry) => entry.knowledge_base_id === "base-2")).toBe(
      true,
    );
  });
  it("ignores stale load-more and detail after switching bases", async () => {
    const { api, store } = await inventory();
    api.items.mockResolvedValueOnce(page([item], "next"));
    await store.reload();
    const pendingPage = deferred<KnowledgeItemPage>();
    const pendingDetail = deferred<KnowledgeItemDetail>();
    api.items.mockImplementationOnce(() => pendingPage.promise);
    api.detail.mockImplementationOnce(() => pendingDetail.promise);
    const oldPage = store.loadMore();
    const oldDetail = store.selectItem(item.id);
    await store.selectBase("base-2");
    const snapshot = store.getSnapshot();
    pendingPage.reject(new NetworkError());
    pendingDetail.resolve(item);
    await Promise.all([oldPage, oldDetail]);
    expect(store.getSnapshot()).toBe(snapshot);
  });
  it("clears scope on stop/start and ignores stale permission responses", async () => {
    const { api, store } = setup();
    const pending = deferred<{ permissions: string[] }>();
    api.permissions.mockImplementationOnce(() => pending.promise);
    store.start();
    store.stop();
    store.start();
    await flush();
    await store.selectBase("base-2");
    pending.resolve({ permissions: [] });
    await flush();
    expect(store.getSnapshot()).toMatchObject({ permissions: all, baseId: "base-2" });
  });
  it("isolates teams, clears old content immediately, and never publishes stale mutation completion", async () => {
    const first = await detail();
    const second = await ready();
    const pending = deferred<unknown>();
    first.api.trust.mockImplementationOnce(() => pending.promise);
    const request = first.store.trust(item.id, true);
    const listener = vi.fn();
    first.store.subscribe(listener);
    first.store.stop();
    expect(first.store.getSnapshot()).toMatchObject({
      detail: null,
      items: [],
      bases: [],
      baseId: null,
      itemId: null,
    });
    pending.resolve({});
    await request;
    expect(listener).not.toHaveBeenCalled();
    expect(second.store.getSnapshot()).toMatchObject({ baseId: null, itemId: null, result: null });
  });
  it("ignores stale base list across remount and resets selection", async () => {
    const { api, store } = setup();
    const pending = deferred<{ knowledge_bases: (typeof base)[] }>();
    api.bases.mockImplementationOnce(() => pending.promise);
    store.start();
    await flush();
    store.stop();
    store.start();
    await flush();
    const snapshot = store.getSnapshot();
    pending.resolve({ knowledge_bases: [{ ...base, name: "previous team" }] });
    await flush();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(snapshot.baseId).toBeNull();
  });
});
