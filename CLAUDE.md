# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root (npm workspaces):

```bash
npm run dev            # both: concurrently runs dev:api + dev:web
npm run dev:api        # backend only: tsx watch on backend/src/main.ts
npm run dev:web        # frontend only: vite dev server on :1001
npm run build          # both workspaces
npm run build:api      # tsc -> .dist-backend/
npm run build:web      # tsc --noEmit && vite build -> .dist-frontend/
npm run lint           # oxlint over the whole repo
npm run lint:fix
npm run format         # oxfmt -- see the warning below before running
npm run format:check
```

Typecheck without emitting: `cd backend && npx tsc --noEmit`, or `npm run typecheck` for the frontend.

**Both workspaces build to the repository root**: `.dist-backend/` (from `backend/tsconfig.json` `outDir`) and `.dist-frontend/` (from `vite.config.ts` `build.outDir`). Both are gitignored via `.dist-*` — note a plain `dist-*` pattern would *not* match a dot-prefixed name.

Because `.dist-backend/` sits at the root, Node resolves its module type from the **root** `package.json`, which is why that file carries `"type": "module"`. Removing it makes Node re-parse every emitted file and warn `MODULE_TYPELESS_PACKAGE_JSON`.

Deployment is a systemd unit driven by `scripts/*.sh`, exposed as `npm run service:install|start|stop|status|restart|uninstall|deploy`. `service-install.sh` sets `WorkingDirectory` to the repository root and `ExecStart` to `.dist-backend/main.js` (override with `SERVICE_PATH_APP`). The working directory matters beyond the binary path: `dotenv` resolves `.env` from the process cwd, and `.env` lives at the root — running the service from `backend/` instead loads zero variables.

**There is no test framework configured.** Don't invent a `npm test` invocation; verify changes with `tsc --noEmit`, `npm run build`, and `npm run lint`.

The one exception is a plain self-check script, run directly and exiting non-zero on failure:

```bash
cd backend && npx tsx src/routes/team/team.service.test.ts       # Telegram probe, stubbed fetch, no network
cd backend && npx tsx src/routes/telegram/telegram.service.test.ts   # webhook body parser
cd backend && npx tsx src/routes/model/model.service.test.ts         # model connectivity probe
cd backend && npx tsx src/routes/telegram/telegram.permission.test.ts  # profile permission rules
```

## Formatting warning

Tooling is oxlint + oxfmt, configured at the repo root (`.oxlintrc.json`, `.oxfmtrc.json`). The source is written in **Allman brace style** (`{` on its own line), which oxfmt — being Prettier-compatible — cannot express. `npm run format:check` currently reports 23 of 26 files as needing changes, and running `npm run format` will reformat nearly the whole codebase to K&R. A few files (`main.ts`, `tsconfig.json`) have already been converted, so the tree is mixed. Match the surrounding file's style; do not run `npm run format` casually.

oxlint silently ignores unknown rule names, so a typo in `.oxlintrc.json` is a rule that quietly does nothing.

## Architecture

Two npm workspaces:

- **`backend/`** — Fastify + TypeORM + PostgreSQL, ESM, TypeScript.
- **`frontend/`** — React 19 + Vite 8 + lucide-react, TypeScript.

### Frontend

The client never hardcodes a backend origin. It calls `/api/...` on its own origin; `vite.config.ts` proxies that to the backend in development and strips the `/api` prefix so paths match the routes Fastify registers. That proxy reads `NODE_PORT` from the root `.env` via Vite's `loadEnv`, so the backend port is defined in one place; the prefix passed to `loadEnv` is the full variable name so the rest of `.env` (notably `NODE_DB`) is never read into the frontend config. In production nginx serves `.dist-frontend/` and proxies `/api` the same way. The base is the constant `/api` in `src/lib/api.ts`; there is no env var for it.

Routing is **react-router v8 in declarative mode** — import from `react-router`, not the older `react-router-dom`. `main.tsx` mounts `<BrowserRouter>`, `App.tsx` holds the `<Routes>` table, and `components/Layout.tsx` is the shell rendering `<Outlet />`. Pages live in `src/pages`.

Because it is a client-routed SPA, any host serving `.dist-frontend/` must fall back to `index.html` for unknown paths (nginx `try_files $uri /index.html`), or a deep link like `/dashboard` 404s.

