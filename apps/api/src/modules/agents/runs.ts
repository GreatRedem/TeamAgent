import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  agentKnowledgeBases,
  agentPermissions,
  agentRuns,
  agentSources,
  agentTools,
  agents,
  approvalRequests,
  models,
  permissions,
  tools,
} from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { badRequest, notFound } from "../../lib/http.js";
import type { ContextTrustLevel } from "../../runtime/policy/capability.js";
import type { ModelProvider } from "../../runtime/model/gateway.js";
import {
  executeRunLoop,
  summarizeUsage,
  type LoopOutcome,
} from "../../runtime/agent-runtime/loop.js";
import { parseBudgets } from "../../runtime/agent-runtime/budgets.js";
import type { ToolHandlerDeps } from "../tools/registry.js";
import { writeAudit } from "../audit/log.js";
import { incrementMetric } from "../../observability/metrics.js";
import { currentTrace, newTraceId } from "../../observability/trace.js";
import type { AgentMeta } from "./service.js";

export { newTraceId };

export interface RunPrincipal {
  kind: "user" | "api_key";
  userId: string | null;
  apiKeyId: string | null;
  /** Ingress trust label for the submitted content (docs/17 T16). */
  ingressTrust: "user_input" | "untrusted";
  memberships: Array<{ teamId: string; permissions: string[] }>;
}

export interface RuntimeDeps {
  provider: ModelProvider;
  toolHandlerDeps?: Partial<ToolHandlerDeps>;
  approvalTtlSeconds: number;
}

export interface StartRunInput extends AgentMeta {
  teamId: string;
  agentId: string;
  principal: RunPrincipal;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  sourceId?: string | null;
  idempotencyKey?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { cause?: { code?: unknown } }).cause?.code === "23505";
}

async function requireActiveAgent(database: AnyDb, teamId: string, agentId: string) {
  const rows = await database
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.teamId, teamId)));
  const agent = rows[0];
  if (agent === undefined) throw notFound("Agent");
  if (agent.status !== "active") {
    throw badRequest("AGENT_UNAVAILABLE", "The agent is not active and cannot start runs.");
  }
  return agent;
}

async function requireActiveModel(database: AnyDb, modelId: string | null) {
  if (modelId === null) {
    throw badRequest("MODEL_NOT_CONFIGURED", "The agent has no model configured.");
  }
  const rows = await database.select().from(models).where(eq(models.id, modelId));
  const model = rows[0];
  if (model === undefined || model.status !== "active") {
    throw badRequest("MODEL_UNAVAILABLE", "The agent's model is not available.");
  }
  return model;
}

export interface ResolvedGrants {
  permissionNames: string[];
  tools: Array<{
    id: string;
    name: string;
    description: string | null;
    inputSchema: unknown;
    riskTier: string;
  }>;
  knowledgeBaseIds: string[];
  sources: Array<{
    connectionId: string;
    canReply: boolean;
    canInitiate: boolean;
    allowedDestinations: string[];
  }>;
}

export async function resolveGrants(
  database: AnyDb,
  teamId: string,
  agentId: string,
): Promise<ResolvedGrants> {
  const [permissionRows, toolLinkRows, knowledgeRows, sourceRows, toolRows] = await Promise.all([
    database
      .select({ name: permissions.name })
      .from(agentPermissions)
      .innerJoin(permissions, eq(agentPermissions.permissionId, permissions.id))
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
    database.select().from(tools),
  ]);
  const grantedToolIds = new Set(toolLinkRows.map((r) => r.toolId));
  const visibleTools = toolRows.filter(
    (t) => grantedToolIds.has(t.id) && (t.teamId === null || t.teamId === teamId),
  );
  return {
    permissionNames: permissionRows.map((r) => r.name),
    tools: visibleTools.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      riskTier: t.riskTier,
    })),
    knowledgeBaseIds: knowledgeRows.map((r) => r.knowledgeBaseId),
    sources: sourceRows.map((r) => ({
      connectionId: r.sourceConnectionId,
      canReply: r.canReply,
      canInitiate: r.canInitiate,
      allowedDestinations: r.allowedDestinations,
    })),
  };
}

export function destinationPolicyFor(sources: ResolvedGrants["sources"]): {
  allowedDestinations: string[];
  canInitiate: boolean;
} {
  // The schema links tools and source connections to the agent independently,
  // with no tool-to-connection mapping, so the run carries the union. A
  // proposed destination outside every granted list is still denied; binding
  // individual tools to individual connections is a future refinement.
  return {
    allowedDestinations: [...new Set(sources.flatMap((s) => s.allowedDestinations))],
    canInitiate: sources.some((s) => s.canInitiate),
  };
}

async function findExistingRun(
  database: AnyDb,
  teamId: string,
  agentId: string,
  idempotencyKey: string,
): Promise<typeof agentRuns.$inferSelect | undefined> {
  const rows = await database
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.agentId, agentId),
        eq(agentRuns.teamId, teamId),
        eq(agentRuns.idempotencyKey, idempotencyKey),
      ),
    );
  return rows[0];
}

