# Workflow

`Workflow` defines an automated sequence connecting triggers, sources, agents, models, tools, and outputs.

## Basic Pattern
`Trigger → Source → Agent → Model → Tool → Output → Source`

Not every workflow needs every step. A simple workflow can be `Message Received → Agent → Response`.

## Responsibilities
- Define automation logic.
- Start from triggers or schedules.
- Pass structured data between steps.
- Run agents and tools.
- Apply conditions and branching.
- Produce outputs.
- Record status and errors.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal identifier |
| `team_id` | Owning team |
| `name` | Workflow name |
| `description` | Workflow purpose |
| `trigger` | Event or schedule |
| `steps` | Ordered execution steps |
| `status` | Active, paused, archived |
| `settings` | Retry, timeout, execution options |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Common Triggers
`message.received`, `user.created`, `user.updated`, `file.uploaded`, `agent.started`, schedules, webhooks, and manual execution.

## Common Steps
Call an agent/model, execute a tool, search knowledge, send a message, transform data, evaluate a condition, wait/schedule, or call an external API.

## Reliability
Support timeouts, retries, idempotency where appropriate, error handling, step-level logs, execution history, and rate limits.

## Example
A social-media workflow can receive a request, invoke a Content Agent, retrieve brand knowledge, generate an image, perform checks, and publish through an approved source.
