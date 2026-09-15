# Permission

`Permission` defines what a user, agent, role, or other principal can do on a TeamAgent resource.

## Access Model
A permission is expressed as **action + resource + scope**.

Examples: `message.read`, `message.send`, `agent.use`, `agent.create`, `agent.edit`, `agent.delete`, `team.view`, `team.manage`, `model.use`, `workflow.run`, `settings.manage`.

## Common Permissions
- Team: `team.view`, `team.manage`, `member.invite`, `member.remove`
- Agent: `agent.use`, `agent.create`, `agent.edit`, `agent.delete`
- Model: `model.view`, `model.use`, `model.manage`
- Source: `source.read`, `source.write`, `source.connect`, `source.disconnect`
- Message/File: `message.read`, `message.send`, `file.upload`, `file.download`, `file.delete`
- Knowledge/Workflow: `knowledge.read`, `knowledge.write`, `workflow.view`, `workflow.create`, `workflow.edit`, `workflow.delete`, `workflow.run`
- Settings: `settings.view`, `settings.manage`, `billing.view`, `billing.manage`

## Agent Permissions
Examples include `image.generate`, `video.generate`, `web.search`, `browser.read`, `database.read`, `database.write`, `email.send`, `telegram.send`, `discord.send`, and `user.profile.read`.

## Scope
Permissions may be scoped to a team, agent, source, connection, knowledge base, workflow, or specific resource.

## Principles
- Default deny.
- Least privilege.
- Separate human and agent permissions.
- Narrow sensitive scopes.
- Audit important changes.
- Revoke access immediately when membership or connections change.
