# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root (npm workspaces):

```bash
npm run dev            # tsx watch on backend/src/main.ts
npm run build          # tsc -> backend/dist
npm run lint           # oxlint over the whole repo
npm run lint:fix
npm run format         # oxfmt -- see the warning below before running
npm run format:check
```

Typecheck without emitting: `cd backend && npx tsc --noEmit`.

Deployment is a systemd unit driven by `scripts/*.sh`, exposed as `npm run service:install|start|stop|status|restart|uninstall|deploy`. `service-install.sh` generates the unit with `ExecStart` pointing at `backend/dist/main.js`; it resolves that via `SERVICE_APP_DIR` (default `backend`), so changing `outDir` in `backend/tsconfig.json` silently breaks the unit.

**There is no test framework configured.** Don't invent a `npm test` invocation; verify changes with `tsc --noEmit`, `npm run build`, and `npm run lint`.

## Formatting warning

Tooling is oxlint + oxfmt, configured at the repo root (`.oxlintrc.json`, `.oxfmtrc.json`). The source is written in **Allman brace style** (`{` on its own line), which oxfmt — being Prettier-compatible — cannot express. `npm run format:check` currently reports 23 of 26 files as needing changes, and running `npm run format` will reformat nearly the whole codebase to K&R. A few files (`main.ts`, `tsconfig.json`) have already been converted, so the tree is mixed. Match the surrounding file's style; do not run `npm run format` casually.

oxlint silently ignores unknown rule names, so a typo in `.oxlintrc.json` is a rule that quietly does nothing.

## Architecture

Fastify + TypeORM + PostgreSQL, ESM, TypeScript. `frontend/` is an empty placeholder workspace.

### Route wiring is indirect

`main.ts` registers `@fastify/autoload` against `src/routes` with `matchFilter: /\.route\.(ts|js)$/` and `dirNameRoutePrefix: false`, so route files are discovered, not imported. Adding a directory under `src/routes` with a `*.route.ts` is enough to mount it.

Inside a module the split is:

- `*.route.ts` — only maps paths to handlers: `fastify.post('/path', someHandler(fastify))`
- `*.service.ts` — exports **factories that return a Fastify route-options object**, not handlers: `{ schema, config, handler }`. The `config` object is where `rateLimit(...)` and `authGuard()` spreads go. This is the pattern to follow; reading `account.route.ts` alone makes it look like handlers are passed directly.
- `*.schema.ts` — JSON schemas referenced from those options
- `*.entity.ts` — TypeORM entities

### Validation is manual, by design

`main.ts` calls `setValidatorCompiler(() => () => true)`, which disables Fastify's JSON-schema request validation entirely. This is deliberate, not a bug: `plugins/validator.ts` decorates the request with a chained builder used inside handlers instead.

```ts
const address = request.getBody('address').min(42).max(42).asString();
```

The builder throws on failure. `schema` entries on routes therefore shape **responses** (and documentation), not request validation.

### Errors are thrown response objects

`utils/response.ts` exports `BadRequestResponse` / `UnauthorizedResponse`. Their constructors `return` an object literal, so `new BadRequestResponse('X')` evaluates to a plain `{ statusCode, result }` — not an `Error`, and with no stack trace. Handlers `throw` these; `setErrorHandler` in `main.ts` reads `statusCode` and `result`. Anything not in its known-status list becomes a logged 500.

### Plugin registration order is load-bearing

In `main.ts` the order is typeorm → authentication → ratelimit → validator → cookie → autoload. **`authenticationPlugin` must stay before `ratelimitPlugin`**: the auth plugin `decorateRequest`s `account_id` to `0` and populates it in a `preHandler` hook, and the rate limiter skips requests where `account_id !== 0` so limits apply to anonymous callers only. Reversing them disables rate limiting.

Both plugins are `preHandler` hooks keyed off `request.routeOptions.config`, which is what the `authGuard()` / `authRole()` / `rateLimit()` spreads in a service's `config` object populate. `authGuard` and `authRole` currently have no callers because every route is public; they are the only mechanism for protecting a route.

