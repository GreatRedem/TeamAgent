# API Design

This document defines the initial REST API surface for TeamAgent. The goal is to support a secure, multi-tenant system with explicit role checks, workflow orchestration, and agent execution while keeping the interface clear and easy to implement.

## API Principles

- RESTful resource-oriented endpoints.
- JSON request and response payloads.
- Authenticated users and service identities.
- Team-scoped access control for most resources.
- Explicit permission checks at runtime.
- Structured errors and request IDs.
- Audit logs for all sensitive operations.

## Base URL

```text
https://api.teamagent.example.com/v1
```

## Authentication

Use bearer tokens.

```http
Authorization: Bearer <token>
```

Supported flows:
- user login via SSO or email/password
- service-to-service API keys for internal automation
- delegated access to sources and tools via scoped tokens

## Common Response Format

```json
{
  "success": true,
  "data": {},
  "error": null,
  "request_id": "req_123456"
}
```

Error format:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this resource.",
    "details": {}
  },
  "request_id": "req_123456"
}
```

## Resource Groups

- Auth
- Users
- Teams
- Agents
- Models
- Sources
- Tools
- Knowledge
- Workflows
- Audit

## 1) Auth API

### POST /auth/login
Login user.

Request:

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "uuid",
      "name": "Alex",
      "email": "user@example.com"
    }
  }
}
```

### POST /auth/logout
Invalidate the current session or token.

### GET /auth/me
Return the current user profile and active teams.

## 2) User API

### GET /users/:id
Fetch a user profile.

### PATCH /users/:id
Update profile fields such as name, locale, timezone, or preferences.

### GET /users/:id/teams
List the teams that a user belongs to.

### GET /users/:id/sources
List user-owned source connections.

## 3) Team API

### POST /teams
Create a new team.

Request:

```json
{
  "name": "Marketing Team",
  "slug": "marketing-team"
}
```

### GET /teams/:teamId
Fetch team details.

### PATCH /teams/:teamId
Update name, settings, limits, or status.

### GET /teams/:teamId/members
List team members.

### POST /teams/:teamId/members
Invite or add a member.

Request:

```json
{
  "user_id": "uuid",
  "role": "member"
}
```

### DELETE /teams/:teamId/members/:userId
Remove a member.

### GET /teams/:teamId/permissions
List effective permissions for the team.

## 4) Agent API

### POST /teams/:teamId/agents
Create an agent.

Request:

```json
{
  "name": "Support Agent",
  "description": "Handles support triage",
  "model_id": "uuid",
  "system_prompt": "You are a helpful support assistant.",
  "settings": {
    "temperature": 0.2,
    "max_tokens": 800
  }
}
```

### GET /teams/:teamId/agents
List all agents in the team.

### GET /teams/:teamId/agents/:agentId
Fetch an agent.

### PATCH /teams/:teamId/agents/:agentId
Update metadata or runtime settings.

### DELETE /teams/:teamId/agents/:agentId
Archive or delete an agent.

### POST /teams/:teamId/agents/:agentId/run
Execute an agent with a payload.

Request:

```json
{
  "messages": [
    { "role": "user", "content": "Summarize the latest customer issue." }
  ],
  "context": {
    "source_id": "uuid"
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "run_id": "uuid",
    "status": "running",
    "trace_id": "trace_123"
  }
}
```

### GET /teams/:teamId/agents/:agentId/runs/:runId
Fetch execution status and result.

## 5) Model API

### GET /models
List available models.

### GET /models/:modelId
Fetch model metadata and capabilities.

### POST /models
Create or register a model definition if needed by admin/users with appropriate permissions.

## 6) Source API

### POST /teams/:teamId/sources
Register a new source.

Request:

```json
{
  "type": "telegram",
  "name": "Customer Support Bot",
  "config": {
    "bot_name": "support-bot"
  }
}
```

### GET /teams/:teamId/sources
List all sources for a team.

