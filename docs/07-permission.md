# Permission

`Permission` defines what a user, agent, role, or principal can do on a TeamAgent resource.

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
