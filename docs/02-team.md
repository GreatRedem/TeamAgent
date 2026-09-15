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

## Ownership

`owner_id` is `ON DELETE RESTRICT`. Deleting a user must never cascade into the destruction of their teams and every agent, workflow, and knowledge base inside them.

That protection has a consequence worth stating here rather than only in the auth doc:

> **A lost owner wallet is a locked team.** Sign-in is a wallet signature with no password and no reset path (`docs/20-authentication.md`), so an unrecoverable owner account takes its entire team with it — every agent, every connected source, every knowledge base.

Two things follow, and neither is optional:

- **Ownership transfer must be an explicit operation**, available before it is needed rather than as an incident response.
- **Owner and admin roles should require a hardware wallet or multisig.** Wallet sign-in makes MFA redundant for the signature itself; it does nothing for key custody. A hot wallet holding `team.manage` is one compromised browser extension away from full team control.

An account recovery policy — a second linked wallet, a social recovery scheme, or an explicit admin process — has to exist before the first real user signs up.

## Team Governance
A team should enforce:
- explicit membership policies
- role-based access control
- reviewable resource sharing
- approved automation boundaries
- usage limits and quota enforcement

`limits` holds quotas, rates, and caps, and they are **accounting rather than rate limiting**: enforced against real recorded usage in `agent_runs` and token consumption, not against an in-process counter. With more than one API instance an in-memory counter is per-instance and the effective limit becomes the configured value times the instance count (`docs/23-job-queue.md`).

## Notes
Teams are the main unit of trust and isolation in the system. A source, workflow, or agent should normally be scoped to a team unless a specific cross-team pattern is intentionally allowed.
