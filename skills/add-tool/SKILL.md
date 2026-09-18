---
name: add-tool
description: Register a new agent tool in NuraAI with its risk tier, narrowly-typed input schema, egress controls, credential handling, and tests. Use when adding or changing any tool an agent can call — web search, database access, HTTP, code execution, media generation, or messaging.
---

# Add a tool

A tool is the only way an agent affects anything outside its own run, so it is where the trust model is actually enforced. `docs/06-tool.md` has the model; this is the procedure.

## 1. Assign the risk tier

`risk_tier` is `NOT NULL` with **no default**. Registering a tool without one must fail rather than guess — a tool that silently defaults to `read_only` is precisely the failure the tiering exists to prevent.

| Tier | The test | Examples |
|---|---|---|
| `read_only` | No effect outside the run | `web.search`, `database.read`, `knowledge.read` |
| `reply` | Egress confined to the originating conversation | replying on the chat a request arrived on |
| `write` | Mutation, spend, or egress to a new destination | `database.write`, `email.send`, `image.generate` |
| `admin` | Configuration, permissions, credentials, billing | not reachable from a run at all |

Judge by the worst thing the tool can do, not the typical thing.

**Generation counts as `write`.** `image.generate` mutates nothing and sends nowhere, and it is still `write`, because it spends money. Cost is a security property when inference is billed per token (T12).

The effective tier for a call is the **higher** of the caller's `tool.execute` grant and this tool's own tier.

## 2. Make the input schema as narrow as it can be (C7)

The model fills these fields in, and on untrusted context it is filling them in on an attacker's behalf. A permissive schema is where tool-argument injection lives (T10).

| Instead of | Use |
|---|---|
| A SQL string | A **named, parameterized query** selected by identifier |
| A URL | An **allowlisted destination identifier** |
| A file path | A **resource id** |
| A free string | An **enum**, where the set is known |
| An unbounded integer | A **bounded** one |
| Shell arguments | Nothing. Do not build this tool with model-supplied text |

Validate against `input_schema` before execution — `modules/tools/validation.ts`, Ajv, fail closed on a schema that does not compile.

This is deliberately not the mechanism the HTTP routes use. Routes validate with `zod` schemas in code; a tool's `input_schema` is JSON Schema stored on the tool row, so registration is where the constraint is declared and the runtime is where it is enforced. Do not reach for the route schemas here.

## 3. If it reaches the network, add egress controls (C8)

Mandatory for HTTP, browser, and webhook-calling tools:

- resolve-then-connect, with **rebinding protection** — re-resolving between check and connect is the bypass
- deny RFC1918, loopback, link-local, and **cloud metadata addresses**
- per-team destination allowlist
- no credential or cookie forwarding to non-allowlisted hosts
- capped redirects and capped response size

The metadata endpoint is the one to keep in mind: an SSRF that reaches it turns a web-fetch tool into credential disclosure.

## 4. If it sends anywhere, the destination comes from configuration (C3)

The model selects among pre-registered destinations **by identifier**. It never emits an address, chat ID, or URL that the runtime then uses.

Resolution happens in the runtime, after generation, against `agent_sources.allowed_destinations`. A proposal outside the list is denied and recorded — never trimmed, case-folded, or fuzzy-matched into a match. The test suite asserts that strictness precisely because the failure mode is a well-meaning developer adding leniency to fix a support ticket.

## 5. Credentials are injected, never passed

The tool declares which credential it needs **by reference** (`credential_ref`). The runtime resolves it inside the tool sandbox, at call time, after arguments are fixed.

No secret value appears in a model context, `agent_runs`, `tool_calls`, `audit_logs`, or a log line (C9, T9).

## 6. Output is untrusted

Unconditionally, with no per-tool override path.

This is the rule people argue with, because "our own tool's response" feels trustworthy. It is not: `web.search` returns pages an attacker wrote, `database.read` returns rows an attacker may have inserted, and an HTTP call returns whatever the remote host chose. Tool output also arrives *after* the system prompt, in the position models weight most heavily (T4).

The result re-enters the context labelled `untrusted` and lowers the run's effective trust for every subsequent iteration. Trust only decreases.

## 7. Record before executing

Write the `tool_calls` row with its decision and reason **before** the call runs, then update it with the outcome. A crash mid-call still leaves evidence.

Record denied and approval-pending attempts, not just successful ones. A denial returns to the model as a **structured error**, so the agent can explain the refusal rather than silently looping against it.

## 8. Bound it

Every call runs under a timeout and against the run's remaining budget — tokens, tool-call count, recursion depth, wall clock. Limits are enforced by the runtime and are not adjustable from inside a run (C10).

## Checklist

- [ ] `risk_tier` assigned explicitly; registration fails without one
- [ ] `input_schema` uses the narrowest types available; no free-form SQL, URL, path, or shell text
- [ ] Network tools: SSRF controls including rebinding protection
- [ ] Sending tools: destination resolved from `allowed_destinations`, denials recorded
- [ ] Credentials by `credential_ref`, resolved in the sandbox
- [ ] Output labelled `untrusted` with no override
- [ ] `tool_calls` written before execution, updated after
- [ ] Timeout and budget enforced
- [ ] A test asserting the tier assignment — `21`'s coverage checklist requires one per tool
- [ ] The injection corpus runs against it if it introduces an ingress (`21` suite 6)
- [ ] `22` metric if a new denial reason is introduced

Then run `docs-check`.

## When it is a new capability, not just a new tool

If the tool needs a permission that does not exist, use the `add-permission` skill for that part. If it introduces a new way content enters a context — a new connector, a new fetch surface — use `threat-review` first. Registering the tool is the last step, not the first.
