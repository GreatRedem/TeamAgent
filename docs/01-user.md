# User

`User` is the canonical identity of a person in TeamAgent. A user can belong to multiple teams, connect multiple external accounts, use agents, and have permissions and preferences.

## Responsibilities
- Represent the internal identity of a person.
- Own external source connections.
- Belong to one or more teams.
- Hold roles and permissions.
- Store preferences and personal memory.

## Relationships
- One user → many teams.
- One user → many source connections.
- One user → many agent usages.
- One user → direct permissions and role assignments.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `name` | Display name |
| `email` | Optional verified email |
| `avatar` | Optional profile image |
| `locale` | Preferred locale |
| `timezone` | Preferred timezone |
| `status` | Active, suspended, or deleted |
| `preferences` | User settings |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Identity
External accounts remain connections owned by the internal user. This lets one person connect multiple accounts on the same platform without creating multiple TeamAgent users.

## Security
Credentials, tokens, and encryption keys must be isolated from ordinary profile data and protected with encryption and access controls.
