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

## Common Permission Categories

### Team
- `team.view`
- `team.manage`
- `member.invite`
- `member.remove`

### Agent
- `agent.use`
- `agent.create`
- `agent.edit`
- `agent.delete`

### Model
- `model.view`
- `model.use`
- `model.manage`

### Source
- `source.read`
- `source.write`
- `source.connect`
- `source.disconnect`

### Message and File
- `message.read`
- `message.send`
- `file.upload`
- `file.download`
- `file.delete`

### Knowledge and Workflow
- `knowledge.read`
- `knowledge.write`
- `workflow.view`
- `workflow.create`
- `workflow.edit`
- `workflow.delete`
- `workflow.run`

### Settings and Billing
- `settings.view`
- `settings.manage`
- `billing.view`
- `billing.manage`

## Agent Permissions
Agent actions may include:
- `image.generate`
- `video.generate`
- `web.search`
- `browser.read`
- `database.read`
- `database.write`
- `email.send`
- `telegram.send`
- `discord.send`
- `user.profile.read`

## Permission Catalogue

The complete set the backend seeds on first run. Two columns beyond the name do real work:

- **`risk_tier`** — `read_only`, `reply`, `write`, or `admin`. Drives the trust-gated capability matrix in [docs/17-threat-model.md](17-threat-model.md) C2: what a run may do depends on this tier *and* on the trust level of its context, not on the grant alone.
- **`applies_to`** — `user` marks a permission an agent may never hold, enforcing the human/agent separation `docs/12-security.md` requires.

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
| `billing.view` | read_only | user | Y | Y |  |  |  | View billing and usage |
| `billing.manage` | **admin** | user | Y |  |  |  |  | Change plan and payment details |
| `audit.view` | read_only | user | Y | Y | Y |  |  | Query the team audit log |
| `approval.decide` | **admin** | user | Y | Y | Y |  |  | Approve or reject a pending agent action |

47 permissions. The role mapping above is a **starting proposal, not a finished policy** — the manager and member rows deserve deliberate review before launch, since `member` currently holds `message.send` and `workflow.run`, both write-tier.

`tool.execute` is a gate, not a capability: the effective tier for a call is the higher of this permission's tier and the invoked tool's own `risk_tier`. Holding `tool.execute` does not by itself authorize a write-tier tool.

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
- Human and agent permissions should be separate.
- Sensitive scopes must be narrow.
- Permission changes should be auditable.
- Access should be revoked immediately when membership or connections change.

## Notes
An authorization system is only as strong as its policy evaluation point. Every sensitive action should verify access at the moment it happens, not only at creation time.
