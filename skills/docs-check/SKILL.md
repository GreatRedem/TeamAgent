---
name: docs-check
description: Verify cross-document consistency across the NuraAI docs — broken links, unbalanced fences, permission and table counts that disagree between docs, references to T/C/R/W identifiers that do not exist, and reversed decisions creeping back. Run after editing any file in docs/, before committing a docs change, and whenever asked to review or audit the documentation.
---

# Docs consistency check

The docs are 25 interlocking files that reference each other by identifier (`T16`, `C2`, `R3`, `W4`) and by count ("48 permissions", "33 tables in twelve groups"). They drift. This has happened repeatedly: a permission added to the catalogue without updating the count in `14`, a control cited before it was written, a decision reversed in one doc and left standing in three others.

Run the checker first, then read for the things a script cannot see.

## 1. Run the mechanical check

```bash
python skills/docs-check/check.py
```

From the repository root. Exit 0 is clean; exit 1 lists every problem with a file and line.

It checks:

| Check | Catches |
|---|---|
| Code fences | A truncated or unclosed block |
| Relative links | A markdown link pointing at a file that does not exist |
| Doc references | `docs/NN-name.md` in prose that does not exist |
| Identifier references | Citing a threat or control number that was never defined |
| Permission count | `07`'s table rows vs its stated count vs `14`'s `N-entry` reference |
| Table count | `14`'s group headings vs its stated "N tables in M groups" |
| README index | A doc that exists but is not listed |
| Reversed decisions | A banned phrase reappearing — see below |

## 2. Reversed decisions

<!-- docs-check: allow encrypt -->

`BANNED` in `check.py` lists decisions that were made, reversed, and must not creep back — the second database engine, the inverted tool/model call order, "encrypt at rest" for credentials that are hashed, and others.

**When you resolve a contradiction, add an entry.** That is what stops the same mistake returning in six months. An entry is `(key, regex, why)`.

A section that legitimately explains why a decision was reversed opts out with a marker on its own line:

```markdown
### Why not a second engine

<!-- docs-check: allow KEY -->
```

where `KEY` is the first field of the `BANNED` entry.

The exemption covers the rest of that section and ends at the next heading. Use it only for prose that *explains* the reversal; never to silence a genuine reintroduction.

## 3. Read for what the script cannot check

The script verifies references resolve. It cannot verify they are *true*. After a clean run, check the claims that matter:

- **Does a doc describe a column, table, or endpoint that `14` or `15` does not define?** This is the most common real drift. `22` once cited `agent_runs.token_usage` and `cost_estimate` when `14` defined neither.
- **Do the skills in `skills/` still match the docs?** They are scanned too, and for good reason: three of them told an agent to keep two database dialects in parallel for days after that decision was reversed everywhere in `docs/`.
- **Does a "Suggested Fields" table in `01`–`09` match the schema in `14`?** The domain docs were written first and go stale first. Check `risk_tier`, `trust_level`, `budgets`, `allowed_destinations`, and anything versioned.
- **Is a control described in `17` wired into `21` (a test) and `22` (a metric)?** A control with neither is aspirational. Every `T` and `C` should be traceable to both.
- **Is an "open decision" in `17` or `14` actually still open?** They get settled elsewhere and left listed. Close them or reopen them consistently.
- **Do the diagrams agree with the prose in the same file?** `14`'s ERD once showed two tables the prose abolished.

## 4. Conventions the docs follow

Preserve these when editing:

- **`14` is normative for the schema, `17` for the trust model.** Other docs defer to them rather than restating.
- **Rationale and definition stay separate.** `14` explains *why* a table is shaped as it is; the Drizzle schema modules are the column-level source of truth. Do not paste DDL back into `14` — that split is deliberate and the drift it caused is documented in the file.
- **No second list of the same thing.** `07` carries the permission catalogue once. A convenience summary elsewhere will drift within a revision; it already did, and was removed.
- **Numbering is stable.** `R1`–`R5` and `W1`–`W8` are cited from several files. If enforcement changes, update the mechanism and keep the number.
- **Counts appear in at most two places** and the script checks they agree.
