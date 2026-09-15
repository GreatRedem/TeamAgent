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

`models` is a **global registry**, not a team-scoped one: rows are unique on `(provider, name, version)` and carry no `team_id`. Team-level `model.view` and `model.use` govern who may see and invoke them, but who may *register* one is an unresolved scoping question — see `docs/15-api.md` section 7. Until it is settled, treat registration as platform-operator only.

`pricing` is estimation metadata and changes over time, so it is **not** what a historical run cost is computed from. `agent_runs.cost_estimate` is snapshotted at execution, because a run must keep the cost it actually incurred rather than the cost that today price list implies.

## The Provider Is a Threat Surface

Every inference call sends the assembled context — system prompt, retrieved knowledge, message history, tool results — outside the tenant boundary. **Inference is egress.** No control elsewhere in this design changes that, and it is worth stating plainly rather than leaving implicit in an integration doc.

In scope: provider compromise, provider-side logging and retention, training use of submitted data, and response tampering.

Required:

- **A per-team policy on which providers may receive which data classifications.** A team with confidential knowledge may not want it reaching every registered provider, and the model record is where that policy attaches.
- **Provider, model, and version recorded on every run**, so the blast radius of a provider incident is a query rather than an investigation.
- **Provider responses treated as `untrusted` input to the next stage.** A completion is model output derived from whatever was in the context; it carries no more trust than its inputs.

See `docs/17-threat-model.md` T15.

## Notes
The `Model` entity should represent capability and operational metadata, not only a vendor name. Model selection needs to account for context size, cost, speed, modality, and policy restrictions.
