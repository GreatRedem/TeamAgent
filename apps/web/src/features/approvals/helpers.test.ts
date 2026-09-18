import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../../lib/api.js";
import { approval } from "./fixtures.js";
import {
  actionable,
  actionContext,
  approvalFailure,
  canDecide,
  expiryState,
  groupApprovals,
  knownStatus,
  knownTrust,
  pendingCount,
  plainText,
  reasonKey,
  safeContext,
  timestamp,
} from "./helpers.js";

const now = Date.parse("2026-06-01T00:00:00Z");

describe("approval safety and expiry", () => {
  it.each([
    undefined,
    null,
    "",
    "tomorrow",
    "2026-06-01",
    "2026-06-01T00:00:00",
    "2026-02-30T00:00:00Z",
    "2026-06-01T24:00:00Z",
    "2026-13-01T00:00:00Z",
  ])("rejects invalid expiry %s", (expires) => {
    expect(timestamp(expires)).toBeNull();
    expect(actionable(approval({ expires_at: expires as string }), now)).toBe(false);
  });
  it("uses an exact deadline and accepts explicit timezone offsets", () => {
    expect(timestamp("2026-06-01T01:00:00+01:00")).toBe(now);
    const item = approval({ expires_at: new Date(now).toISOString() });
    expect(expiryState(item, now - 1)).toBe("open");
    expect(expiryState(item, now)).toBe("elapsed");
    expect(canDecide(item, now)).toBe(false);
  });
  it.each(["approved", "rejected", "expired", "unexpected"])(
    "does not count terminal/unknown status %s",
    (status) => {
      expect(pendingCount([approval({ status })], now)).toBe(0);
    },
  );
  it("counts only safe nonexpired returned requests", () => {
    expect(
      pendingCount(
        [
          approval(),
          approval({ expires_at: "invalid" }),
          approval({ run_id: null }),
          approval({ expires_at: new Date(now).toISOString() }),
        ],
        now,
      ),
    ).toBe(1);
  });
  it.each([
    null,
    [],
    {},
    { tool: "", risk_tier: "write", arguments: {}, resolved_destination: null },
    { tool: "send", risk_tier: "admin", arguments: {}, resolved_destination: null },
    { tool: "send", risk_tier: "write", arguments: null, resolved_destination: null },
    { tool: "send", risk_tier: "write", arguments: {} },
    { tool: "send", risk_tier: "write", arguments: {}, resolved_destination: {} },
  ])("fails closed on action shape %j", (action) => {
    expect(actionContext(approval({ proposed_action: action }))).toBeNull();
  });
  it.each([
    { run_id: null },
    { tool_call_id: null },
    { agent: null },
    { context_trust_level: null },
    { context_trust_level: "future" },
  ])("requires safe linked context %j", (patch) => {
    expect(safeContext(approval(patch))).toBe(false);
    expect(canDecide(approval(patch), now)).toBe(true);
  });
  it("does not fabricate missing metadata or treat a null destination as validation", () => {
    expect(safeContext(approval({ trace_id: null, decision_reason: null }))).toBe(true);
    expect(
      actionContext(
        approval({
          proposed_action: {
            tool: "send",
            risk_tier: "write",
            arguments: {},
            resolved_destination: null,
          },
        }),
      )?.destination,
    ).toBeNull();
  });
});

describe("causes and source formatting", () => {
  it("groups exact causes, sorts nearest expiry and bounds counts to filtered records", () => {
    const records = [
      approval({ id: "late" }),
      approval({ id: "early", expires_at: "2027-01-01T00:00:00Z" }),
      approval({ id: "other", decision_reason: "future" }),
      approval({ id: "done", status: "approved" }),
    ];
    const groups = groupApprovals(records, {
      status: "pending",
      context_trust_level: "untrusted",
      agent_id: "agent-1",
    });
    expect(groups.map((group) => group.records.map((item) => item.id))).toEqual([
      ["early", "late"],
      ["other"],
    ]);
    expect(records[0].id).toBe("late");
    expect(groupApprovals(records, { agent_id: "absent" })).toEqual([]);
  });
  it("localizes exact runtime reasons and falls back safely", () => {
    expect(reasonKey("write-requires-approval-on-untrusted")).toBe("untrustedWrite");
    for (const value of [null, "future", "toString", "__proto__"])
      expect(reasonKey(value)).toBe("unknown");
    expect(knownTrust(null)).toBe("unknown");
    expect(knownStatus("future")).toBe("unknown");
  });
  it("preserves literal source text and JSON without links, provenance inference or markup processing", () => {
    const text = '<img src="https://example.invalid">\n[click](https://example.invalid)\u202E';
    expect(plainText(text, "missing")).toBe(text);
    expect(plainText({ origin: null, content: text }, "missing")).toBe(
      JSON.stringify({ origin: null, content: text }, null, 2),
    );
    expect(plainText(null, "missing")).toBe("missing");
    expect(plainText(undefined, "missing")).toBe("missing");
    expect(plainText("", "missing")).toBe("");
  });
});

describe("localized safe failures", () => {
  it.each([
    ["APPROVAL_EXPIRED", 400, "expired"],
    ["APPROVAL_NOT_PENDING", 400, "decided"],
    ["APPROVAL_ALREADY_DECIDED", 409, "decided"],
    ["RUN_NOT_WAITING", 400, "notWaiting"],
    ["AGENT_UNAVAILABLE", 400, "unavailable"],
    ["MODEL_UNAVAILABLE", 400, "unavailable"],
    ["RESUME_STATE_CORRUPT", 400, "context"],
    ["GRANT_REVOKED", 400, "revoked"],
    ["INVALID_INPUT", 400, "invalid"],
    ["OTHER", 403, "denied"],
    ["OTHER", 401, "session"],
    ["OTHER", 404, "notFound"],
  ])("maps %s and always retains the request reference", (code, status, key) => {
    const failure = approvalFailure(
      new ApiError(code as string, status as number, "secret raw message", "ref-1"),
      true,
    );
    expect(failure).toMatchObject({ key, requestId: "ref-1", unknownOutcome: false });
    expect(JSON.stringify(failure)).not.toContain("secret");
  });
  it("reports unknown decision outcomes, not automatic retry advice", () => {
    expect(approvalFailure(new NetworkError(), true)).toMatchObject({
      key: "outcomeUnknown",
      requestId: null,
      unknownOutcome: true,
    });
    expect(approvalFailure(new ApiError("INTERNAL", 500, "raw", "ref"), true)).toMatchObject({
      key: "outcomeUnknown",
      requestId: "ref",
    });
    expect(approvalFailure(new NetworkError())).toMatchObject({
      key: "load",
      unknownOutcome: false,
    });
  });
});
