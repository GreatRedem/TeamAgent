# Security, Governance, and Access Control

This document defines the trust model for NuraAI and describes how identity, authorization, tool access, and operational safety are enforced.

## Security Principles

- Default deny for all access.
- Least privilege for users, agents, tools, and workflows.
- Explicit grant of source and knowledge access.
- Separate identity for humans and agents.
- Audit all sensitive actions.
- Treat external integrations as untrusted until validated.

## Authentication and Authorization

### Authentication
Authentication verifies who the caller is.

Methods:
- **EVM wallet signature (EIP-4361 / SIWE)** for human sign-in, exchanged for a short-lived JWT plus a revocable refresh token
- API keys for machine-to-machine usage
- Service identities for internal automation

Authenticating a machine principal says who is calling, **not that what it carries is trustworthy.** An API key relaying customer email is an attacker-controlled ingress path wearing a team credential, so every key carries a `trust_ceiling` that defaults to `untrusted`. See `docs/17-threat-model.md` T16 — this is the one place where the classic model in this document is not merely insufficient but actively misleading, because the request passes every check it defines.

There is no password authentication. See `docs/20-authentication.md` for the full design, including nonce handling, EIP-1271 smart-contract wallets, token rotation, and the reasoning behind keeping permissions out of the token.

### Authorization
Authorization decides what an authenticated principal can do.

The access model is based on:
- principal
- action
- resource
- scope

Example:
`user:team-admin -> agent.create -> team:abc123`

## Permission Model

Permissions must be explicit and scoped. They should be checked:
- when a user attempts to access a team or resource
- when an agent requests a tool or source
- when a workflow tries to publish or read data
- when a connection or knowledge source is created

Recommended policy structure:
- role-based assignments
- direct grants
- resource-scoped overrides
- temporary or delegated access

## Human vs Agent Permissions

Humans and agents should not share equivalent privileges by default.

A human may have:
- `team.manage`
- `billing.manage`
- `member.invite`

An agent may have:
- `knowledge.read`
- `tool.execute`
- `source.read`
- `message.send`

This distinction prevents accidental overreach when an agent is given broad capabilities.

## Source and Tool Safety

Examples of sensitive tools:
- external HTTP requests
- database writes
- file creation/deletion
- code execution
- email sending
- messaging sending
- image or video generation

These should require:
- explicit permission assignment
- environment or team scoping
- allowlists for destinations
- approval flows for high-risk actions
- logging of inputs and outputs

## Secret Management

Secrets must never be stored in generic configuration or logs.

Required controls:
- encrypt at rest
- encrypted transit for all connections
- secret rotation support
- scoped credentials per source or tool
- no plaintext leakage in agent execution traces

## Knowledge Access Control

Knowledge access must be scoped by:
- team
- role
- user membership
- agent permissions
- source ownership

Confidential data must be excluded from retrieval unless the relevant principal has access.

## Tenant Isolation

For multi-tenant systems, NuraAI must isolate:
- user records
- source connections
- team-owned knowledge
- workflow state
- logs and execution history
- model usage quotas

No data from one team should be visible to another without an explicit trust boundary and policy decision.

## Audit and Compliance

Important events to log:
- user login and logout
- team membership changes
- agent creation and deletion
- source connection changes
- tool execution attempts
- knowledge access and retrieval
- workflow execution start and result
- sensitive output publication

Audit logs should preserve:
- actor identity
- resource affected
- action performed
- timestamp
- status outcome
- reason or policy result

## Approval Workflows

High-risk operations should use explicit approvals, such as:
- sending a message to a public channel
- creating a database write
- sending an outbound email
- making a payment or billing action
- publishing generated content automatically

Approval can be enforced by:
- policy checks
- human confirmation
- pre-defined safe rules
- required manual review for specific teams

## Incident Handling

If a tool or source is compromised:
- revoke credentials immediately
- suspend the affected source or role
- isolate impacted workflows
- inspect execution and audit logs
- rotate secrets and validate downstream actions

## Recommended Security Controls
- Hardware-wallet or multisig requirement for owner and admin roles. Wallet sign-in makes MFA redundant for the signature itself, but it does not make key custody safe: a hot wallet holding `team.manage` is a single compromised browser extension away from full team control.
- role-based access control for all resources
- reviewable permission changes
- secret vault integration
- execution logs with trace IDs
- automatic expiration for temporary access
- isolated execution environments for risky tools

## Governance Checklist

Before production launch, confirm:
- all admin actions are logged
- source permissions are scoped and reviewable
- tools fail closed
- knowledge retrieval respects access scopes
- workflows cannot cross team boundaries without policy approval
- credentials are managed outside the application database
