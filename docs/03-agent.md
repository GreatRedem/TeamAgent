# Agent

`Agent` is the operational AI worker in TeamAgent. It combines a model, instructions, tools, permissions, source access, knowledge access, and runtime behavior into a reusable autonomous unit.

## Purpose
An agent is not just a single prompt. It is a bounded execution unit that can:
- interpret instructions
- use approved tools
- request model inference
- read specific knowledge
- act on selected sources
- participate in workflows

## Responsibilities
- Execute a defined task or conversation flow.
- Use a selected model and configuration.
- Follow system instructions and operational constraints.
- Use only approved tools and sources.
- Enforce permission and scope checks.
- Participate in workflow steps and memory contexts.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `name` | Agent name |
| `description` | Purpose and behavior summary |
| `model_id` | Primary model reference |
| `system_prompt` | Base instructions and rules |
| `settings` | Runtime behavior, generation, and safety settings |
| `status` | Active, disabled, archived |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Configuration Areas
An agent may be configured with:
- system prompt and role instructions
- allowed tools
- allowed knowledge bases
- allowed source connections
- memory settings
- trigger behavior and workflow participation
- generation limits and safety controls

## Example Permissions
`message.read`, `message.send`, `image.generate`, `video.generate`, `web.search`, `database.read`, `email.send`, `telegram.send`, `discord.send`.

## Important Principle
Agents must not automatically access every connected source. Access must be explicit, scoped, and enforceable.

## Notes
A good agent design keeps the model generic and the runtime policy specific. The agent should be safe by configuration, not by trust alone.
