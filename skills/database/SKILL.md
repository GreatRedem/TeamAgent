---
name: database
description: "Use when designing Drizzle schemas, migrations, repositories, indexes, constraints, or tenant isolation for NuraAI."
---

# NuraAI Database

Use `docs/14-database.md` as the schema intent and `docs/19-tech-stack.md` for the engine decision.

## Rules

- Every tenant-scoped table carries `team_id` directly.
- Store references to secrets, never recoverable secret values.
- Generate IDs in application code.
- Use string status fields with checks rather than database enums.
- Make destructive cascades explicit; use restrict for ownership references.
- Keep workflow definitions versioned and make executions reference immutable versions.
- Treat R1-R5 as executable invariants, not documentation claims.
- PostgreSQL is the only supported engine. There is no dialect switch, and the schema is free to use native `uuid`, `jsonb`, partial indexes, triggers, and `SKIP LOCKED` rather than a portable subset.
- Review generated migrations for accidental drop-and-add operations.

## Required verification

Test foreign keys, checks, cascade/restrict behavior, tenant isolation, idempotency uniqueness, and the R3/R4 security invariants against PGlite, running the committed migrations rather than a schema push.
