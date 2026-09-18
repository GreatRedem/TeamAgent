# Production Readiness Checklist

This document is the concrete checklist for turning NuraAI from a well-specified design into a production-grade system.

## Executive Summary

The current repository contains strong domain modeling, security reasoning, API contracts, and an implemented, tested API core. Phases 1–6 are substantially complete, the injection containment suite covers every current ingress, and phase 7 observability is wired through logs, metrics, trace correlation, cost rollups, and incident triage.

It is not yet in a production-readiness stage. The remaining gaps are deployment automation, dashboards, alerting-backend wiring, and infrastructure-grade validation around the implemented controls.

## Must-Have Production Items

### 1. Real code implementation

Required before production:
- backend service implementation
- database migrations
- authentication flow implementation
- authorization enforcement in code
- source connector implementations
- tool runtime and policy enforcement
- workflow execution engine
- knowledge retrieval service

Status: substantially present for phases 1–7 and covered by the PGlite test suite — backend services, migrations, wallet auth, permission and trust enforcement, the tool runtime, knowledge retrieval, the workflow engine with schedule triggers and the queue worker, plus structured logs, metrics, queue-boundary trace correlation, security signals, cost rollups, and injection containment across every current ingress. Still missing: deployment automation, dashboards, and alerting-backend wiring.

### 2. Database migration system

The schema is defined in code with Drizzle. Production needs:
- migration history table
- forward-only migration strategy
- generated SQL reviewed before it is applied
- migration checks in CI
- schema drift detection
- rollback plan
- the R1–R5 constraints — two partial unique indexes, a trigger, and a CHECK — actually present in a migration and covered by tests, not only described in the schema modules

Required tools:
- drizzle-kit for generation and apply
- a CI step that migrates an empty database to head and asserts no drift from the schema modules

See docs/19-tech-stack.md and docs/14-database.md.

### 3. CI/CD pipeline

Production requires:
- lint
- format
- unit tests
- integration tests
- build checks
- container build
- deployment automation
- branch protection
- release tagging

### 4. Automated tests

Minimum required coverage:
- unit tests for permission checks, covering all twelve cells of the capability matrix
- tests for source connector behavior
- tests for workflow execution logic
- tests for agent runtime policy decisions
- tests for security boundary checks: invariants R1-R5, wallet auth W1-W8, tenant isolation
- injection containment suite against every ingress path
- integration tests for database and API flows, run on PGlite against the committed migrations
- end-to-end tests for critical user journeys

Model evaluations are separate and do not gate merges. Tests never call a real model provider.

See docs/21-testing.md.

### 5. Secrets and configuration management

Production requires:
- no secrets in repo
- secret manager integration
- environment variable validation
- encrypted storage for credentials
- rotation policy
- secret-scoped access

Examples:
- Vault
- AWS Secrets Manager
- Azure Key Vault
- Doppler
- Infisical

### 6. Observability and operations

Production needs:
- request logging **— implemented: structured request summary with `request_id`, `trace_id`, `team_id`, actor, trust, status, duration**
- structured logs with no secrets, prompts, or message bodies **— redaction rules active; sentinel-scan test enforces**
- trace IDs propagated across the queue boundary **— implemented: ALS trace context restored per job, asserted by test**
- metrics, with no high-cardinality labels such as team_id **— implemented: registry rejects unregistered labels; `/metrics` on API and worker**
- security signal metrics: denied tool calls, destination rejections, auth failures **— implemented, wired at each decision point**
- cost tracking per team and agent **— implemented: hourly `cost_rollups` by team, agent, and model; rate-of-change alerting remains backend work**
- dashboards **— owned by DevOps outside this repo; operating Grafana remains host work**
- alerting, with a runbook entry per page **— rules owned by DevOps outside this repo (runbook `docs/26-runbook.md`); operating Prometheus/Alertmanager and receivers remains host work**
- uptime checks
- incident response flow
- runbook documentation **— `docs/26-runbook.md`**

Observability and the audit log are separate systems with separate retention and access rules. Audit records are transactional writes, never log lines, and are never sampled.

Required tools:
- Prometheus
- Grafana
- Loki
- Sentry
- Datadog or equivalent

See docs/22-observability.md.

### 7. Security implementation beyond design

The design is strong, but production requires enforcement in code:
- RBAC checks in every protected route
- permission checks before tool execution
- explicit trust-level enforcement in runtime
- source allowlists
- destination validation
- webhook signature verification
- rate limiting
- request limits and quotas

### 8. Safe tool execution runtime

