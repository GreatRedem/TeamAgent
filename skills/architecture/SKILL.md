---
name: architecture
description: "Use when changing NuraAI architecture, module boundaries, API ownership, service dependencies, or repository structure. Keeps implementation aligned with docs/10-architecture.md and docs/16-backend-architecture.md."
---

# NuraAI Architecture

Use the repository documentation as the design authority, especially `docs/10-architecture.md`, `docs/16-backend-architecture.md`, and `docs/19-tech-stack.md`.

## Rules

- Keep the API, worker runtime, workflow engine, and integration adapters as explicit boundaries.
- Put domain behavior in `apps/api/src/modules/<domain>` — `routes.ts` for the HTTP surface and `service.ts` for the logic, with any further file named after the concern it owns. Cross-cutting infrastructure is `apps/api/src/lib`; the web app is a separate build artifact and nginx serves it.
- There is no shared package yet. Workspaces are declared for `apps/*` and `packages/*`, so a contract two applications both need belongs in `packages/shared` the day it exists; until then it lives in `apps/api/src/lib`, and application internals never move into shared code.
- Treat teams as the tenant boundary. Every tenant-scoped operation must carry and verify `team_id`.
- Do not add Redis, a message broker, or a second datastore. That decision is written down rather than implicit — `docs/19-tech-stack.md` for the engine, `docs/23-job-queue.md` for the broker — so changing it means changing those documents first.
- Prefer a small vertical slice that is executable and tested over placeholder modules.

## Before editing

1. Read the nearest relevant document and existing neighboring module.
2. State the owning boundary and the invariant it must preserve.
3. Add or update a focused test with the change.

## Validation

Run the narrowest available check first, then `npm run build` or the relevant workspace test command.
