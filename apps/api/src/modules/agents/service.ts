import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  agentKnowledgeBases,
  agentPermissions,
  agentSources,
  agentTools,
  agents,
  knowledgeBases,
  models,
  permissions,
  sourceConnections,
  tools,
} from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";

export interface AgentMeta {
  actorId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const AGENT_STATUSES = ["active", "disabled", "archived"] as const;

function isForeignKeyViolation(error: unknown): boolean {
  // 23503 fires on insert/update against a missing parent; 23001 fires on a
  // delete blocked by RESTRICT (e.g. an agent with runs). Both are conflicts.
  const code = (error as { cause?: { code?: unknown } }).cause?.code;
  return code === "23503" || code === "23001";
}

function errorChainText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && parts.length < 5) {
    parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join("\n");
}

function isR3Violation(error: unknown): boolean {
  return /R3/i.test(errorChainText(error));
}

function isR4Violation(error: unknown): boolean {
  return /r4_initiate_requires_destinations/i.test(errorChainText(error));
}

function actorType(actorId: string | null): string {
  return actorId === null ? "api_key" : "user";
}

async function requireAgent(
  database: AnyDb,
  teamId: string,
  agentId: string,
): Promise<typeof agents.$inferSelect> {
  const rows = await database
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.teamId, teamId)));
  const row = rows[0];
  if (row === undefined) throw notFound("Agent");
  return row;
}

async function requireModel(database: AnyDb, modelId: string): Promise<void> {
  const rows = await database.select().from(models).where(eq(models.id, modelId));
  if (rows.length === 0) throw badRequest("UNKNOWN_MODEL", "The model does not exist.");
}

