# Agent

`Agent` is the operational AI worker in TeamAgent. It combines a primary `Model` with instructions, tools, permissions, knowledge, memory, source access, and workflows.

## Responsibilities
- Execute a defined task.
- Use a selected model.
- Follow system instructions and rules.
- Use approved tools and knowledge.
- Respect source and permission boundaries.
- Participate in workflows and memory.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal identifier |
| `team_id` | Owning team |
| `name` | Agent name |
| `description` | Agent purpose |
| `model_id` | Primary model |
| `system_prompt` | Core instructions |
| `settings` | Behavior and generation settings |
| `status` | Active, disabled, archived |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Configuration
System prompt, rules, tools, source access, knowledge access, memory, triggers, and workflow participation.

## Example Permissions
`message.read`, `message.send`, `image.generate`, `video.generate`, `web.search`, `database.read`, `email.send`, `telegram.send`, `discord.send`.

Agents must not automatically access every connected source; source access is explicitly granted.
