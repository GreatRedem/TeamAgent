/**
 * Trust-gated capability decision (threat-model C2).
 *
 * Answers: given the agent's grants and the effective trust level of the
 * run's context, may this call execute now, need a human approval, or be
 * denied?
 *
 * This is a pure function by design (docs/16-backend-architecture.md
 * `runtime/policy/`): no database, no network, no clock. The single caller
 * that matters is the tool runtime, immediately before execution.
 * Configuration-time checks are advisory; this runtime check is the boundary.
 *
 * Decision matrix (docs/17-threat-model.md C2):
 *
 * | Context trust | read_only | reply | write                              | admin |
 * |---------------|-----------|-------|------------------------------------|-------|
 * | trusted       | allow     | allow | allow                              | deny  |
 * | user_input    | allow     | allow | allow iff requesting user holds it | deny  |
 * | untrusted     | allow     | allow | approval_required                  | deny  |
 *
 * The `admin` column denies in every row, including `trusted`. That is
 * deliberate defense in depth alongside invariant R3 (no agent may hold an
 * admin-tier grant): this function must evaluate the cell rather than treat
 * it as unreachable, so a bypassed R3 still cannot execute.
 */

export type ContextTrustLevel = "trusted" | "user_input" | "untrusted";
export type RiskTier = "read_only" | "reply" | "write" | "admin";
export type PolicyDecision = "allowed" | "denied" | "approval_required";

export interface CapabilityInput {
  /** Effective context trust: minimum over all content in the context. */
  contextTrust: ContextTrustLevel;
  /**
   * Effective risk tier of the proposed action. When a tool call is gated by
   * both `tool.execute` and the tool's own `risk_tier`, pass the higher of
   * the two (see `maxRiskTier`); holding `tool.execute` alone never
   * authorizes a write-tier tool (docs/07-permission.md).
   */
  riskTier: RiskTier;
  /** Whether the agent holds an explicit grant for this action. */
  agentHasGrant: boolean;
  /**
   * Whether the requesting human holds the same action on their own rights.
   * Only read for the `user_input` x `write` cell; `undefined` is treated as
   * "not held" (fail closed).
   */
  requestingUserHasGrant?: boolean;
}

export interface CapabilityResult {
  decision: PolicyDecision;
  /** Machine-readable reason; asserted in tests, surfaced in tool_calls. */
  reason: CapabilityReason;
}

export type CapabilityReason =
  | "agent-missing-grant"
  | "admin-tier-unreachable-in-run"
  | "read-only-allowed-at-trust"
  | "reply-allowed-at-trust"
  | "write-allowed-at-trust"
  | "write-allowed-by-requesting-user-grant"
  | "write-denied-requesting-user-lacks-grant"
  | "write-requires-approval-on-untrusted";

const TIER_RANK: Record<RiskTier, number> = {
  read_only: 0,
  reply: 1,
  write: 2,
  admin: 3,
};

/**
 * Effective tier for a tool call gated by two grants: the higher of the
 * permission tier and the tool's own `risk_tier`. Pure helper so callers
 * cannot accidentally pass only the lower tier.
 */
export function maxRiskTier(a: RiskTier, b: RiskTier): RiskTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function decideCapability(input: CapabilityInput): CapabilityResult {
  if (!input.agentHasGrant) {
    return { decision: "denied", reason: "agent-missing-grant" };
  }

  // Evaluated explicitly, never treated as dead code: even a fully trusted
  // run cannot exercise admin capability. Admin actions are performed by
  // humans against the API on a path that does not traverse the runtime.
  if (input.riskTier === "admin") {
    return { decision: "denied", reason: "admin-tier-unreachable-in-run" };
  }

  if (input.riskTier === "read_only") {
    return { decision: "allowed", reason: "read-only-allowed-at-trust" };
  }

  if (input.riskTier === "reply") {
    return { decision: "allowed", reason: "reply-allowed-at-trust" };
  }

  // Remaining tier: write.
  switch (input.contextTrust) {
    case "trusted":
      return { decision: "allowed", reason: "write-allowed-at-trust" };
    case "user_input":
      if (input.requestingUserHasGrant === true) {
        return { decision: "allowed", reason: "write-allowed-by-requesting-user-grant" };
      }
      return { decision: "denied", reason: "write-denied-requesting-user-lacks-grant" };
    case "untrusted":
      return { decision: "approval_required", reason: "write-requires-approval-on-untrusted" };
  }
}
