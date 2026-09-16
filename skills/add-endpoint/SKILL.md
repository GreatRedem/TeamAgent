---
name: add-endpoint
description: Add or change a REST endpoint in the NuraAI API following its conventions — response envelope, cursor pagination, team scoping, per-request permission resolution, the NOT_FOUND-not-FORBIDDEN rule, audit records, and the error taxonomy. Use when designing, documenting, or implementing any route.
---

# Add an endpoint

`docs/15-api.md` is the contract. These are the conventions that are easy to get subtly wrong, and the two rules specific to this API that a conventional checklist would not produce.

## Shape

**Route pattern** — team-scoped unless there is a reason not to be:

```
GET    /teams/:teamId/things
POST   /teams/:teamId/things
GET    /teams/:teamId/things/:thingId
PATCH  /teams/:teamId/things/:thingId
DELETE /teams/:teamId/things/:thingId
```

Unscoped routes exist only for genuinely global resources (`/models`, `/auth/*`, `/users/:id`). If you are adding one, say why in the doc — `/models` already carries an unresolved scoping question because the route is global while `model.manage` is per-team.

**Envelope** — every response, success and failure:

```json
{ "success": true, "data": {}, "error": null, "request_id": "req_123456" }
```

**Pagination** — every list endpoint, cursor-based:

```json
{ "items": [], "next_cursor": "eyJpZCI6…", "has_more": true }
```

`limit` defaults to 50, caps at 200. **There is no unpaginated list**, including ones that look small today — `audit_logs` and `tool_calls` are the highest-volume tables in the system, and a client that learned to expect a full array breaks when a team grows. Offset pagination is not offered: these tables are append-heavy, so an offset scan both degrades and silently skips rows as new ones arrive mid-traversal.

## Authorization

- The caller is authenticated.
- The caller is a member of the target team, or holds a key issued by it.
- **Permissions are resolved per request**, from the database — never read from a token claim. A permission in a 15-minute JWT means a removed member keeps acting for up to fifteen more minutes with every check passing. Do not add a TTL cache in front of this; that is the same defect relocated.
- The `ver` claim is checked against `users.token_version`, which is what makes revocation immediate.

### The two rules specific to this API

**A resource in another team returns `NOT_FOUND`, never `FORBIDDEN`.** Returning `FORBIDDEN` turns the API into an existence oracle: a caller can enumerate which ids are real in teams they cannot read. Both cases return `NOT_FOUND`, and the isolation test asserts the two are indistinguishable.

**Authentication is not trust.** An authorized request establishes *who is calling*. It says nothing about whether the content it carries is safe to act on. If this endpoint accepts content that will reach a model context, see below.

## If the endpoint accepts content

Then it is an **ingress**, and it needs an explicit trust label with no fall-through default:

| Caller | Label |
|---|---|
| Session-authenticated user | `user_input` |
| API key | the key's `trust_ceiling`, default `untrusted` |
| Webhook | `untrusted`, after signature verification and replay rejection |

A new ingress that does not assign a label must fail closed at `untrusted`. Use the `threat-review` skill before designing it — this is the class of gap that produced T16.

## Errors

Use the taxonomy from `docs/16-backend-architecture.md`. Do not invent a code:

`UNAUTHORIZED` · `FORBIDDEN` · `NOT_FOUND` · `INVALID_INPUT` · `RATE_LIMITED` · `EXTERNAL_PROVIDER_ERROR` · `TOOL_EXECUTION_FAILED` · `WORKFLOW_TIMEOUT` · `INTERNAL_SERVER_ERROR`

Never pass a raw provider error through. Always include `request_id` — it is what support will ask for.

## Audit

Any sensitive action writes an `audit_logs` row: actor, action, resource, outcome, reason, `ip_address`, `trace_id`.

**Denials are recorded, not only successes.** A failed authorization attempt is exactly the signal an investigation needs.

Audit rows are **transactional writes**, never log lines, and never sampled (`22`).

## Validation

Fastify JSON Schema on the route. The same mechanism validates tool arguments, which keeps one validation path rather than two.

Validate the narrowest types the field allows — enums over free strings, bounded integers, allowlisted identifiers.

## Documenting it

In `docs/15-api.md`, in the right numbered section, with:

- the route and one line saying what it does
- the permission it requires
- a request body example, if it takes one
- a response example, if the shape is not obvious
- **any security-relevant behaviour stated inline** rather than left to the reader

That last one is the difference between a doc that gets implemented correctly and one that gets implemented plausibly. Compare: "Register a tool" versus "`risk_tier` is required; registration fails without it."

If you add a section, renumber the rest and update the Resource Groups list at the top. `docs-check` does not verify section numbering.

## Checklist

- [ ] Team-scoped, or a stated reason why not
- [ ] Envelope with `request_id`
- [ ] Cursor pagination if it lists
- [ ] Permission stated, resolved per request
- [ ] Cross-team access returns `NOT_FOUND`
- [ ] Trust label assigned if it accepts content
- [ ] Error codes from the taxonomy
- [ ] Audit row for sensitive actions, including denials
- [ ] Documented in `15` with security behaviour inline
- [ ] Isolation test: two teams, query as A, assert nothing from B — including the error path
- [ ] `docs-check` clean
