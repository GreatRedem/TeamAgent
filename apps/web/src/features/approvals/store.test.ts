import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApprovalView } from "../../lib/approvals.js";
import { createApprovalsStore, type ApprovalTransport } from "./store.js";

import { approval } from "./fixtures.js";
import { NetworkError } from "../../lib/api.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function transport(): ApprovalTransport {
  return {
    permissions: vi.fn().mockResolvedValue({ permissions: ["approval.decide"] }),
    list: vi.fn().mockResolvedValue({ approvals: [approval()] }),
    approve: vi
      .fn()
      .mockResolvedValue({ run_id: "run-1", status: "waiting_for_approval", trace_id: "trace-1" }),
    reject: vi.fn().mockResolvedValue({ run_id: "run-1", status: "denied" }),
  };
}

afterEach(() => vi.useRealTimers());

describe("approval decision coordination", () => {
  it("gates all approval fetching and decisions on effective permission, not a role", async () => {
    const api = transport();
    vi.mocked(api.permissions).mockResolvedValue({ permissions: ["team.admin"] });
    const store = createApprovalsStore(api);
    store.start();
    await store.reload();
    await store.decide("approval-1", "approve");
    expect(store.getSnapshot().kind).toBe("denied");
    expect(api.list).not.toHaveBeenCalled();
    expect(api.approve).not.toHaveBeenCalled();
    store.stop();
  });

  it("polls at 30 seconds without overlap and stops on cleanup", async () => {
    vi.useFakeTimers();
    const api = transport();
    const store = createApprovalsStore(api);
    store.start();
    await store.reload();
    const pending = deferred<{ approvals: ApprovalView[] }>();
    vi.mocked(api.list).mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(api.list).toHaveBeenCalledTimes(2);
    store.stop();
    const snapshot = store.getSnapshot();
    pending.resolve({ approvals: [approval({ id: "old-team-response" })] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("ignores old lifecycle responses across setup cleanup setup", async () => {
    const api = transport();
    const pending = deferred<{ permissions: string[] }>();
    vi.mocked(api.permissions).mockReturnValueOnce(pending.promise);
    const store = createApprovalsStore(api);
    store.start();
    store.stop();
    store.start();
    pending.resolve({ permissions: ["approval.decide"] });
    await vi.waitFor(() => expect(store.getSnapshot().kind).toBe("ready"));
    expect(api.permissions).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenCalledTimes(1);
    store.stop();
  });

  it("makes count unknown after failure rather than reporting stale records as zero", async () => {
    const api = transport();
    const store = createApprovalsStore(api);
    store.start();
    await store.reload();
    vi.mocked(api.list).mockRejectedValueOnce(new NetworkError());
    await store.reload();
    expect(store.getSnapshot()).toMatchObject({ kind: "error", items: [], error: { key: "load" } });
    store.stop();
  });

  it("never retries a failed POST and refreshes even an unknown decision outcome", async () => {
    const api = transport();
    const store = createApprovalsStore(api);
    store.start();
    await store.reload();
    vi.mocked(api.approve).mockRejectedValueOnce(new NetworkError());
    await store.decide("approval-1", "approve");
    expect(api.approve).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().result).toMatchObject({
      id: "approval-1",
      kind: "error",
      error: { key: "outcomeUnknown" },
    });
    expect(store.getSnapshot().busyId).toBeNull();
    store.stop();
  });

  it("keeps decisions locked until reload completes and fails closed if reload fails", async () => {
    const api = transport();
    const store = createApprovalsStore(api);
    store.start();
    await store.reload();
    vi.mocked(api.list).mockRejectedValueOnce(new NetworkError());
    await store.decide("approval-1", "reject", "reason");
    expect(api.reject).toHaveBeenCalledWith("approval-1", "reason");
    expect(store.getSnapshot()).toMatchObject({
      kind: "error",
      result: { kind: "rejected", id: "approval-1" },
    });
    await store.decide("approval-1", "approve");
    expect(api.approve).not.toHaveBeenCalled();
    store.stop();
  });

  it("blocks unsafe approvals and overlong rejection reasons", async () => {
    const api = transport();
    vi.mocked(api.list).mockResolvedValue({ approvals: [approval({ proposed_action: null })] });
    const store = createApprovalsStore(api);
    store.start();
    await store.reload();
    await store.decide("approval-1", "approve");
    await store.decide("approval-1", "reject", "x".repeat(2001));
    expect(api.approve).not.toHaveBeenCalled();
    expect(api.reject).not.toHaveBeenCalled();
    await store.decide("approval-1", "reject", "x".repeat(2000));
    expect(api.reject).toHaveBeenCalledTimes(1);
    store.stop();
  });

  it("locks synchronously and discards an in-flight poll before authoritative decision reload", async () => {
    const api = transport();
    const store = createApprovalsStore(api);
    store.start();
    await store.reload();
    const poll = deferred<{ approvals: ApprovalView[] }>();
    vi.mocked(api.list).mockReturnValueOnce(poll.promise);
    const polling = store.reload();
    await vi.waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    const decision = store.decide("approval-1", "approve");
    const duplicate = store.decide("approval-1", "reject");
    poll.resolve({ approvals: [approval({ id: "stale" })] });
    await polling;
    vi.mocked(api.list).mockResolvedValue({
      approvals: [approval({ status: "approved" }), approval({ id: "next" })],
    });
    await Promise.all([decision, duplicate]);
    expect(api.approve).toHaveBeenCalledTimes(1);
    expect(api.reject).not.toHaveBeenCalled();
    expect(store.getSnapshot().items.map((item) => item.id)).toEqual(["approval-1", "next"]);
    expect(store.getSnapshot().result).toMatchObject({
      id: "approval-1",
      kind: "approved",
      outcome: { status: "waiting_for_approval" },
    });
    store.stop();
  });
});
