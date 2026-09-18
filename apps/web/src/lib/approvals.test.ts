import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Http } from "./http.js";
import { NetworkError } from "./api.js";
import {
  approvalPath,
  approveApproval,
  getApproval,
  listApprovals,
  rejectApproval,
} from "./approvals.js";

const fetchMock = vi.fn<typeof fetch>();
const refresh = vi.fn<() => Promise<string | null>>();
const http = new Http(() => "test-token", refresh);
const path = "/teams/team%20%2F/approvals/approval%20%3F";
function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, error: null, request_id: "ref" }));
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refresh.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("approval API contract", () => {
  it("encodes each scoped path segment", () => {
    expect(approvalPath("team /", "approval ?")).toBe(path);
  });
  it("lists with no implicit server filter", async () => {
    fetchMock.mockResolvedValueOnce(success({ approvals: [] }));
    await expect(listApprovals(http, "team /")).resolves.toEqual({ approvals: [] });
    expect(fetchMock.mock.calls[0][0]).toBe("/teams/team%20%2F/approvals");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer test-token" },
    });
  });
  it("sends only supported optional list filters", async () => {
    fetchMock.mockResolvedValueOnce(success({ approvals: [] }));
    await listApprovals(http, "team /", {
      status: "pending",
      agent_id: "agent /",
      context_trust_level: "untrusted",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/teams/team%20%2F/approvals?status=pending&agent_id=agent+%2F&context_trust_level=untrusted",
    );
  });
  it("gets the scoped detail and preserves nullable added metadata", async () => {
    const data = {
      id: "approval ?",
      created_at: "2026-01-01T00:00:00Z",
      trace_id: null,
      tool_call_id: null,
      decision_reason: null,
    };
    fetchMock.mockResolvedValueOnce(success(data));
    await expect(getApproval(http, "team /", "approval ?")).resolves.toEqual(data);
    expect(fetchMock.mock.calls[0][0]).toBe(path);
  });
  it("approves without offering or sending an unpersisted note, returning the RUN outcome", async () => {
    const outcome = { run_id: "run", status: "waiting_for_approval", trace_id: "trace" };
    fetchMock.mockResolvedValueOnce(success(outcome));
    await expect(approveApproval(http, "team /", "approval ?")).resolves.toEqual(outcome);
    expect(fetchMock.mock.calls[0][0]).toBe(`${path}/approve`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: "{}" });
  });
  it.each([undefined, "", "Explicit reason"])(
    "rejects with optional reason %s and returns denied run outcome",
    async (reason) => {
      fetchMock.mockResolvedValueOnce(success({ run_id: "run", status: "denied" }));
      await expect(rejectApproval(http, "team /", "approval ?", reason)).resolves.toEqual({
        run_id: "run",
        status: "denied",
      });
      expect(fetchMock.mock.calls[0][0]).toBe(`${path}/reject`);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      });
    },
  );
  it.each(["approve", "reject"])(
    "does not retry a %s POST on network failure",
    async (decision) => {
      fetchMock.mockRejectedValueOnce(new TypeError("network"));
      const call = decision === "approve" ? approveApproval : rejectApproval;
      await expect(call(http, "team /", "approval ?")).rejects.toBeInstanceOf(NetworkError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(refresh).not.toHaveBeenCalled();
    },
  );
});
