# Observability and Monitoring

`docs/11-runtime.md` and `docs/16-backend-architecture.md` state that every execution must be traceable and every sensitive action auditable. This document is the concrete version: what to emit, what to alert on, and what must never be recorded.

## Observability is not the audit log

These are two systems with two purposes, and merging them produces one that is bad at both.

| | Observability | Audit log |
|---|---|---|
| Question | Is the system healthy? Why was this slow? | Who did what, and was it permitted? |
| Consumers | Engineers, on call | Admins, compliance, incident response |
| Store | Logs, metrics, traces backend | `audit_logs` in the primary database |
| Retention | Days to weeks | Months to years, per policy |
| Sampling | Expected and fine | **Never** |
| Loss tolerance | Acceptable | Not acceptable |
| Access | Broad engineering access | Restricted, itself audited |
| Written by | Everything | The runtime, from the actual execution path |

The practical consequence: **an audit record is never a log line.** `audit_logs` and `tool_calls` are transactional writes in the primary database. If the observability pipeline drops a span, you lose a debugging aid; if it drops an audit record, you lose the ability to answer what happened, and sampling would make that routine.

Emit both. Correlate them with `trace_id`, which already exists on `agent_runs`, `workflow_runs`, `workflow_step_runs`, `tool_calls`, and `audit_logs`.

## Correlation identifiers

Three, with different lifetimes:

- **`request_id`** — one HTTP request. Already in the API response envelope (`docs/15-api.md`).
- **`trace_id`** — one logical operation end to end, across the queue and into workers. This is the one that matters.
- **`run_id`** — an `agent_runs` or `workflow_runs` row.

Every log line, span, and database execution record carries all three that apply.

### The queue boundary is where tracing breaks

Trace context propagates through HTTP automatically. It does **not** propagate through a job queue unless you put it there deliberately.

A workflow trigger produces an API span; the worker that actually runs the agent, calls the model, and sends the message produces an entirely separate trace. The interesting half of the operation — every model call, every tool execution, every egress — ends up disconnected from the request that caused it. When an incident asks "what did this inbound message actually do," the answer is two unlinked traces and a guess.

Inject the trace context into the job payload on enqueue and restore it on dequeue, for every queue in the system. Then assert it: a test that enqueues a job and checks that the worker's span shares the enqueuer's `trace_id`. This breaks silently and is worth a test.

## Structured logs

JSON, one object per line, no string interpolation of variable data.

| Field | Notes |
|---|---|
| `timestamp` | UTC, ISO 8601 |
| `level` | |
| `message` | Constant string. Variable data goes in fields, so lines stay groupable. |
| `service` | `api`, `worker`, `scheduler` |
| `trace_id`, `request_id` | |
| `team_id` | Present on every tenant-scoped operation |
| `actor_type`, `actor_id` | `user`, `agent`, `system`, `api_key` |
| `ingress` | How the work entered: `interactive`, `source`, `webhook`, `schedule`, `api_key`. Pairs with `context_trust_level` to answer where untrusted work came from |
| `run_id`, `agent_id`, `workflow_id` | Where applicable |
| `context_trust_level` | On anything in an agent execution path |
| `error.code`, `error.type`, `error.stack` | Codes from the taxonomy in `docs/16-backend-architecture.md` |
| `duration_ms` | On completion lines |

`context_trust_level` on execution log lines is worth the column. It makes "show me everything that happened under untrusted context in the last hour" a filter rather than a join.

`ingress` earns its place next to it for the same reason in reverse: trust level tells you how dangerous the work was, `ingress` tells you where it came in. During an incident the second question follows the first immediately, and without the field it is a join across `agent_runs`, `jobs`, and whichever source table applies.

## What must never be recorded

This is a control, not a style preference. `docs/17-threat-model.md` T9 is specifically about secrets reaching logs and traces, from where they leave the tenant boundary entirely.

**Never:**

- secret values of any kind — resolved credentials, API keys, tokens, `*_ref` targets
- `Authorization` headers, refresh tokens, session material
- full prompts or model completions at `info` level
- knowledge item content
- inbound message bodies
- wallet signatures

**Redaction must be structural, not a list of key names.** A denylist of field names fails the moment a secret arrives nested inside an error object or a config blob — which is the realistic way this happens. Use an allowlist for anything derived from configuration, and run the sentinel-scan test from `docs/21-testing.md` in CI.

Prompt and completion content is the subtle one. It is enormously useful for debugging and it contains the tenant's private data plus anything an attacker injected. If it is captured at all, it belongs in `agent_runs` and `tool_calls` under the audit system's retention and access rules — not in a log aggregator that the whole engineering team can query and that ships to a third party.

## Metrics

### Service health

Standard RED per route and per worker: request rate, error rate, duration histogram.

