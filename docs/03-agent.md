# Agent

`Agent` is the operational AI worker in NuraAI. It combines a model, instructions, tools, permissions, source access, knowledge access, and runtime behavior into a reusable autonomous unit.

## Purpose
An agent is not just a single prompt. It is a bounded execution unit that can:
- interpret instructions
- use approved tools
- request model inference
- read specific knowledge
- act on selected sources
- participate in workflows

## Responsibilities
- Execute a defined task or conversation flow.
- Use a selected model and configuration.
- Follow system instructions and operational constraints.
- Use only approved tools and sources.
- Enforce permission and scope checks.
- Participate in workflow steps and memory contexts.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `name` | Agent name |
| `description` | Purpose and behavior summary |
| `model_id` | Primary model reference |
| `system_prompt` | Base instructions and rules |
| `settings` | Runtime behavior, generation, and safety settings |
| `budgets` | Per-run hard limits: token spend, tool-call count, recursion and fan-out depth, wall-clock duration |
| `status` | Active, disabled, archived |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Configuration Areas
An agent may be configured with:
- system prompt and role instructions
- allowed tools
- allowed knowledge bases
- allowed source connections, and **per connection**:
  - `can_reply` — reply on the conversation a request arrived on
  - `can_initiate` — send anywhere else; requires a non-empty allowlist
  - `allowed_destinations` — the allowlist the model cannot expand
- trigger behavior and workflow participation
- `budgets` — the per-run limits above

Each of these is a row in a join table, not a field on the agent. `docs/14-database.md` has `agent_tools`, `agent_knowledge_bases`, `agent_sources`, and `agent_permissions`; `docs/15-api.md` §6 has the endpoints.

**Multi-turn memory is not yet designed.** There is no `conversations` / `messages` pair in the schema, so conversational state currently has nowhere to live except `agent_runs.input_payload`. Treat memory as an open question rather than a configuration option.

## Permissions

An agent's permissions are drawn from the same catalogue as a human's (`docs/07-permission.md`), with two hard constraints.

**An agent may never hold a permission whose `risk_tier` is `admin`, or whose `applies_to` is `user`.** No agent changes permissions, connects sources, invites members, or reads credentials. Those are human actions on a path that does not traverse the agent runtime at all. This is invariant **R3**, enforced by a database trigger, and it removes the privilege-escalation class by construction rather than mitigating it.

**Holding a permission is not the same as being able to exercise it.** Every permission carries a `risk_tier`, and what a run may actually do is a function of that tier *and* the trust level of its context:

| Tier | Example | On `untrusted` context |
|---|---|---|
| `read_only` | `knowledge.read`, `web.search`, `database.read` | allowed |
| `reply` | `message.reply` on the originating conversation | allowed |
| `write` | `message.send`, `email.send`, `database.write`, `image.generate` | **approval required** |
| `admin` | `settings.manage`, `source.connect` | **never held, never allowed** |

So an agent on a public Telegram bot can hold `message.send` and still be unable to use it unattended. That is the control working, not a misconfiguration — and it is why a team wanting unattended writes must narrow the action until it is safe by construction rather than widen the grant.

The check happens at execution time in the tool runtime. A check at configuration time is advisory.

## Important Principle
Agents must not automatically access every connected source. Access must be explicit, scoped, and enforceable.

## Provenance

`agent_runs.agent_snapshot` pins the resolved configuration that produced each run — model, prompt, settings, granted tools, destinations. Without it a run record cannot answer "what instructions caused this?"

A run's own narrative output is **evidence of nothing**. A successful injection can make an agent misreport what it did, so audit records are written by the runtime from the actual execution path, never from the model's account of it.

## Notes
A good agent design keeps the model generic and the runtime policy specific. The agent should be safe by configuration, not by trust alone.
