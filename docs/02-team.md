# Team

`Team` is the main workspace and collaboration boundary in TeamAgent. It groups users, agents, sources, permissions, knowledge, workflows, settings, and usage limits.

## Responsibilities
- Group users and agents.
- Define access through roles and permissions.
- Share sources and knowledge.
- Run workflows.
- Apply settings, quotas, and billing policies.

## Relationships
- Many users.
- Many agents.
- Many sources.
- Shared knowledge bases.
- Many workflows.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal identifier |
| `name` | Team name |
| `slug` | Unique human-readable identifier |
| `owner_id` | Team owner |
| `status` | Active, suspended, archived |
| `settings` | Team configuration |
| `limits` | Usage limits |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Recommended Roles
- **Owner** — full control, including billing and deletion.
- **Admin** — team and resource administration.
- **Manager** — operational management.
- **Member** — normal usage.
- **Viewer** — read-only access.
