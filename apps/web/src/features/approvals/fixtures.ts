import type { ApprovalView } from "../../lib/approvals.js";

export function approval(patch: Partial<ApprovalView> = {}): ApprovalView {
  return {
    id: "approval-1",
    status: "pending",
    run_id: "run-1",
    agent: { id: "agent-1", name: "Agent" },
    proposed_action: {
      tool: "email.send",
      risk_tier: "write",
      arguments: { to: "requested" },
      resolved_destination: "requested",
    },
    context_trust_level: "untrusted",
    triggering_content: "Last user message",
    triggering_origin: { origin: null, ingress_trust: "untrusted", actor_type: "user" },
    expires_at: "2099-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    decided_by: null,
    decided_at: null,
    trace_id: "trace-1",
    tool_call_id: "call-1",
    decision_reason: "write-requires-approval-on-untrusted",
    ...patch,
  };
}
