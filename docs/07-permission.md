# Permission

`Permission` defines what a user, agent, role, or principal can do on a NuraAI resource.

## Access Model
Permissions should be expressed as:

`action + resource + scope`

Examples:
- `message.read`
- `message.send`
- `agent.create`
- `agent.edit`
- `agent.delete`
- `team.view`
- `team.manage`
- `workflow.run`
- `settings.manage`

## Two Columns That Do Real Work

The catalogue below is the single source of truth for the permission vocabulary. An earlier revision of this document also carried a second, informal list of the same names grouped by category; it drifted within one revision and has been removed rather than re-synchronized.

Beyond the name, two columns carry the design:

- **`risk_tier`** — `read_only`, `reply`, `write`, or `admin`. Drives the trust-gated capability matrix in [docs/17-threat-model.md](17-threat-model.md) C2: what a run may do depends on this tier *and* on the trust level of its context, not on the grant alone.
- **`applies_to`** — `user` marks a permission an agent may never hold, enforcing the human/agent separation `docs/12-security.md` requires. This is invariant **R3**, enforced by a database trigger rather than by convention.

## Permission Catalogue

The complete set the backend seeds on first run.

Role columns: **O**wner, **A**dmin, **M**anager, m**E**mber, **V**iewer.

| Permission | Tier | Applies to | O | A | M | E | V | Description |
|---|---|---|:-:|:-:|:-:|:-:|:-:|---|
| **Team** | | | | | | | | |
| `team.view` | read_only | both | Y | Y | Y | Y | Y | View team profile and membership |
| `team.manage` | **admin** | user | Y | Y |  |  |  | Change team settings, limits, and status |
| `member.invite` | **admin** | user | Y | Y |  |  |  | Invite a user into the team |
| `member.remove` | **admin** | user | Y | Y |  |  |  | Remove a member from the team |
| **Agent** | | | | | | | | |
| `agent.use` | read_only | both | Y | Y | Y | Y |  | Start a run on an existing agent |
| `agent.create` | **admin** | user | Y | Y | Y |  |  | Create an agent |
| `agent.edit` | **admin** | user | Y | Y | Y |  |  | Change agent prompt, model, settings, or grants |
| `agent.delete` | **admin** | user | Y | Y | Y |  |  | Archive or delete an agent |
| **Model** | | | | | | | | |
| `model.view` | read_only | both | Y | Y | Y | Y | Y | List models and read capability metadata |
| `model.use` | read_only | both | Y | Y | Y | Y |  | Invoke a model through the gateway |
| `model.manage` | **admin** | user | Y | Y |  |  |  | Register or disable model definitions |
| **Source** | | | | | | | | |
| `source.read` | read_only | both | Y | Y | Y | Y | Y | Read source metadata and inbound events |
| `source.write` | **write** | both | Y | Y | Y |  |  | Emit output through a source connection |
| `source.connect` | **admin** | user | Y | Y |  |  |  | Authorize a new source connection |
| `source.disconnect` | **admin** | user | Y | Y |  |  |  | Revoke a source connection |
| **Message and file** | | | | | | | | |
| `message.read` | read_only | both | Y | Y | Y | Y | Y | Read messages on a permitted connection |
| `message.reply` | reply | both | Y | Y | Y | Y |  | Reply on the conversation the request arrived on |
| `message.send` | **write** | both | Y | Y | Y | Y |  | Send to a destination other than the origin |
| `file.download` | read_only | both | Y | Y | Y | Y | Y | Read a stored file |
| `file.upload` | **write** | both | Y | Y | Y | Y |  | Store a new file |
| `file.delete` | **write** | both | Y | Y | Y |  |  | Delete a stored file |
| **Knowledge** | | | | | | | | |
| `knowledge.read` | read_only | both | Y | Y | Y | Y | Y | Retrieve from permitted knowledge bases |
| `knowledge.write` | **write** | both | Y | Y | Y |  |  | Create or modify knowledge items |
| **Workflow** | | | | | | | | |
| `workflow.view` | read_only | both | Y | Y | Y | Y | Y | View workflow definitions and run history |
| `workflow.run` | **write** | both | Y | Y | Y | Y |  | Trigger a workflow execution |
| `workflow.create` | **admin** | user | Y | Y | Y |  |  | Create a workflow |
| `workflow.edit` | **admin** | user | Y | Y | Y |  |  | Publish a new workflow version |
| `workflow.delete` | **admin** | user | Y | Y | Y |  |  | Archive or delete a workflow |
| **Tools** | | | | | | | | |
| `tool.execute` | read_only | both | Y | Y | Y | Y |  | Invoke a granted tool, subject to that tool risk_tier |
| `tool.manage` | **admin** | user | Y | Y |  |  |  | Register or disable tool definitions |
| `web.search` | read_only | both | Y | Y |  |  |  | Search the web |
| `browser.read` | read_only | both | Y | Y |  |  |  | Fetch and read a web page |
| `database.read` | read_only | both | Y | Y |  |  |  | Run a named read-only query |
| `database.write` | **write** | both | Y | Y |  |  |  | Run a named mutating query |
| `code.execute` | **write** | both | Y | Y |  |  |  | Execute code in a sandbox |
| `image.generate` | **write** | both | Y | Y |  |  |  | Generate an image |
| `video.generate` | **write** | both | Y | Y |  |  |  | Generate a video |
| `email.send` | **write** | both | Y | Y |  |  |  | Send an outbound email |
| `telegram.send` | **write** | both | Y | Y |  |  |  | Send a Telegram message |
| `discord.send` | **write** | both | Y | Y |  |  |  | Send a Discord message |
| `user.profile.read` | read_only | both | Y | Y | Y | Y | Y | Read a team member profile |
| **Settings, billing, audit** | | | | | | | | |
| `settings.view` | read_only | user | Y | Y | Y |  |  | View team settings |
| `settings.manage` | **admin** | user | Y | Y |  |  |  | Change team settings |
| `apikey.manage` | **admin** | user | Y | Y |  |  |  | Issue, list, and revoke team API keys |
| `billing.view` | read_only | user | Y | Y |  |  |  | View billing and usage |
| `billing.manage` | **admin** | user | Y |  |  |  |  | Change plan and payment details |
| `audit.view` | read_only | user | Y | Y | Y |  |  | Query the team audit log |
| `approval.decide` | **admin** | user | Y | Y | Y |  |  | Approve or reject a pending agent action |

