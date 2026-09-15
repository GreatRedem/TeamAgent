# Source

`Source` represents an external channel, integration, or input/output connection through which TeamAgent receives or sends information.

## Examples
Telegram, WhatsApp, Discord, Instagram, Web Chat, Email, SMS, API, Voice, Files, Database.

## Responsibilities
- Receive external events.
- Send outputs.
- Maintain connection metadata.
- Normalize external events.
- Route outputs to the correct destination.

## Source vs Connection
A source describes a platform or channel type; a connection represents a specific account or endpoint. Example: Source=`Telegram`, Connections=`Bot A`, `Bot B`.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal identifier |
| `type` | Platform type |
| `name` | Human-readable name |
| `owner_type` | User or Team |
| `owner_id` | Owner |
| `status` | Connected, disconnected, error |
| `config` | Non-secret configuration |
| `capabilities` | Supported actions |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Data Types
Text, Image, Video, Audio, File, Message, Event, User Action.

## Permissions
Typical actions are `source.read`, `source.write`, `source.connect`, `source.disconnect`, `message.read`, and `message.send`.
