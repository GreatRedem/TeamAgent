import { ApiError } from "../../lib/api.js";
import {
  APPROVAL_STATUSES,
  APPROVAL_TRUST_LEVELS,
  type ApprovalFilters,
  type ApprovalView,
} from "../../lib/approvals.js";

export function plainText(value: unknown, unavailable: string): string {
  if (value === null || value === undefined) return unavailable;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? unavailable;
  } catch {
    return unavailable;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function timestamp(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || Number(value.slice(11, 13)) > 23)
    return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

export function expiryState(approval: ApprovalView, now: number): "invalid" | "elapsed" | "open" {
  const expires = timestamp(approval.expires_at);
  return expires === null ? "invalid" : expires <= now ? "elapsed" : "open";
}

export function actionContext(approval: ApprovalView) {
  const action = approval.proposed_action;
  if (!record(action)) return null;
  if (!nonempty(action.tool) || !["read_only", "reply", "write"].includes(String(action.risk_tier)))
    return null;
  if (!record(action.arguments)) return null;
  if (action.resolved_destination !== null && !nonempty(action.resolved_destination)) return null;
  return {
    tool: action.tool,
    tier: action.risk_tier as "read_only" | "reply" | "write",
    arguments: action.arguments,
    destination: action.resolved_destination as string | null,
  };
}

export function safeContext(approval: ApprovalView): boolean {
  return (
    actionContext(approval) !== null &&
    nonempty(approval.id) &&
    nonempty(approval.run_id) &&
    nonempty(approval.tool_call_id) &&
    nonempty(approval.agent?.id) &&
    APPROVAL_TRUST_LEVELS.some((trust) => trust === approval.context_trust_level)
  );
}

export function canDecide(approval: ApprovalView, now: number): boolean {
  return approval.status === "pending" && expiryState(approval, now) === "open";
}

export function actionable(approval: ApprovalView, now: number): boolean {
  return canDecide(approval, now) && safeContext(approval);
}

export function pendingCount(approvals: ApprovalView[], now: number): number {
  return approvals.filter((approval) => actionable(approval, now)).length;
}

const REASONS: Record<string, string> = {
  "write-requires-approval-on-untrusted": "untrustedWrite",
  "agent-missing-grant": "missingGrant",
  "admin-tier-unreachable-in-run": "admin",
  "read-only-allowed-at-trust": "read",
  "reply-allowed-at-trust": "reply",
  "write-allowed-at-trust": "write",
  "write-allowed-by-requesting-user-grant": "userGrant",
  "write-denied-requesting-user-lacks-grant": "userDenied",
};

export function reasonKey(reason: string | null): string {
  return reason !== null && Object.hasOwn(REASONS, reason) ? REASONS[reason] : "unknown";
}

export function knownStatus(status: string): string {
  return APPROVAL_STATUSES.some((value) => value === status) ? status : "unknown";
}

export function knownTrust(trust: string | null): string {
  return APPROVAL_TRUST_LEVELS.some((value) => value === trust) ? trust! : "unknown";
}

export function groupApprovals(approvals: ApprovalView[], filters: ApprovalFilters) {
  const groups = new Map<string | null, ApprovalView[]>();
  const sorted = approvals
    .filter(
      (approval) =>
        (filters.status === undefined || approval.status === filters.status) &&
        (filters.context_trust_level === undefined ||
          approval.context_trust_level === filters.context_trust_level) &&
        (filters.agent_id === undefined || approval.agent?.id === filters.agent_id),
    )
    .sort((a, b) => (timestamp(a.expires_at) ?? Infinity) - (timestamp(b.expires_at) ?? Infinity));
  for (const approval of sorted) {
    const key = approval.decision_reason ?? null;
    const group = groups.get(key) ?? [];
    group.push(approval);
    groups.set(key, group);
  }
  return Array.from(groups, ([cause, records]) => ({ cause, records }));
}

export interface ApprovalFailure {
  key: string;
  requestId: string | null;
  denied: boolean;
  unknownOutcome: boolean;
}

export function approvalFailure(caught: unknown, decision = false): ApprovalFailure {
  const api = caught instanceof ApiError ? caught : null;
  const codes: Record<string, string> = {
    APPROVAL_EXPIRED: "expired",
    APPROVAL_NOT_PENDING: "decided",
    APPROVAL_ALREADY_DECIDED: "decided",
    RUN_NOT_WAITING: "notWaiting",
    AGENT_UNAVAILABLE: "unavailable",
    MODEL_UNAVAILABLE: "unavailable",
    RESUME_STATE_CORRUPT: "context",
    GRANT_REVOKED: "revoked",
    INVALID_INPUT: "invalid",
  };
  const denied = api?.status === 403;
  const unknownOutcome = decision && (api === null || api.status >= 500);
  const key = unknownOutcome
    ? "outcomeUnknown"
    : denied
      ? "denied"
      : api?.status === 401
        ? "session"
        : api?.status === 404
          ? "notFound"
          : api && Object.hasOwn(codes, api.code)
            ? codes[api.code]
            : decision
              ? "decisionFailed"
              : "load";
  return { key, requestId: api?.requestId ?? null, denied, unknownOutcome };
}
