---
name: add-permission
description: Add, remove, or retier a permission in the NuraAI catalogue, updating every place that must change — the catalogue table and its count in 07, the count reference in 14, role mappings, tests, and the endpoints it gates. Use whenever a permission name is introduced or changed.
---

# Add a permission

The catalogue in `docs/07-permission.md` is the single source of truth for the permission vocabulary. Adding an entry touches five files, and the two easiest to miss are the counts — which is why `docs-check` verifies them.

## 1. Decide the two columns that do real work

Everything else in the row is description. These two are policy.

**`risk_tier`** — drives the capability matrix in `17` C2. What a run may do depends on this tier *and* the trust level of its context.

| Tier | The test |
|---|---|
| `read_only` | No effect outside the run |
| `reply` | Egress confined to the originating conversation |
| `write` | Mutation, spend, or egress to any destination other than the origin |
| `admin` | Configuration, permissions, credentials, billing |

Pick the tier by the *worst* thing the permission allows, not the typical thing. A permission that usually reads but can write is `write`.

**`applies_to`** — `user`, `agent`, or `both`. Marking it `user` means an agent may never hold it, enforced by invariant **R3** as a database trigger.

Mark it `user` if exercising it would let an agent change what agents are allowed to do, reach a credential, spend money, or alter membership. When in doubt, `user` — widening later is a migration, narrowing later is a security incident.

> An `admin` tier and `applies_to: both` is a contradiction. R3 will reject every grant. If a permission is `admin`, it is `user`.

## 2. Add the row

In `docs/07-permission.md`, in the correct category block, keeping the existing column order:

```
| `thing.action` | tier | applies_to | O | A | M | E | V | Description |
```

Role columns are Owner, Admin, Manager, m**E**mber, Viewer — `Y` or blank, never `N`.

Default the role mapping conservatively. The header already notes the mapping is a starting proposal and that the manager and member rows need review before launch; do not quietly widen it while adding something unrelated.

## 3. Update both counts

Two places state how many permissions exist, and they must agree with the table:

- `docs/07-permission.md` — the `NN permissions.` line below the table.
- `docs/14-database.md` — the `NN-entry list` reference in the Authorization group.

`docs-check` fails if either disagrees with the row count.

## 4. Follow the consequences

**If it gates an endpoint** — say so in `docs/15-api.md` on that endpoint. An endpoint whose permission is implied rather than stated gets implemented with whatever the adjacent handler used.

**If it is `write` or `admin`** — check `docs/17-threat-model.md`:
- `admin` means the capability must be unreachable from a run. Confirm it is a human action against the API.
- `write` means it cannot execute unattended on untrusted context. If a workflow is expected to use it, that workflow needs a pre-approved narrow rule or it will be denied (T7).

**If it governs a security control** — add it to the Schema Support table in `17`, and add a test in `docs/21-testing.md`. The coverage checklist there requires every tool `risk_tier` assignment be tested; a permission gating a control deserves the same.

**If it is a tool permission** — the effective tier for a call is the higher of the `tool.execute` grant and the invoked tool's own `risk_tier`. Holding `tool.execute` authorizes nothing by itself.

## 5. Check

```bash
python skills/docs-check/check.py
```

## Removing or retiering

**Removing** — delete the row, decrement both counts, and grep for the name across `docs/` and `.claude/`. A permission cited in `15` or `21` after removal is a broken reference the counts will not catch.

**Retiering upward** (`read_only` → `write`, or anything → `admin`) is a behaviour change, not an edit. Existing grants keep working but start requiring approval, or stop working entirely if the new tier is `admin` and an agent holds it — R3 will reject the row on the next write. Say so in the change, and check whether any seeded role mapping now needs adjusting.

**Retiering downward** is a security change and needs the threat-review skill, not this one.