The queue is a table in this same database (`docs/23-job-queue.md`), so nothing emits its metrics for you — they come from queries against `jobs`: `queue_depth` and `jobs_table_rows` are read at scrape time (`observability/queue.ts`), and the rate counters are emitted by the worker as jobs reach terminal states.

| Metric | Why |
|---|---|
| `queue_depth{queue,status}` | Backlog. The earliest indicator that something is wrong in an async system |
| `queue_wait_seconds` | Enqueue to claim. Rising wait with flat depth means too few workers |
| `job_duration_seconds{queue}` | |
| `jobs_total{queue,status}` | |
| `job_retries_total{queue}` | |
| `jobs_dead_total{queue}` | Exhausted `max_attempts` — always worth a look |
| `jobs_reclaimed_total` | Leases expired and reaped. A steady non-zero rate means workers are dying, or the lease is shorter than real job duration |
| `jobs_table_rows` | Cleanup health. Unbounded growth degrades the claim index and drives vacuum pressure |

`jobs_reclaimed_total` deserves attention out of proportion to its name. Every reclaim is a job that ran at least partly and will run again — duplicate messages, duplicate writes, duplicate token spend. A rate above roughly zero means either the lease is mistuned for long agent runs or workers are being killed.

### Domain

| Metric | Why |
|---|---|
| `agent_runs_total{status}` | Baseline throughput and failure rate |
| `agent_run_duration_seconds` | |
| `tool_calls_total{tool,decision}` | `decision` is the security-relevant dimension |
| `model_calls_total{provider,model,status}` | |
| `model_call_duration_seconds{provider}` | Provider degradation, usually the first thing to break |
| `tokens_consumed_total{provider,model,direction}` | Cost |
| `run_budget_exceeded_total{limit_type}` | C10 enforcement firing |
| `knowledge_retrievals_total{trust_level}` | |
| `workflow_runs_total{status,trigger_source}` | |

### Security signals

The interesting ones. These are the observable signature of the threat model's failure modes, and they are what turn `docs/17-threat-model.md` from a document into something operationally live.

| Metric | What a spike means |
|---|---|
| `tool_calls_total{decision="denied"}` | Something is repeatedly attempting what it is not permitted to do. Either a misconfigured agent or an active injection attempt. |
| `approval_requests_total{context_trust_level="untrusted"}` | Untrusted content is driving write-tier actions. The control is working, and something is pushing on it. |
| `destination_denied_total` | A model proposed a destination outside the allowlist — C3 doing its job. This should be near zero in normal operation, which makes any non-zero rate meaningful. |
| `auth_failures_total{reason}` | `domain_mismatch` in particular means someone is attempting W2 phishing against your domain. |
| `refresh_token_reuse_total` | Token theft detected. Should be exactly zero. |
| `eip1271_failures_total` | W4. RPC degradation, or an attack on the verification path. |
| `agent_permission_grant_rejected_total` | R3 firing — something tried to give an agent admin capability. |
| `cross_team_access_denied_total` | Isolation check rejecting a request. Should be zero; anything else is a bug or a probe. |
| `runs_total{ingress,trust_level}` | Where work enters and at what trust. A key-authenticated ingress that starts producing `user_input` runs it did not produce before means a ceiling was raised — legitimately or not. |
| `apikey_trust_ceiling_raised_total` | A key was issued or changed to `user_input`. This is the one lever that moves work out of the `untrusted` row of the capability matrix, so every occurrence deserves a human look. |
| `apikey_auth_failures_total{reason}` | Revoked, expired, or unknown key presented. A spike on a revoked key means an integration was not migrated, or a leaked key is still being tried. |

Several of these should be **zero in healthy operation**. Those are the most valuable alerts in the system, because the signal-to-noise ratio is perfect — any non-zero value is worth a human look.

### Cost

Cost is a security property when inference is billed per token, and an injected agent in a tool loop is a financial incident. Track token spend and estimated cost by team, agent, model, and provider. `agent_runs.token_usage` and `cost_estimate` already carry the data.

Alert on *rate of change*, not absolute value. A team's spend tripling in an hour is the signal; a large team with a large bill is not.

### Cardinality

**Do not put `team_id` on Prometheus metrics.** Nor `agent_id`, `user_id`, or `run_id`.

A time series is created for every unique label combination. `team_id` on a handful of metrics across a few thousand teams is millions of series, and it will take down the metrics backend before it takes down the application. This is one of the most common ways a well-intentioned observability setup becomes an outage.

Keep metric labels low-cardinality and bounded — status, decision, tier, provider, route. High-cardinality dimensions belong in logs and traces, which are built for it, and per-team aggregates belong in a periodic rollup written to the database rather than in the metrics system.

## Tracing

Span the boundaries that can be slow or can fail:

