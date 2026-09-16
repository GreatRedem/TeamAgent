# Implementation Roadmap and Engineering Guide

This document turns the domain model into a practical delivery plan for building NuraAI in phases.

## What cannot be deferred

Phases are an ordering, not a licence to postpone the trust model. `docs/14-database.md` puts it plainly: the permission and provenance tables are the product's value proposition, not a hardening pass to apply later.

Three things must land **with** the feature they protect, never after it:

| Land this | With this | Because |
|---|---|---|
| `risk_tier` on every permission and tool | The tool layer, Phase 3 | Retrofitting a tier onto tools already in use means auditing every existing grant, and a tool with no tier cannot be safely defaulted (`docs/17-threat-model.md` C2) |
| Trust labelling and propagation | The agent runtime, Phase 4 | `context_trust_level` threads through context assembly, every tool result, and every step boundary. Adding it later is a rewrite of the runtime's core loop, not a new field |
| `allowed_destinations` and `can_initiate` | The first egress capability, Phase 3 | An agent that can send before the allowlist exists is the confused deputy, shipped (`docs/17` C3) |

The same is true of `trace_id` and the structured log fields, noted under Phase 7 below.

An MVP without these is not an MVP of this product. It is a chatbot with a database.

## Phase 1: Foundation

### Goals
- Create repository structure and basic configuration.
- Define core domain entities.
- Implement database schema for user, team, agent, source, and permissions.
- Prepare testing and CI baseline.

### Deliverables
- project structure
- environment configs, validated at startup
- base models and repositories
- migration tooling
- health check endpoints: liveness, readiness, startup
- test harness on PGlite, with the migration-drift check and the CI security stage in place

See `docs/21-testing.md` and `docs/22-observability.md`.

## Phase 2: Identity and Team Model

### Goals
- Support users, teams, roles, and membership.
- Add login and session handling.
- Implement access control and policy evaluation.

### Deliverables
- auth service
- team management APIs
- role assignments
- permission checks in middleware
- membership audit logging

## Phase 3: Source and Tool Layer

### Goals
- Register sources and connections.
- Support safe tool execution.
- Add explicit source ownership and scopes.
- Establish the risk tiering and egress allowlists the runtime will enforce in Phase 4.

### Deliverables
- source registry
- connector adapter framework
- tool schema validation, with the narrowest usable types (`docs/17-threat-model.md` C7)
- `risk_tier` on every tool, `NOT NULL` with no default
- `agent_sources` with `can_initiate` and `allowed_destinations`, plus invariant R4 as a CHECK and a test that attempts the forbidden write
- webhook signature verification and replay rejection at ingress (T7)
- SSRF controls on HTTP and browser tools: resolve-then-connect, rebinding protection, private-range denial (C8)
- `tool_calls` written before execution and updated after
- source permission enforcement

## Phase 4: Agent Runtime

This is the phase where `docs/17-threat-model.md` stops being a document and becomes code. The capability matrix, trust propagation, and budgets are not a later hardening pass — they are the runtime's control flow, and the runtime cannot be built correctly twice.

### Goals
- Let teams create and configure agents.
- Attach models, tools, and knowledge.
- Support conversation and task execution.
- Enforce the trust-gated capability model at execution time.

### Deliverables
- agent CRUD APIs, including the grant endpoints for tools, knowledge, sources, and destinations
- invariant R3 as a trigger, with a test that attempts the forbidden write
- runtime session management
- model gateway integration
- prompt assembly with instruction/data separation and per-item provenance (C6)
- **the policy decision point in the tool runtime**, evaluating all twelve cells of the C2 matrix
- trust computation and propagation: minimum on assembly, recomputed after every tool result, never increasing
- per-run budgets — tokens, tool count, depth, wall clock — enforced by the runtime and not adjustable from inside a run (C10)
- approval requests, with the triggering content and its origin attached, and an expiry that denies (C5)
- destination resolution from the allowlist, after generation
- structured output handling

## Phase 5: Knowledge and Retrieval

### Goals
- Add knowledge ingestion and retrieval.
- Support document and URL sources.
- Filter results by access rules.

### Deliverables
- knowledge base storage
- chunk and embedding tables with `pgvector` — the gap named in `docs/14-database.md`
- ingestion pipeline, defaulting every item to `trust_level = untrusted`
- an explicit human action to mark an item trusted, recorded in `trusted_by` / `trusted_at`
- `ingested_from` and `ingested_by`, so a poisoned corpus is traceable after the fact (T3)
- retrieval service
- relevance ranking
- source-specific access checks

## Phase 6: Workflow Engine

### Goals
- Add event-driven automation.
- Support triggers, steps, branching, and outputs.
- Integrate with agents, tools, and sources.

### Deliverables
- workflow definitions, split into a stable `workflows` row and immutable `workflow_versions`
- a `job_schedules` table and a scheduler tick guarded by `pg_try_advisory_lock` — **no event bus and no broker**, per `docs/23-job-queue.md`
- execution state tracking per step, on `workflow_step_runs`
- trust inheritance across step boundaries: the minimum of a step's own inputs and every upstream step that fed it (T8)
- unattended runs restricted to the `read_only` and `reply` tiers, since no human is present for an approval gate
- retry and timeout policies, with idempotency keys, because a lease expiry reruns a job
- output routing

## Phase 7: Operational Visibility

