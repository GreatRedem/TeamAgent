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
A channel type registered in a team. It is a definition, not a live link, so its status is about whether the team may use the channel at all.

| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `type` | Platform or channel type |
| `name` | Human-readable source name |
| `status` | `active`, `disabled` |
| `config` | Non-secret configuration |
| `capabilities` | Supported actions and formats |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### Connection
A concrete endpoint on a source. This is the thing that connects, holds credentials, and can fail.

| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `source_id` | Parent source |
| `name` | Human-readable connection name, such as `Team Support Bot` |
| `owner_scope` | `team` or `user` |
| `user_id` | Required when `owner_scope` is `user` |
| `config` | Non-secret endpoint configuration |
| `credential_ref` | Vault key for the connection credentials — never the secret itself |
| `webhook_secret_ref` | Vault key for inbound webhook signature verification (`docs/17-threat-model.md` T7) |
| `status` | `connected`, `connecting`, `disconnected`, `error`, `suspended` |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

The two `status` columns use deliberately different vocabularies. An earlier revision gave the Source the connection values, which left `disconnected` ambiguous between *this team stopped using Telegram* and *this bot token expired*.

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

## Everything Arriving Here Is Untrusted

**Inbound source content is labelled `untrusted`, unconditionally and with no per-source override.** Not *unless the sender is known*, not *unless the connection is authenticated*, not *unless it is a verified customer* — always.

This is the primary attack path for the platform (`docs/17-threat-model.md` T2), because inbound messages are the main entry point of the product and their content is written by whoever chose to send it. A hostile message asking an agent to search its knowledge base for credentials and forward them will pass every authorization check, because the permissions being exercised were legitimately granted — just not for this requester.

Three consequences for anyone building a connector:

- **The label is assigned by the ingress path**, not by inspecting the content and not by the model. There is no heuristic here to get wrong.
- **Normalizing a payload does not sanitize it.** Parsing a Telegram update into a canonical shape is a data-format operation. It makes no statement about whether the text inside is safe to act on.
- **Webhook ingress verifies signatures and rejects replays** before the payload reaches a context at all (T7). This needs the raw body, so nginx must not rewrite or re-buffer it (`docs/19-tech-stack.md`).

## Egress

Sending is not the mirror image of receiving. Access to a connection is a row in `agent_sources` carrying three fields:

- `can_reply` — reply on the conversation the request arrived on. The cheap default, and the `reply` tier. An attacker who injects a support bot and receives the reply on their own chat has gained nothing they did not already have.
- `can_initiate` — send anywhere else. A distinct `write`-tier capability, and it requires a non-empty allowlist (invariant R4).
- `allowed_destinations` — the allowlist the model cannot expand. The model selects among these by identifier; it never emits a raw chat ID, address, or URL that the runtime then uses. A proposal outside the list is denied and recorded, never fuzzy-matched.

## Permissions
Common permissions include:
- `source.read` — read source metadata and inbound events
- `source.write` — emit output through a connection
- `source.connect` / `source.disconnect` — **`admin`-tier, human only.** No agent connects or revokes a source
- `message.read`
- `message.reply` — reply on the originating conversation (`reply` tier)
- `message.send` — send to any other destination (`write` tier)

`message.reply` and `message.send` are separate permissions rather than one, because the difference between them is the difference between a contained agent and an exfiltration channel.

## Notes
Sources are part of the system boundary. A source should never be treated as universally accessible. Access must be explicitly granted, validated, and monitored.
