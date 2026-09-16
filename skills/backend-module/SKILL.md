---
name: backend-module
description: "Use when implementing or reviewing a Fastify backend module, route, service, repository, validation schema, or API contract in NuraAI."
---

# NuraAI Backend Modules

Follow the API contract in `docs/15-api.md` and service ownership in `docs/16-backend-architecture.md`.

## Module shape

A module should keep related code together and expose a small public surface:

```text
modules/<domain>/
  <domain>.routes.ts
  <domain>.service.ts
  <domain>.repository.ts
  <domain>.schema.ts
  <domain>.types.ts
  index.ts
```

Use the files that are actually needed; do not create empty ceremony.

## Rules

- Validate all external input before domain logic.
- Resolve the authenticated principal and team scope before querying resources.
- Return the documented common response and error shape.
- Keep route handlers thin; put decisions and mutations in services.
- Use repositories for database access and enforce tenant predicates there too.
- Never log secrets, tokens, prompts, message bodies, or raw credentials.
- Add tests for success, authorization failure, validation failure, and cross-tenant access.