The tool system must be hardened with:
- schema validation for inputs
- allowlist for destinations
- bounded execution timeouts
- retry policies
- cancellation and timeout handling
- execution sandboxing for risky tools
- tool-specific allowlists and policies

### 9. Workflow reliability

Workflows need:
- idempotency keys
- retry policies
- dead-letter queues
- job status tracking
- timeouts
- partial failure handling
- compensation or rollback where applicable

### 10. Data retention and governance

Required decisions:
- how long logs are kept
- what data is retained in audit logs
- retention for generated content
- retention for user messages and knowledge data
- deletion and anonymization process
- data export policy

## Security-specific Production Requirements

### Authentication and session security
- exact domain binding on the sign-in message, compared with string equality
- single-use, short-lived nonces consumed atomically
- EIP-1271 verification for smart-contract wallets, with a timeout, failing closed
- short access token TTL
- no permission or role claim carried in any token
- token_version checked per request for immediate global revocation
- refresh token rotation with reuse detection and family revocation
- hardware wallet or multisig required for owner and admin roles
- device/session tracking
- audit for sign-in attempts, including failures
- account recovery policy for lost wallets, decided before launch

See docs/20-authentication.md.

### Authorization enforcement
- every route checks permissions, resolved per request rather than read from a token claim
- every runtime action checks permission and trust scope
- team-scoped queries must enforce team_id checks
- a resource in another team returns NOT_FOUND, not FORBIDDEN, so the API is not an existence oracle
- no direct access to system-level resources without policy

### Machine principals
- every API key carries an explicit `trust_ceiling`, defaulting to `untrusted`
- no key-authenticated request is ever labelled `trusted`
- a key raised to `user_input` is bound to a named user and individually revocable
- one key per integration, not one shared key per team
- key revocation takes effect immediately, not at expiry

See docs/17-threat-model.md T16.

### Control surfaces that must exist before launch
These are controls with no product surface until their endpoints ship, which makes them easy to mark done in design and miss in delivery:
- agent grant endpoints, so `allowed_destinations` can actually be populated and reviewed
- the approvals queue, with the triggering content and origin shown to the reviewer
- a decided notification channel for approvals, given that `users.email` is usually absent
- workflow version publishing, so editing a workflow cannot change a run in flight

### Risk control and prompt isolation
- untrusted content must not be treated as trusted
- outbound destinations must be validated and allowlisted
- no direct secret exposure in logs
- model-generated arguments must be validated before execution
- tool execution must fail closed

## Production Quality Gates

Before production deployment, the project should pass these gates:

### Gate 1 — Implementation completeness
- all core services exist
- API routes implemented
- DB schema migrated in code
- auth works end-to-end

### Gate 2 — Security verification
- auth and permission tests pass
- trust model is enforced in runtime
- secrets not leaked in logs
- prompt injection mitigations reviewed

### Gate 3 — Reliability checks
- retries tested
- queue processing validated
- error handling verified
- timeouts and cancellations work

### Gate 4 — Observability
- logs available
- metrics visible
- trace correlation complete (logs + DB rows share trace_id)
- alerts tested
- dashboards reviewed

### Gate 5 — Operations
- backups configured
- rollback tested
- incident runbook exists
- support and maintenance ownership defined

## Production Risk Areas

These are the highest-risk areas in the current design:

1. prompt injection and confused deputy risk
2. tool execution safety
3. knowledge retrieval poisoning and trust contamination
4. workflow execution abuse or overreach
5. cross-tenant data leakage
6. credential handling and secret exposure
7. outbound destination control
8. high-cost or runaway agent execution

## Recommended Readiness Order

The best sequence is:

1. implement auth and team membership
2. implement model and agent CRUD
3. implement source and tool access controls
4. implement knowledge retrieval with scope checks
5. implement workflow runtime and queue
6. add audit logs and observability
7. run security review and abuse testing
8. deploy staging and production hardening

## Final Judgment

The repository is currently at the level of:
- strong product design
- strong architecture review
- strong security reasoning
- an implemented, tested core (phases 1–6) rather than planning alone

It is not yet at the level of:
- fully verified production system
- hardened deployment environment
- reliable operational runtime
- production-ready engineering artifact

## Recommendation

The next milestone should not be “production launch.”

The next milestone should be:

“working MVP with security enforcement, automated tests, observable runtime, and deployment pipeline.”

The security enforcement, automated tests, and observable runtime are now substantially present. Once deployment automation, dashboards, alerting, and the remaining infrastructure gates are complete, the system can move from implementation maturity to production readiness.
