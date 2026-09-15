# Source

`Source` represents an external channel, integration, or connection through which TeamAgent receives or emits information.

## Purpose
Sources are the ingress and egress boundaries between TeamAgent and the outside world. They allow the system to listen for events and send outputs to approved destinations.

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
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `type` | Platform or channel type |
| `name` | Human-readable source name |
| `owner_type` | User or Team |
| `owner_id` | Owning principal |
| `status` | Connected, disconnected, error |
| `config` | Non-secret configuration |
| `capabilities` | Supported actions and formats |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

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
