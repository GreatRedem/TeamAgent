---
name: agent-security
description: "Use when implementing or reviewing agent runtime policy, prompt injection containment, trust propagation, tool permissions, approvals, destination allowlists, or secret handling in NuraAI."
---

# NuraAI Agent Security

Use `docs/17-threat-model.md`, `docs/12-security.md`, and `docs/06-tool.md` as the controlling design.

## Rules

- Treat model output and all tool output as untrusted.
- Compute effective context trust as the minimum trust of all inputs; trust never recovers downstream.
- Gate capabilities by both agent grants and context trust.
- Allow read-only and reply-to-origin actions according to policy; require approval for untrusted write actions and deny admin actions.
- Resolve outbound destinations from explicit allowlists. Never let the model invent or fuzzy-match destinations.
- Validate model-generated tool arguments against strict schemas before execution.
- Resolve credentials inside the tool runtime after arguments are validated; never place secret values in prompts, logs, traces, or persisted run records.
- Write a provenance-aware tool-call record before execution, including denied and approval-required attempts.
- Enforce budgets, timeouts, cancellation, and idempotency.

## Test the boundary

Do not test whether a model refuses an injection. Feed successful injection-shaped output into the runtime and assert that writes require approval, destinations stay allowlisted, trust remains untrusted, and every attempt is audited.