function toAgentJson(row: typeof agents.$inferSelect): unknown {
  return {
    id: row.id,
    name: row.name,
    model_id: row.modelId,
    system_prompt: row.systemPrompt,
    settings: row.settings,
    budgets: row.budgets,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function createAgent(
  database: AnyDb,
  input: {
    teamId: string;
    name: string;
    modelId?: string | null;
    systemPrompt?: string | null;
    settings?: Record<string, unknown> | null;
    budgets?: Record<string, unknown> | null;
  } & AgentMeta,
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (name.length === 0) throw badRequest("INVALID_INPUT", "Agent name must not be empty.");
  if (input.modelId !== undefined && input.modelId !== null) {
    await requireModel(database, input.modelId);
  }
  const id = randomUUID();
  await database.insert(agents).values({
    id,
    teamId: input.teamId,
    name,
    modelId: input.modelId ?? null,
    systemPrompt: input.systemPrompt ?? null,
    settings: input.settings ?? null,
    budgets: input.budgets ?? null,
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "agent.create",
    resourceType: "agent",
    resourceId: id,
    outcome: "allowed",
    metadata: { name },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id };
}

export async function listAgents(database: AnyDb, teamId: string): Promise<unknown[]> {
  const rows = await database.select().from(agents).where(eq(agents.teamId, teamId));
  return rows.map(toAgentJson);
}

export async function getAgent(database: AnyDb, teamId: string, agentId: string): Promise<unknown> {
  return toAgentJson(await requireAgent(database, teamId, agentId));
}

export async function updateAgent(
  database: AnyDb,
  input: {
    teamId: string;
    agentId: string;
    name?: string;
    modelId?: string | null;
    systemPrompt?: string | null;
    settings?: Record<string, unknown> | null;
    budgets?: Record<string, unknown> | null;
    status?: string;
  } & AgentMeta,
): Promise<void> {
  await requireAgent(database, input.teamId, input.agentId);
  const patch: Partial<typeof agents.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0) throw badRequest("INVALID_INPUT", "Agent name must not be empty.");
    patch.name = name;
  }
  if (input.modelId !== undefined) {
    if (input.modelId !== null) await requireModel(database, input.modelId);
    patch.modelId = input.modelId;
  }
  if (input.systemPrompt !== undefined) patch.systemPrompt = input.systemPrompt;
  if (input.settings !== undefined) patch.settings = input.settings;
  if (input.budgets !== undefined) patch.budgets = input.budgets;
  if (input.status !== undefined) {
    if (!(AGENT_STATUSES as readonly string[]).includes(input.status)) {
      throw badRequest("INVALID_INPUT", "Status must be active, disabled, or archived.");
    }
    patch.status = input.status;
  }
  if (Object.keys(patch).length > 0) {
    await database.update(agents).set(patch).where(eq(agents.id, input.agentId));
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "agent.update",
    resourceType: "agent",
    resourceId: input.agentId,
    outcome: "allowed",
    metadata: patch.name !== undefined ? { name: patch.name } : null,
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

/**
 * Hard delete. Grants cascade; runs restrict — deleting an agent with runs
 * is a conflict, not a silent history rewrite.
 */
export async function deleteAgent(
  database: AnyDb,
  input: { teamId: string; agentId: string } & AgentMeta,
): Promise<void> {
  await requireAgent(database, input.teamId, input.agentId);
  try {
    await database.delete(agents).where(eq(agents.id, input.agentId));
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict("AGENT_IN_USE", "The agent has runs and cannot be removed. Archive it.");
    }
    throw error;
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "agent.delete",
    resourceType: "agent",
    resourceId: input.agentId,
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function getGrants(
  database: AnyDb,
  teamId: string,
  agentId: string,
): Promise<unknown> {
  await requireAgent(database, teamId, agentId);
  const [permissionRows, toolRows, knowledgeRows, sourceRows] = await Promise.all([
    database
      .select({ permissionId: agentPermissions.permissionId })
      .from(agentPermissions)
      .where(and(eq(agentPermissions.agentId, agentId), eq(agentPermissions.teamId, teamId))),
    database
      .select({ toolId: agentTools.toolId })
      .from(agentTools)
      .where(and(eq(agentTools.agentId, agentId), eq(agentTools.teamId, teamId))),
    database
      .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
      .from(agentKnowledgeBases)
      .where(and(eq(agentKnowledgeBases.agentId, agentId), eq(agentKnowledgeBases.teamId, teamId))),
    database
      .select()
      .from(agentSources)
      .where(and(eq(agentSources.agentId, agentId), eq(agentSources.teamId, teamId))),
  ]);
  return {
    agent_id: agentId,
    permission_ids: permissionRows.map((r) => r.permissionId),
    tool_ids: toolRows.map((r) => r.toolId),
    knowledge_base_ids: knowledgeRows.map((r) => r.knowledgeBaseId),
    sources: sourceRows.map((r) => ({
      source_connection_id: r.sourceConnectionId,
      can_reply: r.canReply,
      can_initiate: r.canInitiate,
      allowed_destinations: r.allowedDestinations,
    })),
  };
}

/**
 * Replace the agent's permission set. The API check returns a usable 403;
 * the R3 trigger underneath is the boundary, so a race still fails closed.
 */
export async function replaceAgentPermissions(
  database: AnyDb,
  input: { teamId: string; agentId: string; permissionIds: string[] } & AgentMeta,
): Promise<void> {
  await requireAgent(database, input.teamId, input.agentId);
  const uniqueIds = [...new Set(input.permissionIds)];
  if (uniqueIds.length > 0) {
    const rows = await database.select().from(permissions);
    const byId = new Map(rows.map((p) => [p.id, p]));
    for (const id of uniqueIds) {
      const permission = byId.get(id);
      if (permission === undefined) {
        throw badRequest("UNKNOWN_PERMISSION", "One of the permissions does not exist.");
      }
      if (permission.riskTier === "admin" || permission.appliesTo === "user") {
        throw forbidden("Agents may not hold admin-tier or user-only permissions (R3).");
      }
    }
  }
  try {
    await database
      .delete(agentPermissions)
      .where(
        and(eq(agentPermissions.agentId, input.agentId), eq(agentPermissions.teamId, input.teamId)),
      );
    if (uniqueIds.length > 0) {
      await database.insert(agentPermissions).values(
        uniqueIds.map((permissionId) => ({
          id: randomUUID(),
          teamId: input.teamId,
          agentId: input.agentId,
          permissionId,
        })),
      );
    }
  } catch (error) {
    if (isR3Violation(error)) {
      throw forbidden("Agents may not hold admin-tier or user-only permissions (R3).");
    }
    throw error;
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "agent.grants.permissions",
    resourceType: "agent",
    resourceId: input.agentId,
    outcome: "allowed",
    metadata: { permission_ids: uniqueIds },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function replaceAgentTools(
  database: AnyDb,
  input: { teamId: string; agentId: string; toolIds: string[] } & AgentMeta,
): Promise<void> {
  await requireAgent(database, input.teamId, input.agentId);
  const uniqueIds = [...new Set(input.toolIds)];
  if (uniqueIds.length > 0) {
    const rows = await database.select().from(tools);
    const visible = new Set(
      rows.filter((t) => t.teamId === null || t.teamId === input.teamId).map((t) => t.id),
    );
    for (const id of uniqueIds) {
      if (!visible.has(id)) {
        throw badRequest("UNKNOWN_TOOL", "One of the tools does not exist in this team.");
      }
    }
  }
  await database
    .delete(agentTools)
    .where(and(eq(agentTools.agentId, input.agentId), eq(agentTools.teamId, input.teamId)));
  if (uniqueIds.length > 0) {
    await database.insert(agentTools).values(
      uniqueIds.map((toolId) => ({
        id: randomUUID(),
        teamId: input.teamId,
        agentId: input.agentId,
        toolId,
      })),
    );
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "agent.grants.tools",
    resourceType: "agent",
    resourceId: input.agentId,
    outcome: "allowed",
    metadata: { tool_ids: uniqueIds },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function replaceAgentKnowledge(
  database: AnyDb,
  input: { teamId: string; agentId: string; knowledgeBaseIds: string[] } & AgentMeta,
): Promise<void> {
  await requireAgent(database, input.teamId, input.agentId);
  const uniqueIds = [...new Set(input.knowledgeBaseIds)];
  if (uniqueIds.length > 0) {
    const rows = await database
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.teamId, input.teamId));
    const visible = new Set(rows.map((r) => r.id));
    for (const id of uniqueIds) {
      if (!visible.has(id)) {
        throw badRequest(
          "UNKNOWN_KNOWLEDGE_BASE",
          "One of the knowledge bases does not exist in this team.",
        );
      }
    }
  }
  await database
    .delete(agentKnowledgeBases)
    .where(
      and(
        eq(agentKnowledgeBases.agentId, input.agentId),
        eq(agentKnowledgeBases.teamId, input.teamId),
      ),
    );
  if (uniqueIds.length > 0) {
    await database.insert(agentKnowledgeBases).values(
      uniqueIds.map((knowledgeBaseId) => ({
        id: randomUUID(),
        teamId: input.teamId,
        agentId: input.agentId,
        knowledgeBaseId,
      })),
    );
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "agent.grants.knowledge",
    resourceType: "agent",
    resourceId: input.agentId,
    outcome: "allowed",
    metadata: { knowledge_base_ids: uniqueIds },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export interface AgentSourceGrant {
  sourceConnectionId: string;
  canReply?: boolean;
  canInitiate?: boolean;
  allowedDestinations?: string[];
}

/**
 * Replace the agent's source access and egress configuration. R4 is checked
 * here for a usable 400; the CHECK constraint underneath is the boundary.
 */
export async function replaceAgentSources(
  database: AnyDb,
  input: { teamId: string; agentId: string; sources: AgentSourceGrant[] } & AgentMeta,
): Promise<void> {
  await requireAgent(database, input.teamId, input.agentId);
  const seen = new Set<string>();
  const normalized = input.sources.map((entry) => {
    if (seen.has(entry.sourceConnectionId)) {
      throw badRequest("INVALID_INPUT", "Duplicate source connection in grant set.");
    }
    seen.add(entry.sourceConnectionId);
    const destinations = [...new Set((entry.allowedDestinations ?? []).map((d) => d.trim()))];
    if (destinations.some((d) => d.length === 0)) {
      throw badRequest("INVALID_INPUT", "Allowed destinations must not contain empty values.");
    }
    const canInitiate = entry.canInitiate ?? false;
    if (canInitiate && destinations.length === 0) {
      throw badRequest(
        "ALLOWLIST_REQUIRED",
        "can_initiate requires a non-empty allowed_destinations (R4).",
      );
    }
    return {
      sourceConnectionId: entry.sourceConnectionId,
      canReply: entry.canReply ?? true,
      canInitiate,
      allowedDestinations: destinations,
    };
  });
  if (normalized.length > 0) {
    const rows = await database
      .select()
      .from(sourceConnections)
      .where(eq(sourceConnections.teamId, input.teamId));
    const visible = new Set(rows.map((r) => r.id));
    for (const entry of normalized) {
      if (!visible.has(entry.sourceConnectionId)) {
        throw badRequest(
          "UNKNOWN_CONNECTION",
          "One of the source connections does not exist in this team.",
        );
      }
    }
  }
  try {
    await database
      .delete(agentSources)
      .where(and(eq(agentSources.agentId, input.agentId), eq(agentSources.teamId, input.teamId)));
    if (normalized.length > 0) {
      await database.insert(agentSources).values(
        normalized.map((entry) => ({
          id: randomUUID(),
          teamId: input.teamId,
          agentId: input.agentId,
          sourceConnectionId: entry.sourceConnectionId,
          canReply: entry.canReply,
          canInitiate: entry.canInitiate,
          allowedDestinations: entry.allowedDestinations,
        })),
      );
    }
  } catch (error) {
    if (isR4Violation(error)) {
      throw badRequest(
        "ALLOWLIST_REQUIRED",
        "can_initiate requires a non-empty allowed_destinations (R4).",
      );
    }
    throw error;
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "agent.grants.sources",
    resourceType: "agent",
    resourceId: input.agentId,
    outcome: "allowed",
    metadata: { sources: normalized },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
