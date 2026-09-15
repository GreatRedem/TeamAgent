# Source

`Source` represents an external channel, integration, or connection through which NuraAI receives or emits information.

## Purpose
Sources are the ingress and egress boundaries between NuraAI and the outside world. They allow the system to listen for events and send outputs to approved destinations.

## Examples
- Telegram
- WhatsApp
- Discord
- Instagram
- Web chat
- Email
- SMS
- API endpoints
- Voice channels
- Files and document systems
- Databases

## Responsibilities
- Receive external input events.
- Send messages or outputs to the correct interface.
- Store connection metadata and status.
- Normalize incoming event payloads.
- Route outputs to specific destinations.
- Enforce access and trust boundaries.

## Source vs Connection
A `Source` describes a platform or channel type; a `Connection` represents a concrete instance or endpoint.

Example:
- Source: `Telegram`
- Connections: `Bot A`, `Bot B`, `Team Support Bot`

## Suggested Fields

A source is team-scoped. Ownership is expressed on the connection, not on the source.

### Source
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `type` | Platform or channel type |
| `name` | Human-readable source name |
| `status` | Connected, disconnected, error |
| `config` | Non-secret configuration |
| `capabilities` | Supported actions and formats |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### Connection
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `source_id` | Parent source |
| `owner_scope` | `team` or `user` |
| `user_id` | Required when `owner_scope` is `user` |
| `credential_ref` | Vault key for the connection's credentials — never the secret itself |
| `webhook_secret_ref` | Vault key for inbound webhook signature verification (`docs/17-threat-model.md` T7) |
| `status` | Connection state |

An earlier revision of this document gave `Source` a polymorphic `owner_type` / `owner_id` pair. It carried no referential integrity and was ambiguous against `team_id`, and it has been removed — see `docs/14-database.md`.

## Data Types
- text
- image
- video
- audio
- file
- message
- event
- user action

## Permissions
Common permissions include:
- `source.read`
- `source.write`
- `source.connect`
- `source.disconnect`
- `message.read`
- `message.send`

## Notes
Sources are part of the system boundary. A source should never be treated as universally accessible. Access must be explicitly granted, validated, and monitored.
