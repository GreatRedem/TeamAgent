# Technology Stack

The stack decisions for NuraAI, and what each one costs. Earlier documents left the stack open; this one closes it.

## Decisions

| Layer | Choice |
|---|---|
| Backend | **Fastify** + TypeScript |
| Schema and migrations | **Drizzle** / `drizzle-kit`, defined in code |
| Database | **PostgreSQL**, sole supported engine; **PGlite** in-process for tests |
| Authentication | **JWT** issued after **EVM wallet sign-in (EIP-4361 / SIWE)** |
| Frontend | **React** + Vite |
| Styling | **TailwindCSS** |
| Internationalization | **react-i18next**, English and Persian, RTL-capable |
| Job queue | A table in the same database — no broker |
| Observability | OpenTelemetry |

## Explicitly Out of Scope

**TLS and CORS are handled by nginx and must not appear in this codebase.**

That means no HTTPS listener, no certificate loading, no `@fastify/cors`, and no `Access-Control-Allow-*` headers set by the application. The service listens on plain HTTP behind the proxy.

This has one consequence that *is* in scope and is easy to miss:

> **Fastify must be started with `trustProxy` enabled.**

Without it, `request.ip` is nginx's address for every request. Three things break quietly:

- `audit_logs.ip_address` records the proxy on every row, making the audit trail useless for attribution
- rate limiting buckets every client together, so one abusive caller throttles everyone
- any IP allowlist or geo rule matches the proxy rather than the caller

Set `trustProxy` to the proxy's address or subnet rather than `true`. `trustProxy: true` makes the application believe any `X-Forwarded-For` header it receives, which means a client that can reach the service directly can spoof its own IP into your audit log.

### Boundary items to confirm with whoever owns the nginx config

These sit on the line and should be assigned deliberately rather than assumed:

| Concern | Suggested owner | Note |
|---|---|---|
| TLS termination, HSTS | nginx | Stated. |
| CORS | nginx | Stated. |
| Request body size limits | both | nginx `client_max_body_size` and Fastify `bodyLimit`. Fastify's should be the smaller of the two, so the application's own error shape is what clients see. |
| Rate limiting | application | It needs to be per-team and per-principal, which nginx cannot see. Requires `trustProxy`. |
| Security headers (CSP, X-Frame-Options) | nginx | Unless the frontend needs per-route CSP, in which case move it to the app. |
| Gzip / Brotli | nginx | |
| Static frontend assets | nginx | The React build is static; Fastify should not serve it. |
| Webhook request buffering | nginx | Signature verification needs the raw body, so `proxy_request_buffering` and any body rewriting must not alter it. See `docs/17-threat-model.md` T7. |

## Backend

**Fastify** over Express: per-route schema validation, meaningfully faster, and a plugin/encapsulation model that maps cleanly onto the module boundaries in `docs/16-backend-architecture.md`.

Schema validation is not incidental here. `docs/06-tool.md` and `docs/17-threat-model.md` C7 both require that tool inputs be validated against a declared schema before execution.

The two surfaces validate with **different** mechanisms, and that is the settled design rather than an oversight. Routes parse with **zod** schemas written in code, which infer their own TypeScript types. Tool arguments are checked against the `input_schema` **JSON Schema** stored on the tool row (`apps/api/src/modules/tools/validation.ts`, Ajv), because a tool's contract arrives as data at registration time and cannot be a route module. One mechanism serving both was the earlier assumption; the implemented system has two.

Suggested plugins:

- `@fastify/jwt` — access token verification
- `@fastify/rate-limit` — in-process counters; per-instance, not global (`docs/23-job-queue.md`)
- `@fastify/under-pressure` — shed load rather than queueing indefinitely
- `@fastify/sensible` — standard error shapes
- `zod` — route schemas and the TypeScript types they infer, from one definition. Not used for tool `input_schema`, which is JSON Schema on the tool row

No `@fastify/cors`. No HTTPS options.

## Database: PostgreSQL, one engine

