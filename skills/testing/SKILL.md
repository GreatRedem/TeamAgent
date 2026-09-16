---
name: testing
description: "Use when adding or reviewing NuraAI unit, integration, security, tenant-isolation, queue-concurrency, contract, or end-to-end tests."
---

# NuraAI Testing

Use `docs/21-testing.md` as the test strategy and `docs/18-production-checklist.md` as the release gate.

## Rules

- Test real behavior and failure modes, not implementation details or mock call counts.
- Keep policy decisions pure and fast; mock only at the model gateway boundary.
- Every integration fixture includes at least two teams to expose missing tenant predicates.
- Prefer negative security assertions: the forbidden action fails and the denial is recorded.
- Cover all twelve C2 capability cells, R1-R5, C3 destination behavior, W1-W8 wallet threats, and prompt-injection containment.
- Run database integration tests on PGlite against the committed migrations. One engine, one matrix.
- Keep real-provider model evaluations separate from deterministic CI tests.
- Add a regression test for every security bug.

## Validation order

Run the smallest focused test first, then the workspace suite, then build/typecheck and lint.