48 permissions. The role mapping above is a **starting proposal, not a finished policy** — the manager and member rows deserve deliberate review before launch, since `member` currently holds `message.send` and `workflow.run`, both write-tier.

Two entries need reading carefully.

**`tool.execute` is a gate, not a capability.** The effective tier for a call is the higher of this permission tier and the invoked tool own `risk_tier`. Holding `tool.execute` does not by itself authorize a write-tier tool.

**`apikey.manage` is separated from `settings.manage` on purpose.** Issuing an API key is not an ordinary settings change: a key with `trust_ceiling: user_input` submits content that the runtime treats as coming from an authenticated member, which is the one lever that moves work out of the `untrusted` row of the capability matrix (`docs/17-threat-model.md` T16). That deserves its own grant and its own audit line rather than riding along with theme and locale.

### Known rough edge

`web.search`, `browser.read`, and `database.read` are all `read_only` yet granted only to Owner and Admin. A Member therefore cannot run an agent that searches the web, which is probably not intended for a product built around agents. Either these move down to Member, or the restriction needs a stated reason. Flagged rather than silently fixed, because it is a product decision.

## Scope
Permissions may be scoped to:
- a team
- an agent
- a source or connection
- a knowledge base
- a workflow
- a specific resource instance

## Principles
- Default deny.
- Least privilege.
- Human and agent permissions are separate, and an agent never holds an `admin`-tier or `applies_to: user` permission.
- **A grant is a ceiling, not an entitlement.** What a run may actually do is the grant *and* the trust level of its context. This is the principle that distinguishes this model from ordinary RBAC, and it is the reason a permission list alone cannot answer whether an action is allowed.
- Sensitive scopes must be narrow.
- Permission changes should be auditable.
- Access is revoked immediately when membership or connections change — which is why permissions are resolved per request and never carried in a token.

## Notes
An authorization system is only as strong as its policy evaluation point. Every sensitive action should verify access at the moment it happens, not only at creation time.
