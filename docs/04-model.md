# Model

`Model` is the AI capability abstraction used by NuraAI. It represents a concrete model provider and capability profile such as chat, reasoning, coding, image generation, speech, embedding, or vision.

## Purpose
The model layer abstracts the actual model provider from the application logic. This lets NuraAI select or replace providers without rewriting agent behavior.

## Responsibilities
- Describe the provider and model version.
- Define supported capabilities and role types.
- Record supported input and output formats.
- Track context limits, quota metadata, and pricing information.
- Expose status so agents can choose only valid and enabled models.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `provider` | Model provider name |
| `name` | Model name |
| `version` | Model version or release label |
| `type` | Capability category |
| `capabilities` | Supported capabilities |
| `context_limit` | Maximum context window |
| `input_types` | Supported input formats |
| `output_types` | Supported output formats |
| `pricing` | Optional pricing metadata |
| `status` | Available, disabled, deprecated |

## Common Model Types
- Chat
- Reasoning
- Coding
- Image generation
- Image understanding
- Video generation
- Speech-to-text
- Text-to-speech
- Embedding
- Vision

## Model Governance
- Agents should reference NuraAI model records instead of provider-specific implementation details.
- Providers can be swapped or added without forcing agent redesign.
- Model availability and status should be checked before runtime execution.

## Notes
The `Model` entity should represent capability and operational metadata, not only a vendor name. Model selection needs to account for context size, cost, speed, modality, and policy restrictions.