```
HTTP request
  authenticate (token verify, principal context load)
  authorize    (permission resolution)
  handler
    repository query
    enqueue job                    <- inject trace context here
--- queue boundary ---
worker job                          <- restore trace context here
  agent run
    assemble context
    knowledge retrieval
    model call                      <- provider, model, tokens, latency
    policy decision                 <- trust level, tier, decision, reason
    tool execution                  <- tool, duration, outcome
    egress                          <- destination resolution
```

Span attributes carry `team_id`, `trust_level`, `decision`, `provider` — traces handle high cardinality, unlike metrics.

<!-- Implemented: apps/api/src/observability/spans.ts exposes withSpan(), built on the global
     OTel API so call sites are unconditional (no-op without OTEL_EXPORTER_OTLP_ENDPOINT). Every
     span carries the ambient trace_id/request_id as attributes, joining spans to the transactional
     records (agent_runs, tool_calls, audit_logs) that share the correlation id. Wired at: agent
     run (modules/agents/runs.ts), model call + knowledge retrieval + per-iteration
     (runtime/agent-runtime/loop.ts), tool execution with the docs/22 decision attributes
     (modules/tools/runtime.ts), worker job (modules/jobs/worker.ts). Spans are asserted against a
     real SDK pipeline in observability/spans.test.ts — nesting, attributes, error status, and the
     queue-boundary trace_id. Span export itself: observability/tracing.ts. Outstanding: span
     export is a presentation layer — dashboards/alerting on traces, and tail sampling, remain
     backend-side decisions. -->

Sample aggressively for healthy traffic, but **always keep traces that contain a denial, an approval, a budget termination, or an error**. Tail-based sampling if the backend supports it. A trace of a successful, boring run is worth little; the trace of the one that got denied is the whole investigation.

## Alerts

Three tiers. Most things are not pages.

**Page** — user-visible or actively unsafe:

- API error rate above threshold, sustained
- queue depth growing without bound, or worker pool stalled
- database unreachable
- `refresh_token_reuse_total` above zero (confirmed token theft)
- `cross_team_access_denied_total` above zero (isolation breach or probe)
- team cost rate above a hard ceiling

**Ticket** — investigate within a day:

- elevated `tool_calls_total{decision="denied"}` for a single agent or team
- elevated `auth_failures_total{reason="domain_mismatch"}`
- `eip1271_failures_total` elevated
- provider latency degraded
- approval requests aging past their expiry without a decision
- dead-letter queue non-empty

**Dashboard only** — no alert:

- throughput, latency distributions, token consumption trends
- trust-level distribution across runs
- per-team usage

Every page needs a runbook entry saying what to check and what to do. A page with no runbook becomes a page that gets ignored, and then a page that gets silenced. The triage procedures for these pages live in `docs/26-runbook.md`.

## Dashboards

Four, each answering one question:

1. **Service health** — RED metrics, queue depth, worker saturation, dependency latency.
2. **Execution** — run volume and outcomes, model latency by provider, tool call outcomes, workflow success rate.
3. **Security** — the signals table above. Denials, approvals, destination rejections, auth failures, invariant rejections. This is the dashboard to open when something feels wrong.
4. **Cost** — token spend and estimated cost by team, agent, model; budget terminations; rate of change.

## SLOs

Set them on the interactive path, where a human is waiting:

- API availability, excluding model provider failures, which are a separate dependency SLO
- API latency for non-agent endpoints
- time to first token or acknowledgement for an agent run
- workflow trigger to execution start

Long-running agent work does not fit a latency SLO well. Track completion rate and queue wait instead, and hold the provider to its own separate objective — if it is folded into yours, a provider outage burns your error budget for something you cannot fix.

## Health checks

- **Liveness** — the process is running. No dependency checks. A liveness probe that fails on a database blip restarts healthy processes during an incident and turns a degradation into an outage.
- **Readiness** — dependencies reachable, migrations applied, configuration valid. Fails a rolling deploy before it takes traffic.
- **Startup** — validate the environment contract from `docs/19-tech-stack.md` and exit on failure. A missing `JWT_SECRET` or a mismatched `SIWE_DOMAIN` should stop the process, not surface as a broken login later.

## Retention

| Data | Retention | Note |
|---|---|---|
| Logs | 14–30 days | Sampled, no secrets |
| Traces | 7–14 days | Tail-sampled, errors and denials kept |
| Metrics | 13 months | Downsampled; needed for year-over-year |
| `audit_logs` | Per policy, long | Never sampled, never deleted on a schedule alone |
| `tool_calls` | Open question | Richest forensic data *and* the most sensitive payloads — see `docs/14-database.md` |

`tool_calls` retention intersects the unresolved GDPR-erasure-versus-audit question. It needs a decision before launch, not after the first deletion request.
