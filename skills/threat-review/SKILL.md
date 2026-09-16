---
name: threat-review
description: Walk a proposed feature, endpoint, connector, tool, or schema change against the NuraAI trust model before building it — checking whether it adds an ingress, an egress, a capability, a stored content type, or a trust boundary crossing. Use when designing or reviewing anything that touches agents, sources, tools, workflows, knowledge, API keys, or the runtime.
---

# Threat review

`docs/17-threat-model.md` is the security document that constrains the runtime design. This skill is how a change gets checked against it *before* the change is built, because every control in that document is cheap to include up front and expensive to retrofit.

The failure this exists to prevent has already happened once in this repo: API keys were specified as a machine-to-machine mechanism for months before anyone asked what trust level a key-authenticated request carries. The answer turned out to be a hole straight through the capability model (T16).

## The five questions

Ask all five of every change. Most changes answer "no" to most of them; the ones that answer "yes" have work attached that is easy to miss.

### 1. Does it add an ingress — a new way content enters a model context?

If content can reach a context through this change, **it needs an explicit trust label assigned at the ingress path**, with no fall-through default.

The existing ingress paths and their labels:

| Ingress | Label |
|---|---|
| Interactive session | `user_input` |
| Inbound source message | `untrusted` |
| Webhook trigger payload | `untrusted` |
| Retrieved knowledge | the item's own `trust_level` |
| Tool result | `untrusted`, unconditionally |
| API key submission | the key's `trust_ceiling`, default `untrusted` |

Attached work: the label, a test that asserts it (`21` suite 7 is the model), the injection corpus run through the new path (`21` suite 6), and an `ingress` value in the log fields (`22`).

**A new ingress that does not assign a label is a bug.** It must fail closed at `untrusted`, never inherit whatever the caller had.

### 2. Does it add an egress — a new way content leaves?

Then the destination must come from configuration, never from model output (C3).

- Does it resolve a destination the model proposed? It must resolve from `allowed_destinations` by identifier, deny anything outside it, and record the denial. No normalization rescue, no fuzzy matching.
- Is reply-to-origin sufficient? Prefer it. It is the `reply` tier and it gives an attacker nothing (C4).
- If it can initiate, invariant **R4** applies: a non-empty allowlist is required, enforced by a CHECK.
- Does it render content anywhere? Then T6 applies — markdown images and links are an exfiltration channel that needs no send permission, and they are stopped at render time or not at all (`24`).

### 3. Does it add a capability — something an agent or a run can do?

Then it needs a `risk_tier`, `NOT NULL` with no default.

| Tier | Test |
|---|---|
| `read_only` | No effect outside the run |
| `reply` | Egress confined to the originating conversation |
| `write` | Mutation, spend, or egress to a new destination |
| `admin` | Configuration, permissions, credentials, billing |

Two consequences to check:

- **If the answer is `admin`, no agent may hold it** (`applies_to: user`, invariant R3). Confirm the capability is reachable only by a human against the API, on a path that does not traverse the agent runtime.
- **If it is `write`, it cannot run unattended on untrusted context.** That is the intended cost. An unattended workflow needing it must narrow the action until it is safe by construction — a fixed destination, a fixed template, a bounded range — rather than widening the grant (T7).

### 4. Does it store content that will later re-enter a context?

Then it needs provenance: a trust level defaulting to `untrusted`, plus where it came from and who put it there.

`knowledge_items` is the model — `trust_level`, `trusted_by`, `trusted_at`, `ingested_from`, `ingested_by`. Trust is an action a human takes and is never inferred by a pipeline from a domain name, a file type, or the fact that a fetch was authenticated.

Without `ingested_from` a poisoned corpus cannot be traced back after the fact, which is the whole difficulty of T3.

### 5. Does it cross a boundary where the trust label could be dropped?

This is T8, and it is the subtlest of the five. The boundaries in this system:

- **Workflow step to step** — inherited trust is the minimum of a step's own inputs and every upstream step that fed it, persisted on `workflow_step_runs`.
- **The job queue** — `jobs.context_trust_level` carries it across, the same way `trace_id` does. A queue hop is exactly where a label silently resets to a default.
- **Agent to agent** — output from a low-privilege agent consumed by a high-privilege one arrives laundered unless the label rides along.
- **Model provider** — a completion is derived from its context and carries no more trust than its inputs (T15).

Trust only ever decreases. A change that lets it increase needs an explicit argument, and the default answer in `17` open decision 2 is no.

## Then check the cross-cutting controls

- **C9 — secrets.** Does anything resolve a credential? It belongs inside the tool runtime, after arguments are fixed, never in a context, a run record, a `tool_calls` row, an audit log, or a span.
- **C10 — budgets.** Can this loop, recurse, or fan out? Token spend, tool count, depth, and wall clock are enforced by the runtime and not adjustable from inside a run.
- **C11 — audit.** Is the attempt recorded before it executes, including when denied? A run's own narrative is evidence of nothing (T13).
- **C12 — isolation.** Is every query team-scoped at the repository layer? Does a resource in another team return `NOT_FOUND` rather than `FORBIDDEN`, so the API is not an existence oracle?

## Write it down

A change that answers "yes" to any of the five questions is a change to the threat model, not just to the code. Update:

1. **`17`** — a new `T` entry if it is a new threat, or an addition to an existing one. Add the schema column to the Schema Support table and the item to the Pre-Launch Checklist.
2. **`14`** — the column, with its default and its constraint.
3. **`21`** — a test. A control with no test is a control that will be refactored away silently.
4. **`22`** — a metric, if the control firing is observable. The most valuable alerts in this system are the ones that should read zero.
5. **`15`** — the endpoint, if a human needs to configure it. A control with no product surface is unreachable; that is how `allowed_destinations` sat in the schema with no way to populate it.

Then run `docs-check`.

## The two that matter most

If a review has to be short: **C2** (capability depends on context trust) and **C3** (destinations come from configuration). Everything else raises cost or improves forensics. If the design is ever reduced for expedience, reduce the prompt-level mitigations first and keep the structural ones — a well-engineered prompt is worth very little, and an allowlist the model cannot expand is worth a great deal.