<!-- docs-check: allow sqlite -->

**PostgreSQL is the only supported engine.** There is no `DB_DIALECT` switch and no SQLite path.

An earlier revision of this document supported both, selected at startup, and it was wrong. Drizzle does not abstract over dialects — `drizzle-orm/pg-core` and `sqlite-core` are separate packages with separate builders, and `pgTable` is not `sqliteTable` — so two engines meant two schema modules kept mechanically parallel, two migration directories, two clients behind one repository interface, every schema change made twice, and every integration test run twice.

The decisive argument was not the duplication. It was that **invariants R3 and R4 in `docs/14-database.md` are security boundaries** — agents never hold admin-tier permissions, and initiating egress requires a non-empty destination allowlist. PostgreSQL enforces both in the database, via a trigger and a CHECK shipped in a migration. SQLite can enforce neither. A dual-engine build therefore had a production-grade path and a materially weaker one, and nothing but convention stopping a deployment from choosing the weaker one.

SQLite also serializes writers. The API, the workflow worker, and the reaper all contend on a single write lock, which does not fit a concurrent multi-tenant workload.

### Local development without a second engine

<!-- docs-check: allow sqlite -->

The only good argument for SQLite was zero-install local development and testing, and that never required a second dialect.

**PGlite** (`@electric-sql/pglite`) is real PostgreSQL compiled to WASM, running in-process. No Docker, no server, no container — schema tests run in about a second, and the engine under test is the one that runs in production. `docs/21-testing.md` covers the setup.

### What the single engine unlocks

The schema no longer has to speak a portable subset. Use the engine:

- native `uuid` and `jsonb` rather than `CHAR(36)` and JSON-as-text
- partial and expression indexes — which is how R1 and R2 stop being application rules
- triggers and `CHECK` with JSON introspection — which is how R3 and R4 stop being application rules
- `FOR UPDATE SKIP LOCKED` for the job queue claim (`docs/23-job-queue.md`)
- `LISTEN`/`NOTIFY` for worker wakeup and cache invalidation
- `pg_try_advisory_lock` for scheduler leader election
- row-level security, if the open decision in `docs/17-threat-model.md` C12 goes that way
- `pgvector`, when knowledge chunks and embeddings land

**Self-hosting is not an exception.** PostgreSQL runs fine on one small machine, and a deployment that diverges on engine diverges on the two rules that matter most.

## Frontend

**React + Vite**, built to static assets and served by nginx. The application server does not serve the frontend.

**TailwindCSS**, with one rule that matters more than the rest:

> Use logical properties everywhere. `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`/`text-end` — never `ml-*`, `pr-*`, `left-*`, or `text-right`.

Tailwind resolves logical properties from the `dir` attribute on `<html>`, so a layout built this way flips correctly for Persian with no per-component work. A layout built with physical properties has to be audited class by class later, which is the expensive version of the same job.

The design system, component standards, and accessibility floor are in `docs/24-ui-standards.md`; the screen inventory is in `docs/25-ui-information.md`. One item from there belongs in the stack decision itself, because it constrains the rendering layer rather than the styling: **content that arrived from outside the team is rendered as plain text, never as markdown or HTML**, and never with images or links resolved. A markdown image in agent output is an exfiltration channel that needs no send permission at all (`docs/17-threat-model.md` T6), and it is stopped at render time or not at all.

**Wallet connection:** `wagmi` + `viem`, with RainbowKit or ConnectKit for the connect UI. `viem` is also what the backend uses to verify signatures, so the message construction and verification logic share types.

## Internationalization

**react-i18next**, shipping English (`en`) and Persian (`fa`).

- `dir` is set on `<html>` from the active locale and drives every logical property in the stylesheet
- **IBM Plex Sans** for Latin UI, **Vazirmatn** for Persian, **IBM Plex Mono** for identifiers and quarantined content. Persian gets a face designed for Persian rather than a Latin family's Arabic extension; normalize the two with `size-adjust` so a locale switch does not change line box height. Full rationale in `docs/24-ui-standards.md`
- Dates, numbers, and currency go through `Intl`, never hand-formatted. Persian locale conventions differ enough — including the calendar — that manual formatting will be wrong
- Server-side strings that reach a user (validation errors, approval notifications, agent-facing error text) need the same treatment. Locale is a property of the request, not a global

