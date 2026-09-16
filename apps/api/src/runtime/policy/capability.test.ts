import { describe, expect, it } from "vitest";
import {
  decideCapability,
  maxRiskTier,
  type CapabilityInput,
  type ContextTrustLevel,
  type RiskTier,
} from "./capability.js";

describe("decideCapability (threat-model C2 matrix)", () => {
  const trusts: ContextTrustLevel[] = ["trusted", "user_input", "untrusted"];
  const tiers: RiskTier[] = ["read_only", "reply", "write", "admin"];

  it("covers all twelve cells without throwing", () => {
    for (const contextTrust of trusts) {
      for (const riskTier of tiers) {
        const input: CapabilityInput = {
          contextTrust,
          riskTier,
          agentHasGrant: true,
          requestingUserHasGrant: true,
        };
        expect(() => decideCapability(input)).not.toThrow();
      }
    }
  });

  it.each([
    { contextTrust: "trusted", riskTier: "read_only", decision: "allowed" },
    { contextTrust: "trusted", riskTier: "reply", decision: "allowed" },
    { contextTrust: "trusted", riskTier: "write", decision: "allowed" },
    { contextTrust: "trusted", riskTier: "admin", decision: "denied" },
    { contextTrust: "user_input", riskTier: "read_only", decision: "allowed" },
    { contextTrust: "user_input", riskTier: "reply", decision: "allowed" },
    // user_input x write resolved below with the requesting-user conditional;
    // with the user grant present it allows.
    { contextTrust: "user_input", riskTier: "admin", decision: "denied" },
    { contextTrust: "untrusted", riskTier: "read_only", decision: "allowed" },
    { contextTrust: "untrusted", riskTier: "reply", decision: "allowed" },
    { contextTrust: "untrusted", riskTier: "write", decision: "approval_required" },
    { contextTrust: "untrusted", riskTier: "admin", decision: "denied" },
  ] as const)(
    "granted $contextTrust x $riskTier -> $decision",
    ({ contextTrust, riskTier, decision }) => {
      const result = decideCapability({
        contextTrust,
        riskTier,
        agentHasGrant: true,
        requestingUserHasGrant: true,
      });
      expect(result.decision).toBe(decision);
    },
  );

  it("user_input x write allows only when the requesting user also holds it", () => {
    const base: CapabilityInput = {
      contextTrust: "user_input",
      riskTier: "write",
      agentHasGrant: true,
    };

    expect(decideCapability({ ...base, requestingUserHasGrant: true })).toEqual({
      decision: "allowed",
      reason: "write-allowed-by-requesting-user-grant",
    });
    expect(decideCapability({ ...base, requestingUserHasGrant: false }).decision).toBe("denied");
    expect(decideCapability({ ...base, requestingUserHasGrant: false }).reason).toBe(
      "write-denied-requesting-user-lacks-grant",
    );
    // Fail closed: omitted flag is not held.
    expect(decideCapability(base).decision).toBe("denied");
    expect(decideCapability(base).reason).toBe("write-denied-requesting-user-lacks-grant");
  });

  it("denies admin in every row even when the agent holds the grant (R3 defense in depth)", () => {
    for (const contextTrust of trusts) {
      const result = decideCapability({
        contextTrust,
        riskTier: "admin",
        agentHasGrant: true,
        requestingUserHasGrant: true,
      });
      expect(result).toEqual({ decision: "denied", reason: "admin-tier-unreachable-in-run" });
    }
  });

  it("denies every cell when the agent lacks the grant", () => {
    for (const contextTrust of trusts) {
      for (const riskTier of tiers) {
        const result = decideCapability({
          contextTrust,
          riskTier,
          agentHasGrant: false,
          requestingUserHasGrant: true,
        });
        expect(result).toEqual({ decision: "denied", reason: "agent-missing-grant" });
      }
    }
  });

  it("asserts reasons, not just outcomes", () => {
    expect(
      decideCapability({ contextTrust: "trusted", riskTier: "read_only", agentHasGrant: true }),
    ).toEqual({ decision: "allowed", reason: "read-only-allowed-at-trust" });
    expect(
      decideCapability({ contextTrust: "untrusted", riskTier: "reply", agentHasGrant: true }),
    ).toEqual({ decision: "allowed", reason: "reply-allowed-at-trust" });
    expect(
      decideCapability({ contextTrust: "trusted", riskTier: "write", agentHasGrant: true }),
    ).toEqual({ decision: "allowed", reason: "write-allowed-at-trust" });
    expect(
      decideCapability({ contextTrust: "untrusted", riskTier: "write", agentHasGrant: true }),
    ).toEqual({
      decision: "approval_required",
      reason: "write-requires-approval-on-untrusted",
    });
  });
});

describe("maxRiskTier", () => {
  it("returns the higher tier so tool.execute never dilutes a tool risk_tier", () => {
    expect(maxRiskTier("read_only", "write")).toBe("write");
    expect(maxRiskTier("write", "read_only")).toBe("write");
    expect(maxRiskTier("reply", "read_only")).toBe("reply");
    expect(maxRiskTier("write", "admin")).toBe("admin");
    expect(maxRiskTier("read_only", "read_only")).toBe("read_only");
  });
});
