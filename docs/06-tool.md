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
1. Agent requests a tool call.
2. Policy checks verify the agent holds the required permission **and** that the effective `risk_tier` is permitted at the context's trust level. The decision point is here, in the tool runtime, immediately before execution — not at agent configuration time.
3. Input is validated against the schema.
4. Any destination is resolved from configuration, never from the model's output.
5. Credentials are injected inside the tool runtime, after the arguments are fixed.
6. The tool executes in a controlled runtime.
7. Results are normalized and returned, labelled `untrusted`.
8. Execution is logged for audit and debugging — written before execution and updated after, so a crash mid-call still leaves evidence.

## Security Requirements
High-risk tools such as external HTTP calls, database writes, code execution, and message sending require:
- explicit permission policy
- scope restrictions
- input validation
- execution logging
- human review for sensitive actions when needed

## Notes
Tools are governed by policy, not by convenience. A tool is only useful if its execution is safe, auditable, and properly scoped.
