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
| `name` | Tool name |
| `description` | Purpose and use case |
| `type` | Tool category |
| `input_schema` | Accepted payload schema |
| `output_schema` | Result schema |
| `permissions` | Required permissions |
| `status` | Available or disabled |

## Execution Flow
1. Agent requests a tool call.
2. Policy checks verify the agent has the required permission.
3. Input is validated against the schema.
4. The tool executes in a controlled runtime.
5. Results are normalized and returned.
6. Execution is logged for audit and debugging.

## Security Requirements
High-risk tools such as external HTTP calls, database writes, code execution, and message sending require:
- explicit permission policy
- scope restrictions
- input validation
- execution logging
- human review for sensitive actions when needed

## Notes
Tools are governed by policy, not by convenience. A tool is only useful if its execution is safe, auditable, and properly scoped.
