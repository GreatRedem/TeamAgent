# Team

`Team` is the primary collaboration boundary in NuraAI. It groups users, agents, sources, permissions, knowledge, workflows, and operational policies into a single shared workspace.

## Purpose
A team defines the trust and collaboration boundary for a group of people and systems. It is the natural container for:
- people working together
- shared agents and automation
- shared knowledge bases
- source integrations and channel access
- workflow execution and operational limits

## Responsibilities
- Organize users into a shared workspace.
- Manage team-level roles and permissions.
- Provide shared access to agents, sources, and knowledge.
- Apply team settings, resource limits, and policies.
- Own workflow and automation execution scope.

## Relationships
- A team has many users.
- A team owns many agents.
- A team owns many sources and connections.
- A team has many knowledge bases and documents.
- A team runs many workflows.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `name` | Display name of the team |
| `slug` | Unique URL-friendly team identifier |
| `owner_id` | Team owner or creator |
| `status` | Active, suspended, archived |
| `settings` | Team-level configuration |
| `limits` | Quotas, rates, and resource caps |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Recommended Roles
- **Owner** — full administrative and billing authority.
- **Admin** — team administration, member management, and major settings.
- **Manager** — operational management within allowed boundaries.
- **Member** — normal agent and workflow usage.
- **Viewer** — read-only access to selected resources.

## Team Governance
A team should enforce:
- explicit membership policies
- role-based access control
- reviewable resource sharing
- approved automation boundaries
- usage limits and quota enforcement

## Notes
Teams are the main unit of trust and isolation in the system. A source, workflow, or agent should normally be scoped to a team unless a specific cross-team pattern is intentionally allowed.
