# Tool

`Tool` is an executable capability available to agents and workflows. Tools extend an agent beyond model-only generation.

## Examples
Web Search, Browser, Database, Code Execution, Image Generation, Video Generation, File Processing, HTTP/API Requests, Email, Messaging.

## Responsibilities
- Expose a clear action and schema.
- Validate input.
- Enforce authorization.
- Execute safely.
- Return structured results.
- Report errors and status.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal identifier |
| `name` | Tool name |
| `description` | Purpose |
| `type` | Tool category |
| `input_schema` | Expected inputs |
| `output_schema` | Result structure |
| `permissions` | Required permissions |
| `status` | Available or disabled |

## Execution
1. Agent requests a tool call.
2. Permission is checked.
3. Input is validated.
4. Tool executes.
5. Result is normalized and returned.
6. Execution is logged for audit and usage.

High-risk tools such as external HTTP, database write, code execution, and message sending require explicit permission boundaries.
