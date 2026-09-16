# Incident Runbook

The alert rules from `docs/22-observability.md`, each with a triage procedure. Alerts fire from `/metrics` on the API and the worker's scrape port (9100). Every procedure starts from a field query — the structured log fields (`docs/22`) are the entry point, never a message string.

## How to investigate any page

1. Confirm scope: `GET /health/ready` (dependencies) and `GET /health/live` (process). Liveness failing means restarts are happening; readiness failing means a dependency or migration is down.
2. Pull the request summary for the window: `request_id`, `trace_id`, `team_id`, `status_code`, `duration_ms` — all fields on the `request completed` log line.
3. For anything an agent or workflow touched, resolve `trace_id` into `audit_logs` / `tool_calls` / `agent_runs` — one `trace_id` spans the HTTP request, the queue row, and the run.
4. If the page involves a specific request, the response envelope's `request_id` is the log line's `request_id`. Never grep by message text.

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

- `http_requests_total{status_class="5xx"}` rate rising: read the unhandled-error log lines first — they carry `error_name` and `error_code`. One `error_name` dominating means a dependency, not a code path; correlate `trace_id` into the failing span.
- `http_request_duration_ms` p95 climbing on one route: RED says check that route's dependencies. If the route is agent or workflow start, the model gateway histogram (`model_call_duration_seconds`) usually moves first.
- `queue_depth{status="queued"}` growing: enqueue rate exceeds drain rate. Compare `jobs_total{status}` outcomes per queue — if the worker is failing jobs, `job_retries_total` rises too; if the worker is idle, check worker liveness (`jobs_reclaimed_total` below).
- `queue_depth{status="running"}` stuck high: handlers are long or workers died. `job_duration_seconds` tells which: durations still moving means long jobs, flat means dead workers.
- `jobs_dead_total` increasing: a queue is exhausting `max_attempts`. Read `last_error` on the dead rows directly — that is the fastest signal of a handler bug, a bad payload, or a missing handler (`no handler registered for queue`).
- `jobs_reclaimed_total` increasing: lease expiries. A steady non-zero rate means workers are dying (OOM, deploy restarts slower than the lease) or the lease is mistuned versus handler duration. Cross-check `job_duration_seconds` upper buckets against `QUEUE_LEASE_SECONDS`.

### Dependency pages

- `model_calls_total{status="error"}` rate rising, or `model_call_duration_seconds` climbing: provider degradation. Check whether errors carry `MODEL_TIMEOUT` (retryable, provider slow) or `MODEL_PROTOCOL_ERROR` (provider breaking contract). Runs fail closed; nothing needs rolling back, but page the provider and consider draining to maintenance mode if the provider is the only live one.

## After the page

Every security page above maps to a row in `docs/22-observability.md` and a threat in `docs/17-threat-model.md`; record which threat fired in the incident review. If a page had no runbook entry, add one here — a page without a procedure trains people to ignore pages.
