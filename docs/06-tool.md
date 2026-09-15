# Tool

`Tool` is an executable capability available to agents and workflows. Tools extend the agent beyond pure model generation by allowing safe, structured actions against external systems.

## Purpose
Tools turn the model from a passive responder into an action-capable runtime. They are useful when the system must:
- search the web
- read from a database
- generate media
- call an API
- analyze files
- send messages or emails

## Examples
- web search
- browser interaction
- database read/write
- code execution
- image generation
- video generation
- file processing
- HTTP/API calls
- email sending
- messaging integration

## Responsibilities
- Expose a clear action and schema.
- Validate input before execution.
- Enforce authorization and scope.
- Execute safely within bounded runtime conditions.
- Return structured results.
- Report failures and status clearly.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team; `NULL` marks a system tool available to every team |
| `name` | Tool name |
| `description` | Purpose and use case |
| `type` | Tool category |
| `input_schema` | Accepted payload schema |
| `output_schema` | Result schema |
| `permissions` | Required permissions |
| `risk_tier` | `read_only`, `reply`, `write`, or `admin`. Required — see below |
| `status` | Available or disabled |

## Risk Tier

`risk_tier` is not metadata. It is one of the two inputs to the runtime policy decision described in `docs/17-threat-model.md` C2: what a run may do depends on this tier **and** on the trust level of the context that produced the call.

- `read_only` — no effect outside the run
- `reply` — egress confined to the originating conversation
- `write` — mutation, spend, or egress to any destination other than the origin
- `admin` — configuration, permissions, credentials, billing. No agent may ever invoke a tool at this tier

The column is `NOT NULL` **with no default**. A tool that silently defaults to `read_only` is exactly the failure the tiering exists to prevent, so registering a tool without a tier must fail rather than guess.

Holding `tool.execute` does not by itself authorize a tool. The effective tier for a call is the higher of the `tool.execute` grant's tier and the invoked tool's own `risk_tier`.

## Execution Flow
1. **The model** requests a tool call. The runtime does not choose one on its behalf, and no tool runs before the first inference.
2. Policy checks verify the agent holds the required permission **and** that the effective `risk_tier` is permitted at the context's trust level. The decision point is here, in the tool runtime, immediately before execution — not at agent configuration time.
3. Input is validated against the schema.
4. Any destination is resolved from configuration, never from the model's output.
5. Credentials are injected inside the tool runtime, after the arguments are fixed.
6. The tool executes in a controlled runtime.
7. Results are normalized and returned, labelled `untrusted`.
8. Execution is logged for audit and debugging — written before execution and updated after, so a crash mid-call still leaves evidence.

## Security Requirements

High-risk tools — external HTTP calls, database writes, code execution, message sending — require all of the following. None of them is situational.

### Constrained arguments (C7)

Tool inputs are validated against `input_schema` with **the narrowest types that will do the job**: enums rather than free strings, bounded integers, allowlisted identifiers.

The model is the one filling these in, and on untrusted context the model is filling them in on an attacker behalf. So:

- database tools expose **named, parameterized queries**, never a SQL string from model output
- file tools take **resource identifiers**, never paths
- HTTP tools take an **allowlisted destination identifier**, never a URL
- nothing shells out with model-supplied text

A permissive schema is where tool argument injection lives (T10): SQL in a query field, an internal address in a URL field, `../` in a path field.

### Egress controls for HTTP and browser tools (C8)

- resolve-then-connect, with rebinding protection
- deny RFC1918, loopback, link-local, and cloud metadata addresses
- per-team destination allowlist
- no credential or cookie forwarding to non-allowlisted hosts
- capped redirects and response size

Cloud metadata endpoints are the specific thing to keep in mind: an SSRF that reaches one turns a web-fetch tool into a credential disclosure.

### Approval, triggered by provenance (C5)

Sensitive actions require human review **when the context that produced them is untrusted** — not when a developer judges the action sensitive. A `write`-tier call on `untrusted` context needs an approval; the same call on `trusted` context does not.

The reviewer must see the proposed action, the resolved destination, and the content that triggered it with its origin. Pending approvals expire, and an expired approval is a denial.

### Bounded execution

Every call runs under a timeout and against the remaining per-run budget — token spend, tool-call count, depth, wall clock. A tool loop is both a cost incident and a denial-of-service vector, and the budget is the only thing between an injected agent and an unbounded bill (C10).

### Logged before, not after

The `tool_calls` row is written **before** execution with its policy decision and reason, then updated with the outcome. Denied and pending attempts are recorded, not only successful ones. A crash mid-call still leaves evidence.

## Notes
Tools are governed by policy, not by convenience. A tool is only useful if its execution is safe, auditable, and properly scoped.