Rate-limit state is an in-process `LRUCache` (`utils/lru.ts`), so limits are per-instance, not global. `rateLimit(name, count, time)` takes **`time` in milliseconds**; the plugin converts it to the unix-seconds value it stores and reports via `X-RateLimit-Reset`.

### Database: no migrations

`plugins/typeorm.ts` builds the `DataSource` from `NODE_DB` as a connection URL and discovers entities by glob (`**/*.entity.{ts,js}`) — entities are never imported by name, so adding an `*.entity.ts` file registers a table.

`synchronize` and `logging` are both tied to `NODE_ENV === 'development'`. There is no migration tooling: **in development, removing or renaming an entity column or class will drop the corresponding table/column on next start.** In production `synchronize` is off, so schema changes must be applied by hand.

Column types must be PostgreSQL-valid — notably `timestamp`, not MySQL's `datetime`.

### Authentication is wallet-only

There is no password auth. `POST /account/wallet/nonce` → `POST /account/wallet/sign-in`, implemented in `routes/account/account.service.ts`:

- The **server authors the sign-in message** and stores it on an `account_nonce` row; the client never supplies message text. Verification runs against the stored copy, so there is no message parser and no client-controlled domain.
- The nonce is single-use with a 5-minute TTL, consumed by a conditional `UPDATE ... WHERE consumed_at IS NULL` that proceeds only when `affected === 1`, and consumed **before** signature verification.
- `viem`'s `recoverMessageAddress` verifies the signature. This is EOA-only — smart-contract wallets (EIP-1271) are not supported.
- Addresses are stored lowercase, checksummed via `getAddress` only for display inside the message.
- First sign-in auto-creates the `Account` row.

Tokens are HMAC-signed JSON (`plugins/authentication.ts`), not JWTs. Lifetimes are the `SESSION_ACCESS_TIME` / `SESSION_REFRESH_TIME` constants in that file, not env vars.

`startSession()` writes an `AccountSession` row and sets a `refresh` cookie scoped to `/account/refresh` and `/account/sign-out` — **neither route exists**, so that path is currently write-only. The session row is what the access token's `sid` claim references.

### Logging

`utils/logger.ts` owns the single pino instance; `main.ts` passes it to Fastify as **`loggerInstance`** (v5 requires that for a prebuilt instance — the `logger` option only takes an options object). Because Fastify uses that same instance, `request.log` is a child of it carrying `reqId`.

- Inside a request handler or hook, use `request.log` — it correlates the line to the request.
- Outside request scope (startup, shutdown, plugin wiring), use `createLogger('module')`.

Redaction is configured structurally on the instance (`redact` paths), not per call site, so credentials nested inside an error or config object are still censored. Add new secret-bearing field names to `redactPaths` rather than filtering at the call site.

`config.ts` must not import the logger — `logger.ts` imports `config` for `NODE_ENV`, and the reverse would be a cycle.

### Configuration

`utils/config.ts` reads every value through a `builder()` that **throws at import time** if the variable is missing, so a missing key is a startup crash rather than a runtime surprise. Keys live in `.env.example`. Adding a config value means adding it there, to the builder, and to the default export.

`trustProxy` is set to `'127.0.0.1'` (not `true`) in `main.ts`, since `request.ip` is the rate-limit key and a blanket `true` lets any caller spoof `X-Forwarded-For`.

## Known gaps

- `account_nonce` rows are written by an unauthenticated endpoint and never pruned.
- The refresh-token flow has no endpoints (see above), so `@fastify/cookie` and `NODE_COOKIE` exist only for a cookie nothing reads.
- `account_session.token` stores the refresh token in plaintext; a database compromise would hand over live sessions.
- Request body schemas in `*.schema.ts` are inert, since `setValidatorCompiler` disables request validation. Only the `response` half is enforced.
