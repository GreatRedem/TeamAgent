# Model

`Model` represents an AI capability used by an agent. It can represent chat, reasoning, coding, image, video, speech, embedding, or vision models.

## Responsibilities
- Define provider and model version.
- Describe capabilities.
- Define supported input and output types.
- Track limits and optional pricing metadata.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal identifier |
| `provider` | Model provider |
| `name` | Model name |
| `version` | Optional version |
| `type` | Capability type |
| `capabilities` | Supported capabilities |
| `context_limit` | Maximum context size |
| `input_types` | Supported inputs |
| `output_types` | Supported outputs |
| `pricing` | Optional cost metadata |
| `status` | Available, disabled, deprecated |

## Common Types
Chat, Reasoning, Coding, Image Generation, Image Understanding, Video Generation, STT, TTS, Embedding, Vision.

Agents should reference TeamAgent model records instead of hard-coding provider implementations, allowing providers to be added or replaced.
