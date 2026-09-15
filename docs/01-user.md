# User

`User` is the canonical identity of a human person in TeamAgent. It represents the internal account that owns team memberships, external source connections, permissions, preferences, and activity history.

## Purpose
A user is not just a profile record. It is the primary identity boundary for:
- team membership and role assignment
- source account connections
- personalization and settings
- access control decisions
- audit and ownership history

## Responsibilities
- Represent the real identity of a person in the system.
- Own external source connections and credentials scope.
- Belong to one or more teams.
- Receive roles and permissions.
- Store preferences, profile information, and personal context.
- Participate in workflows and agent interactions.

## Relationships
- One user has many team memberships.
- One user may connect multiple external accounts.
- One user may use many agents.
- One user can own many permissions or role assignments.
- One user may have personal memory or custom preferences.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `name` | Display name |
| `email` | Verified email address if available |
| `avatar_url` | Optional profile image |
| `locale` | Preferred locale |
| `timezone` | Preferred timezone |
| `status` | Active, suspended, or deleted |
| `preferences` | Personal settings and defaults |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Identity Model
A user is anchored to an **EVM wallet address**, proven by signature at sign-in (`docs/20-authentication.md`). There is no password.

Additional provider identities — Telegram, Discord, and others — may be linked to the same internal user. They attach to the existing canonical record rather than creating a second user.

This model preserves:
- one person = one canonical identity
- multiple provider identities = multiple linked accounts
- centralized access review and permission evaluation

Two consequences of the wallet anchor are worth stating in the identity model itself, because they contradict assumptions a conventional account model would license:

- **`email` is optional and usually absent.** Nothing may assume a user is reachable by email — including approval notifications (`docs/17-threat-model.md` C5).
- **There is no reset path.** A lost wallet is a lost account, and for a team owner it is a locked team. Account recovery is a policy decision that must exist before launch.

## Security Requirements
- Profile data and secret data must be stored separately.
- Tokens, API keys, and credentials must be encrypted.
- Sensitive fields must not be exposed in normal user responses.
- User-level access must be reviewed when teams or source connections change.
- A wallet address is a permanent, public, cross-site identifier already linked to a readable transaction history. Treat `provider_user_id` as personal data, not as an opaque key.

## Notes
The `User` model should be treated as the trust anchor for the system. All other core entities—team, agent, source, workflow, and knowledge—should ultimately resolve access through that identity or through a delegated principal.