`src/lib/session.ts` is the single place the access token is read/written, so moving it out of `sessionStorage` later is a one-file change.

`src/lib/api.ts` is the only place that talks to the backend, and its `ApiError` carries the backend's `{ result: 'ERROR_CODE' }` envelope. Keep new endpoints there rather than calling `fetch` from components.

Wallet sign-in uses the raw EIP-1193 provider (`window.ethereum`) — `eth_requestAccounts` then `personal_sign` over the server-authored message. There is deliberately no wallet SDK; adding wagmi/RainbowKit would be a real decision, not a detail.

`.oxlintrc.json` has a `frontend/**` override enabling the `react` and `jsx-a11y` plugins with a browser env; backend files keep the node env.

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

### Telegram ingestion is a webhook, not a poller

Inbound messages arrive at `POST /telegram/webhook/:botId`, the one route with no `authGuard` — Telegram has no account here. What protects it is `team_bot.webhook_secret`, a 32-byte value generated when a bot is created and handed to Telegram via `setWebhook`'s `secret_token`; it comes back on every delivery in `X-Telegram-Bot-Api-Secret-Token`. An unknown bot id and a wrong secret produce the identical 401, so the endpoint cannot be used to enumerate bots. A bot whose secret is still blank rejects everything, which is why bots created before that column existed must be registered before they receive anything.

The route deliberately carries **no `rateLimit`**. It is anonymous, so the limiter would otherwise apply, and a 429 makes Telegram redeliver the same update indefinitely. For the same reason it answers 200 to updates it understands but chooses not to store (group chats, other bots, messages with no text) — only a genuinely bad secret gets a non-2xx.

Deliveries are deduplicated on `(bot_id, update_id)`, because Telegram redelivers until it sees a 2xx.

Registration needs `NODE_PUBLIC_URL` (optional; unset just disables it) and is driven by `POST /team/:id/bot/:botId/webhook`. The url it registers includes the `/api` prefix that nginx strips, so the path Fastify registers does not have it.

`telegram_user.telegram_id` and the message id columns are **`bigint`, surfaced as strings**. Telegram ids already exceed 32 bits and are specified to reach 52, so reading them as JS numbers loses precision — the API returns `telegram_id` as a string for the same reason.

### Profile permissions are deny-by-default

`telegram_user.permissions` holds comma-joined keys from the catalog in `routes/telegram/telegram.permission.ts`. A key that is **absent is denied** — an empty column grants nothing, not everything — so a permission added to the catalog later is off for everyone until it is switched on deliberately. Adding one is a single entry in `PERMISSIONS` with no schema change.

The only enforcement point today is `ingestUpdate`: without `chat`, a message is acknowledged to Telegram with a 200 (so it stops redelivering) but nothing is stored, while the profile and its last-seen are still updated so the person can be found and granted access. `model` is stored and surfaced but **not yet enforced anywhere**, because there is no outbound reply path for it to gate.

Because the column arrives as `''` on rows that predate it, and `''` reads as fully denied, existing profiles must be backfilled by hand — there is no migration tooling:

```sql
UPDATE telegram_user SET permissions = 'chat' WHERE permissions = '';
```

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
- `POST /team/:id/bot/:botId/test` calls `api.telegram.org` on the caller's behalf. Because the rate limiter skips requests where `account_id !== 0`, no authenticated route is throttled, so a signed-in account can drive outbound requests at will. Fixing it means changing the plugin's skip rule, which affects every route.
- `team_model.base_url` is fetched by the server on the caller's behalf when a model is tested, which is a server-side request forgery vector: an authenticated account can point it at an internal address and learn from the outcome whether something answers there. The probe returns only a flat `ok`/`reason` and never the response body, headers or status, so the leak is coarse; closing it properly means resolving the host and refusing private ranges, which would also block the loopback URLs that local models need.
- `team_bot.token` and `team_model.api_key` store credentials in plaintext, the same exposure. It never leaves the server — handlers return a `token_hint` and the response schema omits `token` entirely — so the risk is at rest, not in transit.
- Request body schemas in `*.schema.ts` are inert, since `setValidatorCompiler` disables request validation. Only the `response` half is enforced.
