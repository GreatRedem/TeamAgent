import type { Http } from "./http.js";
import { teamPath } from "./agents.js";

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
export const APPROVAL_TRUST_LEVELS = ["trusted", "user_input", "untrusted"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ApprovalTrust = (typeof APPROVAL_TRUST_LEVELS)[number];

export interface ApprovalView {
  id: string;
  status: string;
  run_id: string | null;
  agent: { id: string; name: string | null } | null;
  proposed_action: unknown;
  context_trust_level: string | null;
  triggering_content: string | null;
  triggering_origin: unknown;
  expires_at: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  trace_id: string | null;
  tool_call_id: string | null;
  decision_reason: string | null;
}

export interface ApprovalFilters {
  status?: ApprovalStatus;
  agent_id?: string;
  context_trust_level?: ApprovalTrust;
}

export interface ApprovalOutcome {
  run_id: string;
  status: string;
  trace_id: string;
}

export interface RejectionOutcome {
  run_id: string;
  status: "denied";
}

export function approvalPath(teamId: string, approvalId?: string): string {
  return `${teamPath(teamId)}/approvals${approvalId === undefined ? "" : `/${encodeURIComponent(approvalId)}`}`;
}

export function listApprovals(
  http: Http,
  teamId: string,
  filters: ApprovalFilters = {},
): Promise<{ approvals: ApprovalView[] }> {
  return http.request("GET", approvalPath(teamId), { query: { ...filters } });
}

export function getApproval(http: Http, teamId: string, approvalId: string): Promise<ApprovalView> {
  return http.request("GET", approvalPath(teamId, approvalId));
}

export function approveApproval(
  http: Http,
  teamId: string,
  approvalId: string,
): Promise<ApprovalOutcome> {
  return http.request("POST", `${approvalPath(teamId, approvalId)}/approve`, { body: {} });
}

export function rejectApproval(
  http: Http,
  teamId: string,
  approvalId: string,
  reason?: string,
): Promise<RejectionOutcome> {
  return http.request("POST", `${approvalPath(teamId, approvalId)}/reject`, {
    body: reason === undefined || reason === "" ? {} : { reason },
  });
}