**Safety is not in this phase.** It was distributed into Phases 3, 4, and 6, where the controls belong — a phase named "Observability and Safety" at the end of a roadmap is how a trust model becomes a backlog item. What remains here is seeing what the controls are doing, which is genuinely a later concern only in its presentation layer.

### Goals
- Improve operational health and traceability.
- Add logs, dashboarding, and alerts.
- Make the security controls from earlier phases observable.

### Deliverables
- distributed tracing, including propagation across the queue boundary, with a test asserting the worker span shares the enqueuer's `trace_id` **— implemented, including OTLP/HTTP span export behind `OTEL_EXPORTER_OTLP_ENDPOINT` (off when unset) and spans at the docs/22 boundaries (agent run, model call, retrieval, tool execution with decision attributes, worker job) via `observability/spans.ts`; tail-based sampling for denials/approvals remains the backend's policy**
- metrics and dashboards, including the security signal dashboard **— the security signal counters, RED per-route series, and a `/metrics` scrape endpoint (API and worker) are implemented; dashboards are not**
- alerts on the signals that should be zero in healthy operation — `refresh_token_reuse_total`, `cross_team_access_denied_total`, `destination_denied_total` **— the counters exist and emit zero-series; alert rules are defined in `docs/22` with triage procedures in `docs/26-runbook.md`; no alerting backend is wired**
- cost tracking and rate-of-change alerting **— token and model-call counters are emitted; the periodic rollup is implemented (`cost_rollups` table, hourly token totals per team/agent/model via the `jobs_cost_rollup` scheduled job); the rate-of-change alert rule itself remains alerting-backend work**
- error classification **— `error_name` / `error_code` fields on unhandled-error log lines are implemented**
- incident response playbook, with a runbook entry per page **— `docs/26-runbook.md`**
- policy review workflows

See `docs/22-observability.md`.

**Two things this phase depends on must exist from Phase 1.** `trace_id` and the structured log fields have to be threaded through as the code is written — retrofitting a correlation identifier across an existing codebase is far more expensive than carrying it from the start. And `audit_logs` is not a log line: it is a transactional write, never sampled, and it is written by the code in every earlier phase, not added here.

## Suggested Development Standards

- Use explicit schemas for inputs and outputs.
- Treat external integrations as potentially unreliable.
- Enforce permission checks in every runtime boundary.
- Log all sensitive actions.
- Keep agent logic deterministic when possible.
- Favor small, testable services over a large monolith at the beginning.

## Recommended MVP Scope

An initial viable product can include:
- user and team model, with wallet sign-in
- agent creation, with explicit tool, knowledge, and source grants
- single model provider integration
- one or two source integrations
- tool execution behind the trust-gated policy decision point
- destination allowlists on every egress-capable agent
- knowledge base with retrieval, items defaulting to `untrusted`
- simple linear workflow automation
- approval gates for write-tier actions on untrusted context
- audit logs and `tool_calls`

This MVP is enough to validate the product while keeping security and architecture clean.

What can genuinely wait: multi-provider model routing, branching and conditional workflows, semantic retrieval quality, the full connector catalogue, dashboards, and cost analytics. What cannot is the table above — the trust model is what distinguishes this product from a chatbot with a database, so an MVP that defers it is not an MVP of this product.

## Suggested Next Steps

Steps 1–7 are done — the domain model is settled, `docs/19-tech-stack.md` closes the stack, `docs/14-database.md` is the schema reference, and phases 1–7 are implemented and tested (including workflow schedule triggers, the scheduler tick, queue-boundary rules, operational metrics and traces, cost rollups, and injection containment). What remains is production hardening and the presentation layer: deployment automation, dashboards, alerting-backend wiring, and tail-based trace sampling.

1. ~~Scaffold the backend, with environment validation at startup and health checks.~~ **Done.**
2. ~~Generate the first migrations from the Drizzle schema modules, including the R1–R5 constraints, and stand up the PGlite test loop.~~ **Done.**
3. ~~Implement wallet auth and team membership, with the W1–W8 tests.~~ **Done.**
4. ~~Seed the permission catalogue with tiers, and implement the C2 policy decision as a pure function with all twelve cells tested — before anything calls a model.~~ **Done.**
5. ~~Add a minimal agent runtime and one source integration, with the policy decision point wired into the tool path from the first commit.~~ **Done.**
6. ~~Validate the first workflow and knowledge retrieval path, including trust inheritance across steps.~~ **Done.**
7. ~~Run the injection containment suite against every ingress path, then expand.~~ **Done.** The payload corpus (`src/security/corpus.ts`) runs through every existing ingress — untrusted API-key submission, user_input-ceiling keys (T16), interactive relay, retrieved knowledge (T3), and tool output (T4) — with the containment invariants asserted against persisted rows, plus the webhook HMAC gate (T7). "Then expand" is standing: new ingress paths add their corpus case in `src/security/injection.test.ts`.

Step 4 before step 5 is deliberate. The capability matrix is a pure function with no I/O — it should be the fastest test in the suite and it should exist before there is a runtime to bolt it onto.

## Final Recommendation

The best path is to treat NuraAI as a secure orchestration platform, not only as a chatbot shell. Build the foundational trust model early, then layer agent runtime, tools, knowledge, and workflows on top of it.

That ordering reduces rework and produces a much safer system in production.