Externalize every string from the first commit. Retrofitting i18n means touching every component; doing it from the start costs almost nothing.

## Environment Contract

`.env` drives configuration. No secrets in the repository; production values come from a secret manager (`docs/12-security.md`).

```bash
# Runtime
NODE_ENV=production
HOST=127.0.0.1                 # bind to loopback; nginx is the only ingress
PORT=3000
TRUST_PROXY=127.0.0.1          # the proxy's address, not `true`

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/nuraai
DB_POOL_MAX=20                 # size with the worker fleet in mind; the queue shares this pool

# Auth -- see docs/20-authentication.md
JWT_SECRET=                    # 32+ random bytes; rotating it invalidates every token
JWT_ACCESS_TTL=15m
REFRESH_TTL=30d
SIWE_DOMAIN=app.example.com    # MUST match the browser origin exactly
SIWE_URI=https://app.example.com
SIWE_CHAIN_ID=1
EVM_RPC_URL=                   # required for EIP-1271 smart-contract wallet verification

# Queue
QUEUE_POLL_INTERVAL_MS=1000
QUEUE_LEASE_SECONDS=600        # longer than the slowest agent run, or it reruns
QUEUE_MAX_ATTEMPTS=5

# Observability -- see docs/22-observability.md
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_SERVICE_NAME=nuraai-api   # api | worker | scheduler
TRACE_SAMPLE_RATIO=0.1         # errors, denials, and approvals are always kept

# Approvals -- see docs/17-threat-model.md C5
APPROVAL_TTL_SECONDS=3600      # an expired approval is a denial
APPROVAL_NOTIFY_CHANNEL=       # UNDECIDED: email cannot be assumed, see docs/20

# i18n
DEFAULT_LOCALE=en
SUPPORTED_LOCALES=en,fa
```

**Validate this at startup and exit if it is wrong.** Parse the environment through a schema before the server binds a port. A missing `JWT_SECRET` should stop the process, not surface as a 500 on the first login. A `SIWE_DOMAIN` that does not match the deployed origin silently breaks every sign-in and, worse, a permissive one accepts signatures obtained from another site — see `docs/20-authentication.md`.

Commit a `.env.example` with every key present and no real values.

## Consequences

Things this stack makes harder, recorded so they are not a surprise later:

1. **PostgreSQL is a hard dependency for every environment.** Nothing runs on a file database. In exchange there is one schema, one migration set, one test matrix, and no environment where a security invariant is enforced more weakly than in production. PGlite keeps the local and CI loop free of Docker.
2. **R3 and R4 are database constraints, and still need tests.** A trigger can be dropped by a later migration as silently as a repository check can be refactored away. Each needs a test that attempts the forbidden write and asserts failure.
3. **JWT cannot be revoked mid-lifetime.** Addressed by short access tokens plus a revocable refresh token, and by keeping permissions *out* of the token. See `docs/20-authentication.md`.
4. **Wallet-only authentication means losing a wallet means losing the account.** There is no password reset path. Recovery requires a deliberate policy decision — a second linked wallet, a social recovery scheme, or an explicit admin process — and it should be made before the first real user signs up.
5. **RTL is a layout constraint, not a translation task.** It is cheap now and expensive later.
6. **One datastore means the queue shares the application database.** Claim polling, heartbeats, and cleanup compete with application queries for connections and I/O, and an unpruned `jobs` table is the standard way this design fails. In exchange, enqueue is transactional and there is one thing to back up, secure, and operate. See `docs/23-job-queue.md`.
7. **Rate limits are per instance.** Without a shared counter store, the effective limit is the configured value times the instance count. The auth endpoints are the exception and are enforced accurately against `auth_nonces`.