function toRunSummary(row: typeof agentRuns.$inferSelect): {
  runId: string;
  status: string;
  traceId: string | null;
} {
  return { runId: row.id, status: row.status, traceId: row.traceId };
}

export async function persistOutcome(
  database: AnyDb,
  runId: string,
  outcome: LoopOutcome,
  now: Date,
): Promise<void> {
  if (outcome.status === "succeeded") {
    await database
      .update(agentRuns)
      .set({
        status: "succeeded",
        output: { text: outcome.finalText, knowledge: outcome.knowledge } as Record<
          string,
          unknown
        >,
        tokenUsage: summarizeUsage(outcome.usage),
        completedAt: now,
      })
      .where(eq(agentRuns.id, runId));
  } else if (outcome.status === "waiting_for_approval") {
    // Loop state rides in `output` so a later approval decision can resume
    // exactly where the run suspended — no schema change needed.
    await database
      .update(agentRuns)
      .set({
        status: "waiting_for_approval",
        output: {
          resume: {
            transcript: outcome.transcript,
            knowledge: outcome.knowledge,
            inputTokens: outcome.usage.inputTokens,
            outputTokens: outcome.usage.outputTokens,
            modelIterations: outcome.suspended.modelIterations,
            toolCallsMade: outcome.suspended.toolCallsMade,
            elapsedMs: outcome.suspended.elapsedMs,
            trust: outcome.suspended.trust,
            requestingUserId: outcome.suspended.requestingUserId,
          },
        } as Record<string, unknown>,
        tokenUsage: summarizeUsage(outcome.usage),
      })
      .where(eq(agentRuns.id, runId));
  } else if (outcome.status === "budget_exceeded") {
    await database
      .update(agentRuns)
      .set({
        status: "budget_exceeded",
        error: outcome.reason,
        tokenUsage: summarizeUsage(outcome.usage),
        completedAt: now,
      })
      .where(eq(agentRuns.id, runId));
  } else {
    await database
      .update(agentRuns)
      .set({
        status: "failed",
        error: outcome.error,
        tokenUsage: summarizeUsage(outcome.usage),
        completedAt: now,
      })
      .where(eq(agentRuns.id, runId));
  }
}

/**
 * Start an agent run and execute it to a terminal-or-waiting state
 * (docs/11-runtime.md core flow). Execution is synchronous and bounded by
 * the agent's budgets; queue dispatch for long-running automation is the
 * follow-up, not a silent behavior change here.
 */
export async function startRun(
  database: AnyDb,
  runtime: RuntimeDeps,
  input: StartRunInput,
): Promise<{ runId: string; status: string; traceId: string }> {
  const agent = await requireActiveAgent(database, input.teamId, input.agentId);
  const model = await requireActiveModel(database, agent.modelId);

  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    const existing = await findExistingRun(
      database,
      input.teamId,
      input.agentId,
      input.idempotencyKey,
    );
    if (existing !== undefined) {
      const summary = toRunSummary(existing);
      return { runId: summary.runId, status: summary.status, traceId: summary.traceId ?? "" };
    }
  }

  const grants = await resolveGrants(database, input.teamId, input.agentId);
  const membership = input.principal.memberships.find((m) => m.teamId === input.teamId);
  const requestingUserPermissions = membership ? membership.permissions : [];
  // Adopt the ambient trace — the HTTP request or the restored job context —
  // so the run's tool calls and audit rows share one trace_id with whatever
  // caused it (docs/22: the queue boundary is where tracing breaks).
  const traceId = currentTrace().traceId;
  const budgets = parseBudgets(agent.budgets);

  // T13: pin the resolved configuration that produces this run. No secrets:
  // credential references stay out even though they are references, because
  // a run record must be safe to show to anyone who may read runs.
  const snapshot = {
    agent: { id: agent.id, name: agent.name },
    model: { id: model.id, provider: model.provider, name: model.name, version: model.version },
    system_prompt: agent.systemPrompt,
    settings: agent.settings,
    budgets,
    permissions: grants.permissionNames,
    tools: grants.tools.map((t) => ({ id: t.id, name: t.name, risk_tier: t.riskTier })),
    knowledge_bases: grants.knowledgeBaseIds,
    sources: grants.sources.map((s) => ({
      connection_id: s.connectionId,
      can_reply: s.canReply,
      can_initiate: s.canInitiate,
      allowed_destinations: s.allowedDestinations,
    })),
    ingress: { actor_type: input.principal.kind, trust: input.principal.ingressTrust },
  };

  const runId = randomUUID();
  const ingressTrust: ContextTrustLevel = input.principal.ingressTrust;
  try {
    await database.insert(agentRuns).values({
      id: runId,
      teamId: input.teamId,
      agentId: input.agentId,
      status: "queued",
      contextTrustLevel: ingressTrust,
      inputPayload: {
        messages: input.messages,
        source_id: input.sourceId ?? null,
      } as Record<string, unknown>,
      agentSnapshot: snapshot as Record<string, unknown>,
      idempotencyKey: input.idempotencyKey ?? null,
      traceId,
    });
  } catch (error) {
    // Lost race on the idempotency key: return the winner's run.
    if (
      input.idempotencyKey !== undefined &&
      input.idempotencyKey !== null &&
      isUniqueViolation(error)
    ) {
      const existing = await findExistingRun(
        database,
        input.teamId,
        input.agentId,
        input.idempotencyKey,
      );
      if (existing !== undefined) {
        const summary = toRunSummary(existing);
        return { runId: summary.runId, status: summary.status, traceId: summary.traceId ?? "" };
      }
    }
    throw error;
  }

  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.principal.kind,
    actorId: input.principal.userId ?? input.principal.apiKeyId,
    action: "agent.run.start",
    resourceType: "agent_run",
    resourceId: runId,
    outcome: "allowed",
    metadata: { agent_id: input.agentId },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    traceId,
  });

  const outcome = await executeRunLoop(
    {
      db: database,
      provider: runtime.provider,
      toolHandlerDeps: runtime.toolHandlerDeps,
      approvalTtlSeconds: runtime.approvalTtlSeconds,
    },
    {
      teamId: input.teamId,
      agentRunId: runId,
      traceId,
      agent: { id: agent.id, name: agent.name },
      model: { id: model.id, provider: model.provider, name: model.name, version: model.version },
      systemPrompt: agent.systemPrompt,
      permissionNames: grants.permissionNames,
      requestingUserPermissions,
      tools: grants.tools,
      destinationPolicy: destinationPolicyFor(grants.sources),
      origin: input.sourceId ?? null,
      ingressTrust,
      inputMessages: input.messages,
      knowledgeBaseIds: grants.knowledgeBaseIds,
      budgets,
      actor: { type: input.principal.kind, id: input.principal.userId ?? input.principal.apiKeyId },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  );

  const completedAt = new Date();
  incrementMetric("agent_runs_total", { status: outcome.status });
  if (outcome.status === "budget_exceeded") {
    // C10 terminations (docs/22): a non-zero rate means budgets are doing
    // their job — or an injection loop is running — and `limit_type` says
    // which limit fired (iterations, tool calls, tokens, wall clock).
    incrementMetric("run_budget_exceeded_total", { limit_type: outcome.reason });
  }
  await persistOutcome(database, runId, outcome, completedAt);
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "agent",
    actorId: agent.id,
    action: "agent.run.complete",
    resourceType: "agent_run",
    resourceId: runId,
    outcome: "allowed",
    reason: outcome.status === "succeeded" ? null : outcome.status,
    metadata: { status: outcome.status },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    traceId,
  });

  return { runId, status: outcome.status, traceId };
}

