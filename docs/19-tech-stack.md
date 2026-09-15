# Technology Stack

The stack decisions for TeamAgent, and what each one costs. Earlier documents left the stack open; this one closes it.

## Decisions

| Layer | Choice |
|---|---|
| Backend | **Fastify** + TypeScript |
| Schema and migrations | **Drizzle** / `drizzle-kit`, defined in code |
| Database | **PostgreSQL or SQLite**, selected by environment |
| Authentication | **JWT** issued after **EVM wallet sign-in (EIP-4361 / SIWE)** |
| Frontend | **React** + Vite |
| Styling | **TailwindCSS** |
| Internationalization | **react-i18next**, English and Persian, RTL-capable |
| Queue and cache | Redis + BullMQ |
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

**Fastify** over Express: native JSON Schema validation on every route, meaningfully faster, and a plugin/encapsulation model that maps cleanly onto the module boundaries in `docs/16-backend-architecture.md`.

Schema validation is not incidental here. `docs/06-tool.md` and `docs/17-threat-model.md` C7 both require that tool inputs be validated against a declared schema before execution. Using the same validation mechanism for HTTP routes and tool arguments keeps one code path rather than two.

Suggested plugins:

- `@fastify/jwt` — access token verification
- `@fastify/rate-limit` — per-principal limits, backed by Redis
- `@fastify/under-pressure` — shed load rather than queueing indefinitely
- `@fastify/sensible` — standard error shapes
- `zod` or TypeBox — one source of truth for runtime validation and TypeScript types

No `@fastify/cors`. No HTTPS options.

## Database: two engines, one codebase

`DB_DIALECT` selects PostgreSQL or SQLite at startup. This is a real capability with a real cost, and the cost should be visible before the first schema module is written.

**Drizzle does not abstract over dialects.** `drizzle-orm/pg-core` and `drizzle-orm/sqlite-core` are separate packages with separate builders; `pgTable` is not `sqliteTable`, and there is no shared table type. Supporting both means:

- two schema modules, `schema/pg.ts` and `schema/sqlite.ts`, kept mechanically parallel
- two migration directories, generated and reviewed separately
- two database clients behind one repository interface
- every schema change made twice, and every integration test run twice

The design in `docs/14-database.md` already helps: it deliberately uses a portable column vocabulary — application-generated `CHAR(36)` ids, JSON as text, UTC timestamps, no partial indexes or triggers in the baseline — specifically so the two modules stay line-for-line comparable. Keep to that vocabulary and the duplication stays mechanical. Reach for a Postgres-native type and the two definitions diverge permanently.

**What SQLite cannot do here.** Application invariants **R3** and **R4** in `docs/14-database.md` are security boundaries — agents never hold admin-tier permissions, and initiating egress requires a non-empty destination allowlist. PostgreSQL can enforce both in the database via a trigger and a CHECK shipped in a migration. SQLite can enforce neither. On SQLite they rest entirely on repository-layer code.

SQLite also serializes writers. The workflow worker and the API will contend on a single write lock, which makes it unsuitable for the concurrent multi-tenant workload this platform targets.

**Recommendation:** SQLite for local development, tests, and single-tenant or self-hosted deployments. PostgreSQL for anything multi-tenant or production. The `DB_DIALECT` switch is what makes the first case pleasant; it is not an invitation to run production on SQLite.

Both engines must be in CI. A dialect that is never tested is a dialect that is broken.

## Frontend

**React + Vite**, built to static assets and served by nginx. The application server does not serve the frontend.

**TailwindCSS**, with one rule that matters more than the rest:

> Use logical properties everywhere. `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`/`text-end` — never `ml-*`, `pr-*`, `left-*`, or `text-right`.

Tailwind resolves logical properties from the `dir` attribute on `<html>`, so a layout built this way flips correctly for Persian with no per-component work. A layout built with physical properties has to be audited class by class later, which is the expensive version of the same job.

**Wallet connection:** `wagmi` + `viem`, with RainbowKit or ConnectKit for the connect UI. `viem` is also what the backend uses to verify signatures, so the message construction and verification logic share types.

## Internationalization

**react-i18next**, shipping English (`en`) and Persian (`fa`).

- `dir` is set on `<html>` from the active locale and drives every logical property in the stylesheet
- Persian needs a font with proper Arabic-script coverage; Vazirmatn is the usual choice, with a real fallback stack
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
DB_DIALECT=postgres            # postgres | sqlite
DATABASE_URL=postgres://user:pass@localhost:5432/teamagent
# DB_DIALECT=sqlite
# DATABASE_URL=file:./data/teamagent.db

# Auth -- see docs/20-authentication.md
JWT_SECRET=                    # 32+ random bytes; rotating it invalidates every token
JWT_ACCESS_TTL=15m
REFRESH_TTL=30d
SIWE_DOMAIN=app.example.com    # MUST match the browser origin exactly
SIWE_URI=https://app.example.com
SIWE_CHAIN_ID=1
EVM_RPC_URL=                   # required for EIP-1271 smart-contract wallet verification

# Infrastructure
REDIS_URL=redis://localhost:6379

# i18n
DEFAULT_LOCALE=en
SUPPORTED_LOCALES=en,fa
```

**Validate this at startup and exit if it is wrong.** Parse the environment through a schema before the server binds a port. A missing `JWT_SECRET` should stop the process, not surface as a 500 on the first login. A `SIWE_DOMAIN` that does not match the deployed origin silently breaks every sign-in and, worse, a permissive one accepts signatures obtained from another site — see `docs/20-authentication.md`.

Commit a `.env.example` with every key present and no real values.

## Consequences

Things this stack makes harder, recorded so they are not a surprise later:

1. **Every schema change is made twice.** Postgres and SQLite modules both, plus two migration sets. Budget for it.
2. **R3 and R4 are unenforced on SQLite.** Both are security rules. They need repository-layer implementations and tests that attempt the forbidden write and assert failure.
3. **JWT cannot be revoked mid-lifetime.** Addressed by short access tokens plus a revocable refresh token, and by keeping permissions *out* of the token. See `docs/20-authentication.md`.
4. **Wallet-only authentication means losing a wallet means losing the account.** There is no password reset path. Recovery requires a deliberate policy decision — a second linked wallet, a social recovery scheme, or an explicit admin process — and it should be made before the first real user signs up.
5. **RTL is a layout constraint, not a translation task.** It is cheap now and expensive later.