### GET /teams/:teamId/sources/:sourceId
Fetch source metadata.

### PATCH /teams/:teamId/sources/:sourceId
Update config or status.

### POST /teams/:teamId/sources/:sourceId/connect
Connect or authorize a source instance.

### POST /teams/:teamId/sources/:sourceId/disconnect
Disconnect a source.

## 7) Tool API

### GET /teams/:teamId/tools
List available tools.

### POST /teams/:teamId/tools
Register a tool.

Request:

```json
{
  "name": "web_search",
  "description": "Search the web for information",
  "type": "search",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "results": { "type": "array" }
    }
  },
  "permissions": ["web.search"]
}
```

### POST /teams/:teamId/tools/:toolId/execute
Execute a safe tool call.

Request:

```json
{
  "arguments": {
    "query": "latest AI regulation updates"
  }
}
```

## 8) Knowledge API

### POST /teams/:teamId/knowledge
Create a knowledge base.

Request:

```json
{
  "name": "Product Manual",
  "type": "document",
  "description": "Internal product knowledge"
}
```

### GET /teams/:teamId/knowledge
List knowledge bases.

### GET /teams/:teamId/knowledge/:knowledgeId
Fetch knowledge base metadata.

### POST /teams/:teamId/knowledge/:knowledgeId/items
Create a knowledge item.

Request:

```json
{
  "title": "Shipping Policy",
  "content": "Orders are processed within 48 hours...",
  "metadata": {
    "tags": ["shipping", "policy"]
  }
}
```

### POST /teams/:teamId/knowledge/search
Search knowledge base content.

Request:

```json
{
  "query": "return policy",
  "knowledge_base_ids": ["uuid-1", "uuid-2"]
}
```

## 9) Workflow API

### POST /teams/:teamId/workflows
Create a workflow.

Request:

```json
{
  "name": "Customer Triage Flow",
  "trigger_type": "webhook",
  "trigger_config": {
    "endpoint": "/webhooks/customer-triage"
  },
  "settings": {
    "retry_count": 3,
    "timeout_seconds": 120
  }
}
```

### GET /teams/:teamId/workflows
List workflows.

### GET /teams/:teamId/workflows/:workflowId
Fetch workflow details.

### PATCH /teams/:teamId/workflows/:workflowId
Update workflow configuration.

### POST /teams/:teamId/workflows/:workflowId/run
Trigger workflow execution.

### GET /teams/:teamId/workflows/:workflowId/runs
List workflow execution history.

### GET /teams/:teamId/workflows/:workflowId/runs/:runId
Fetch a single run and step status.

## 10) Audit API

### GET /teams/:teamId/audit
List recent audit events.

Query parameters:
- `actor_id`
- `resource_type`
- `resource_id`
- `action`
- `from`
- `to`

### GET /teams/:teamId/audit/:auditId
Fetch a specific audit item.

## Authorization Rules

Most endpoints should enforce:
- user must be authenticated
- user must be member of target team
- requested action must be allowed by role or explicit grant
- source, tool, workflow, or knowledge access must be scoped to the team or resource

## Recommended Route Patterns

Use this consistent pattern:

- `GET /teams/:teamId/...`
- `POST /teams/:teamId/...`
- `PATCH /teams/:teamId/.../:id`
- `DELETE /teams/:teamId/.../:id`
- `GET /teams/:teamId/.../:id/runs`

This keeps the API consistent with the multi-tenant model.

## MVP Scope

For the first release, prioritize:
1. auth
2. users and teams
3. agents
4. models
5. sources
6. tools
7. workflows
8. audit logs

Knowledge and advanced automation can follow once the core execution model is stable.

## Future API Evolution

When scaling up, add:
- event streaming APIs
- bulk operations
- permissions CLI or admin tooling
- rate limiting metadata
- tenant-level quotas API
- webhook subscriptions for workflow events
