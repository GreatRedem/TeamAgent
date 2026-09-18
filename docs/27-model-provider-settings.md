# Model Provider Settings (spec)

Team admins configure the model provider from the console Settings screen
instead of deployment environment variables. `MODEL_BASE_URL` /
`MODEL_API_KEY` leave the local `.env`; the environment remains as a
fallback so single-provider and provider-less deployments keep working.

## Why this is security work, not a settings form

A provider setting is an egress and spend control. Whoever writes
`base_url` decides where every prompt, completion, and retrieved context
chunk for the team is sent. A relayed or malicious write that points the
team at an attacker proxy is silent, total exfiltration — worse than any
single tool grant, because the model sees everything. So this slice gets
the same controls as a trust change, not the same treatment as a display
name edit:

- human-only writes (`requireUser`, like knowledge trust): machine API keys
  must never set provider credentials, or a relay could repoint the team's
  model endpoint to itself;
- permission-gated reads and writes on new catalogue entries
  (`provider.view`, `provider.manage`), resolved per request like every
  other permission — never a role-name check in the UI;
- encryption at rest with rotation, masked reads, and audit on every
  mutation (sections below).

## Current state

- `apps/api/src/runtime/model/provider.ts` builds one process-global
  provider from `MODEL_BASE_URL` / `MODEL_API_KEY` / `MODEL_TIMEOUT_MS`.
  Both empty means `UnconfiguredProvider`, and runs fail closed with
  `MODEL_MISCONFIGURED`.
- The pair must be set together or both omitted (`apps/api/src/config.ts`).
- The web console has no Settings screen (placeholder); locale already
  lives in the frontend (`apps/web/src/i18n/`), which is the precedent for
  moving team-facing configuration out of the API env contract.

## Design

### Storage

New table `team_provider_settings`, one row per team (`team_id` primary
key, foreign key with cascade delete):

| Column | Notes |
|---|---|
| `base_url` | Plain text. The endpoint host is needed for validation, health display, and audit; it is not secret. |
| `encrypted_api_key` | `bytea`, nullable. Envelope-encrypted (section below). Null means "no key stored". |
| `key_id` | Which data key encrypted the value; required when a key is stored; enables rotation. |
| `timeout_ms` | Positive integer, default 60000. |
| `updated_by` | Non-null user id. A provider change with no human behind it must not exist. |
| `updated_at`, `created_at` | Timestamps; `updated_*` is shown in the UI as "last changed by/at". |

Forward-only migration. No rows are seeded: absent row means "no team
override", which preserves today's behavior exactly.

### Encryption

- Envelope encryption with a 32-byte data key supplied by the deployment
  (`SETTINGS_ENCRYPTION_KEY`, new required env key with `key_id` rotation
  support: `SETTINGS_ENCRYPTION_KEY_ID`). AES-256-GCM via Node's built-in
  `crypto`; no new dependency.
- The data key never leaves the API/worker processes, is never logged, and
  never returned by any endpoint. KMS-backed keys are a later upgrade; the
  `key_id` column exists so rotation does not require re-architecture.
- Rotation procedure: deploy new key id, re-save settings (re-encrypts on
  write), retire the old key. A row whose `key_id` is unknown fails closed
  at resolution time with an explicit error, never with a skipped call.
- The log sentinel-scan test (`docs/21-testing.md`) must cover the new
  columns and any resolution path: a key that reaches a log line has left
  the tenant boundary (`docs/17-threat-model.md` T9).

### API contract (team-scoped, envelope-shaped like the rest of `docs/15`)

- `GET /teams/:teamId/provider` (`provider.view`): returns `base_url`,
  `timeout_ms`, `has_api_key` (boolean — never the key, not even masked
  beyond a last-4 display decided at implementation time),
  `updated_by`, `updated_at`, and `source`: `"team"` or `"environment"`,
  so the screen always says which layer is live.
- `PUT /teams/:teamId/provider` (`provider.manage` + human): accepts
  `base_url` + `api_key` together, new `timeout_ms` alone, or an explicit
  `clear: true` that deletes the row (falling back to environment). Empty
  key with a URL is rejected, mirroring the env pair rule. Every accepted
  write records an audit row with the actor, never the secret.
- `POST /teams/:teamId/provider/test` (`provider.manage` + human,
  explicitly invoked, audited): performs one minimal provider call
  (model list, no team data) and reports reachable/authentication-failed/
  timeout. A save must never silently test — the call costs money and the
  operator must choose it.

Validation at write time: `https:` URL in production (plain-`http`
loopback is accepted only when `NODE_ENV` is not production, for local
stubs); no userinfo in the URL; private-range hosts rejected unless the
deployment documents a VPC-internal provider. These mirror the SSRF
posture of the tool layer (`docs/17` C8): the provider URL is a
server-side fetch target chosen by a human, so it gets the same
resolve-then-connect suspicion as any other.

### Runtime resolution

`modelProviderFromConfig()` becomes `modelProviderForTeam(teamId)`:

1. Team row present and decrypts → use it.
2. No row → today's environment behavior (configured provider or
   `UnconfiguredProvider`).
3. Row present but undecryptable (unknown `key_id`) → fail the run closed
   with an explicit configuration error, not a provider retry loop.

API and worker resolve identically per run (both read the row; a short
TTL cache is permitted only if invalidation on write is specified at
implementation time). Per-run resolution keeps a mid-flight provider
switch from changing a run already executing; a run pins what it
resolved at start, like every other run input.

### Console screen

A Settings → Model provider screen under the existing screen conventions
(`docs/24`, `docs/25`, `skills/add-screen`):

- Shows the live `source` (team vs environment), `base_url`,
  `timeout_ms`, key presence, and last-changed attribution together —
  the reviewer must see what is live, not just what the form holds.
- The secret field is write-only with a native confirm dialog
  (`showModal`, Cancel focused): saving repoints team egress and spend,
  clearing falls back to the environment provider. No bulk actions, no
  default decisions.
- Loading, empty (no override → environment live), error with
  `request_id`, and denied states; EN/FA copy; effective-permission
  gating on `provider.view` / `provider.manage`.

## What stays out of this slice

- Multiple named providers per team and per-agent provider overrides:
  deferred. One team override plus the environment fallback covers the
  MVP scope (single provider, `docs/13-roadmap.md`).
- Spend ceilings per provider: budgets (`docs/17` C10) are unchanged by
  this slice; a provider switch does not reset or raise any budget.
- KMS integration, per-key usage metering, automatic rotation.

## Rollout order

1. Migration + encryption helpers with roundtrip/rotation unit tests.
2. API endpoints with tests: tenant isolation (404 across teams),
   human-only writes, pair rule, masked reads, audit rows, fallback
   `source` reporting.
3. Runtime resolution + worker parity, fail-closed on unknown `key_id`.
4. Console screen with permission gating and confirm dialogs.
5. Sentinel-scan coverage for the new secret path; runbook entry for
   "provider test failing" and "unknown key id".

## Open decisions (decide before implementation)

1. Masked display: last-4 of the key, or presence boolean only?
2. Test-call shape: provider model-list call, or a zero-token
   no-op where the provider supports one?
3. Cache TTL for per-run resolution, or read-through every run?
