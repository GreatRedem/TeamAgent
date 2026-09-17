---
name: backend-module
description: "Use when implementing or reviewing a Fastify backend module, route, service, validation schema, or API contract in NuraAI."
---

# NuraAI Backend Modules

Follow the API contract in `docs/15-api.md` and service ownership in `docs/16-backend-architecture.md`.

## Module shape

A module is a directory, `apps/api/src/modules/<domain>/`, that keeps related code together and exposes a small public surface:

```text
modules/<domain>/
  routes.ts          # HTTP surface: body and query parsing, permission, envelope
  service.ts         # domain behaviour and mutations
  <concern>.ts       # one per concern, once the module has more than the two above
  <concern>.test.ts  # colocated with the file it tests
```

Start with `routes.ts` and `service.ts`, and add a file only when there is code to put in it — do not create empty ceremony. Where a module grows, the extra files are named after the concern they own rather than a layer: `agents/runs.ts`, `auth/siwe.ts`, `tools/ssrf.ts`, `jobs/queue.ts`. The `<domain>.routes.ts` / `<domain>.service.ts` / `*.repository.ts` shape is not this codebase's convention; do not introduce it.

## Rules

- Validate all external input before domain logic.
- Resolve the authenticated principal and team scope before querying resources.
- Return the documented common response and error shape.
- Keep route handlers thin; put decisions and mutations in services.
- There is no repository layer. A route passes what it needs out of `ApiDeps` (`modules/deps.ts`) — `deps.db` above all — into the service, and the query is written where the decision is made. That keeps the `team_id` predicate visible at the call site instead of a hop away.
- Never log secrets, tokens, prompts, message bodies, or raw credentials.
- Add tests for success, authorization failure, validation failure, and cross-tenant access.
