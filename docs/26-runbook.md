# Incident Runbook

The alert rules from `docs/22-observability.md`, each with a triage procedure. Alerts fire from `/metrics` on the API and the worker's scrape port (9100). Every procedure starts from a field query — the structured log fields (`docs/22`) are the entry point, never a message string.

## How to investigate any page

1. Confirm scope: `GET /health/ready` (dependencies) and `GET /health/live` (process). Liveness failing means restarts are happening; readiness failing means a dependency or migration is down.
2. Pull the request summary for the window: `request_id`, `trace_id`, `team_id`, `status_code`, `duration_ms` — all fields on the `request completed` log line.
3. For anything an agent or workflow touched, resolve `trace_id` into `audit_logs` / `tool_calls` / `agent_runs` — one `trace_id` spans the HTTP request, the queue row, and the run.
4. If the page involves a specific request, the response envelope's `request_id` is the log line's `request_id`. Never grep by message text.

## Trace-backed triage

When a page names a `trace_id` (or a run/tool call row carries one), the `trace_id` is the fastest route from signal to cause: one value joins the log lines, the queue row, and the transactional records. There is no span backend; the rows below are the query surface. Which row answers what:

| Row | Key fields | What it answers |
|---|---|---|
| `agent_runs` | `team_id`, `agent_id`, `status`, `context_trust_level`, `token_usage`, `trace_id` | The run's outcome, trust ceiling, and token totals; entry point for anything an agent did |
| `jobs` | `queue`, `attempts`, `team_id`, `trace_id`, `last_error` | Queue-boundary child of the causing request/run — retry attempts and the fastest failure signal |
| `tool_calls` | `team_id`, `tool`, `risk_tier`, `decision`, `decision_reason`, `context_trust_level`, `trace_id` | Per-attempt outcome and the C2 decision; `decision="denied"` rows are the injection triage entry |
| `agent_runs.token_usage` + `model_call_duration_seconds` | `provider`, `model` | Provider latency and token attributes for cost questions |
| `knowledge_items` + run transcript | `trust_level`, `ingested_from` | Which bases fed the hits behind a retrieval |

Error-rate analysis from rows, complementing the log-field queries above:

- **Error rows, not just error logs.** A `tool_calls` row with an error names the failing tool and the decision attributes at that moment — filter by `tool` and `decision`, then read the row's error. A denial that *shouldn't* be one is triaged from the row's `risk_tier`/`trust_level` pair.
- **Which run was slow, not just which route.** `http_request_duration_ms` p95 says the run-start route is slow; `model_call_duration_seconds` by provider says whether the provider is the cause, and `job_duration_seconds` by queue says whether the worker is. Provider latency versus our overhead is a histogram comparison, not a span tree.
- **Trace an incident's blast radius.** From one confirmed malicious payload's `trace_id`: the `jobs` row names the queue entry; the `tool_calls` rows list every attempted egress with decisions; the `agent_runs` row gives the team. The same join answers "what did this inbound message actually do".
- **Alert-driven row queries.** When `tool_calls_denied_total` pages, query `tool_calls` with `decision="denied"` in the window grouped by `tool` and `agent_id` — one agent varying wording against one tool is the T4 injection signature from the section below.

## Pages

### Should-be-zero security pages