function toRunView(row: typeof agentRuns.$inferSelect): unknown {
  return {
    id: row.id,
    agent_id: row.agentId,
    status: row.status,
    output: row.output,
    error: row.error,
    context_trust_level: row.contextTrustLevel,
    token_usage: row.tokenUsage,
    cost_estimate: row.costEstimate,
    trace_id: row.traceId,
    created_at: row.createdAt.toISOString(),
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

/**
 * Fetch a run. A run suspended on an expired approval is a denial
 * (docs/17 C5): the transition happens lazily here so no sweeper needs to
 * exist before the approvals API lands.
 */
export async function getRun(
  database: AnyDb,
  teamId: string,
  agentId: string,
  runId: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<unknown> {
  const agentRows = await database
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.teamId, teamId)));
  if (agentRows.length === 0) throw notFound("Agent");
  const runRows = await database
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.id, runId), eq(agentRuns.agentId, agentId), eq(agentRuns.teamId, teamId)),
    );
  const run = runRows[0];
  if (run === undefined) throw notFound("Run");

  if (run.status === "waiting_for_approval") {
    const expired = await expireStaleApproval(database, teamId, runId, meta);
    if (expired) {
      const refreshed = await database.select().from(agentRuns).where(eq(agentRuns.id, runId));
      const current = refreshed[0];
      if (current !== undefined) return toRunView(current);
    }
  }
  return toRunView(run);
}

export async function expireStaleApproval(
  database: AnyDb,
  teamId: string,
  runId: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<boolean> {
  const pending = await database
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.agentRunId, runId), eq(approvalRequests.teamId, teamId)));
  const open = pending.filter((a) => a.status === "pending");
  if (open.length === 0) return false;
  const now = new Date();
  const stale = open.filter((a) => a.expiresAt.getTime() <= now.getTime());
  if (stale.length === 0) return false;
  for (const approval of stale) {
    await database
      .update(approvalRequests)
      .set({ status: "expired", decidedAt: now })
      .where(eq(approvalRequests.id, approval.id));
  }
  await database
    .update(agentRuns)
    .set({ status: "denied", error: "The approval expired without a decision.", completedAt: now })
    .where(eq(agentRuns.id, runId));
  await writeAudit(database, {
    teamId,
    actorType: "system",
    actorId: null,
    action: "agent.run.complete",
    resourceType: "agent_run",
    resourceId: runId,
    outcome: "allowed",
    reason: "approval-expired",
    metadata: { status: "denied" },
    ipAddress: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  });
  return true;
}