- `refresh_token_reuse_total` increasing (W6): someone replayed a rotated refresh token. Triage: query `audit_logs` for `auth.refresh.reuse`; revoke the user's refresh family and force sign-in; check `auth_failures_total{reason}` for the surrounding attempt pattern. This is a credential compromise until proven otherwise — treat it as an incident, not noise.
- `cross_team_access_denied_total` increasing: requests hitting another team's resources. Triage: pull `trace_id`s from the log lines, read the audit rows — if a single `actor_id` dominates, it is a broken client or probing; if many, check for a regression in `teamScope`. Verify the denial paths return NOT_FOUND (existence oracle check).
- `destination_denied_total` increasing: the egress allowlist (C3) is rejecting. Triage: usually a legitimate config change — a new destination was introduced without an allowlist entry. Escalate only if the same destination repeats from one agent: that shape matches an injection attempt trying different wording.
- `tool_calls_denied_total` sustained above baseline: check the `approval_requests_total` rate too — a spike in both means new automation was granted tools it cannot use; a spike in denials alone from one agent's `trace_id`s is the signature of context injection (T4).
- `auth_failures_total{reason="domain_mismatch"}` increasing: phishing pages signing the wrong domain (W2). Triage: capture IPs from the log lines, publish the blocklist, and verify `SIWE_DOMAIN` still matches the deployed origin.
- `eip1271_failures_total` increasing (W4): distinguish infrastructure from attack — check `EVM_RPC_URL` latency first; contract-wallet verification fails closed during RPC degradation. If RPC is healthy and failures cluster on specific addresses, treat as targeted and audit those teams' recent permission grants.
- `agent_permission_grant_rejected_total` increasing (R3): someone is trying to grant agents admin-tier capability. Legitimate operators use the UI, which fails validation before the API; investigate the `actor_id` behind the rejections.
- `apikey_trust_ceiling_raised_total` (T16): keys issued or used at the `user_input` ceiling. Not an emergency, but review which agents accept `untrusted` ingress — scheduled and webhook-triggered work should be rare and deliberate.
- `run_budget_exceeded_total` increasing (C10): budgets are terminating runs. `limit_type` says which limit fired — `tokens-exceeded` or `model-iterations-exceeded` on one team's agents means a runaway loop; check that team's recent knowledge-base edits for injected content.

### Availability and performance pages

- `http_requests_total{status_class="5xx"}` rate rising: read the unhandled-error log lines first — they carry `error_name` and `error_code`. One `error_name` dominating means a dependency, not a code path; correlate `trace_id` into the failing `tool_calls` and `audit_logs` rows.
- `http_request_duration_ms` p95 climbing on one route: RED says check that route's dependencies. If the route is agent or workflow start, the model gateway histogram (`model_call_duration_seconds`) usually moves first.
- `queue_depth{status="queued"}` growing: enqueue rate exceeds drain rate. Compare `jobs_total{status}` outcomes per queue — if the worker is failing jobs, `job_retries_total` rises too; if the worker is idle, check worker liveness (`jobs_reclaimed_total` below).
- `queue_depth{status="running"}` stuck high: handlers are long or workers died. `job_duration_seconds` tells which: durations still moving means long jobs, flat means dead workers.
- `jobs_dead_total` increasing: a queue is exhausting `max_attempts`. Read `last_error` on the dead rows directly — that is the fastest signal of a handler bug, a bad payload, or a missing handler (`no handler registered for queue`).
- `jobs_reclaimed_total` increasing: lease expiries. A steady non-zero rate means workers are dying (OOM, deploy restarts slower than the lease) or the lease is mistuned versus handler duration. Cross-check `job_duration_seconds` upper buckets against `QUEUE_LEASE_SECONDS`.

### Dependency pages

- `model_calls_total{status="error"}` rate rising, or `model_call_duration_seconds` climbing: provider degradation. Check whether errors carry `MODEL_TIMEOUT` (retryable, provider slow) or `MODEL_PROTOCOL_ERROR` (provider breaking contract). Runs fail closed; nothing needs rolling back, but page the provider and consider draining to maintenance mode if the provider is the only live one.

### Cost pages

- Team cost rate above a ceiling: `cost_rollups` is the per-team query surface (docs/22 keeps `team_id` out of metric labels on purpose). Rate of change, not absolute value, is the signal — compare the current hour bucket against the trailing same-size window: doubling hour over hour is the page, a large steady bill is not. Break the change down by `model_provider`/`model_name` (new model? price tier?) and `agent_id` (one runaway agent?), then check `run_budget_exceeded_total{limit_type}` — a runaway loop usually trips a budget eventually; if it does not, the budgets were never set. Cross-reference the suspect `trace_id`s from `agent_runs` in the window and read the `tool_calls` rows: a loop shows as repeated model calls with climbing token usage under one run.

## After the page

Every security page above maps to a row in `docs/22-observability.md` and a threat in `docs/17-threat-model.md`; record which threat fired in the incident review. If a page had no runbook entry, add one here — a page without a procedure trains people to ignore pages.
