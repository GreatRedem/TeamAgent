import { and, eq, inArray } from "drizzle-orm";
import { agentRuns, agents, approvalRequests, models, toolCalls } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { badRequest, conflict, notFound } from "../../lib/http.js";
import type { ContextTrustLevel } from "../../runtime/policy/capability.js";
import { minTrust, type ContextItem } from "../../runtime/agent-runtime/context.js";
import {
  resumeRunLoop,
  type LoopRequest,
  type SuspendedState,
} from "../../runtime/agent-runtime/loop.js";
import { parseBudgets } from "../../runtime/agent-runtime/budgets.js";
import { executeToolCall } from "../tools/runtime.js";
import { loadMemberships } from "../auth/principal.js";
import { writeAudit } from "../audit/log.js";
import {
  destinationPolicyFor,
  expireStaleApproval,
  persistOutcome,
  resolveGrants,
  type RuntimeDeps,
} from "../agents/runs.js";

export interface ApprovalActor {
  kind: "user" | "api_key";
  userId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ApprovalFilters {
  status?: string;
  agentId?: string;
  contextTrustLevel?: string;
}

type ApprovalRow = typeof approvalRequests.$inferSelect;

function parseOrigin(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function agentName(database: AnyDb, teamId: string, agentId: string): Promise<string | null> {
  const rows = await database
    .select({ name: agents.name })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.teamId, teamId)));
  return rows[0]?.name ?? null;
}

async function toApprovalView(
  database: AnyDb,
  teamId: string,
  approval: ApprovalRow,
): Promise<unknown> {
  const runRows = await database
    .select({ agentId: agentRuns.agentId })
    .from(agentRuns)
    .where(and(eq(agentRuns.id, approval.agentRunId ?? ""), eq(agentRuns.teamId, teamId)));
  const agentId = runRows[0]?.agentId ?? null;
  const callRows =
    approval.toolCallId === null
      ? []
      : await database.select().from(toolCalls).where(eq(toolCalls.id, approval.toolCallId));
  const call = callRows[0];
  return {
    id: approval.id,
    status: approval.status,
    run_id: approval.agentRunId,
    agent:
      agentId === null ? null : { id: agentId, name: await agentName(database, teamId, agentId) },
    proposed_action: approval.proposedAction,
    context_trust_level: call?.contextTrustLevel ?? null,
    triggering_content: approval.triggeringContent,
    triggering_origin: parseOrigin(approval.triggeringOrigin),
    expires_at: approval.expiresAt.toISOString(),
    decided_by: approval.decidedBy,
    decided_at: approval.decidedAt ? approval.decidedAt.toISOString() : null,
  };
}

export async function listApprovals(
  database: AnyDb,
  teamId: string,
  filters: ApprovalFilters,
): Promise<unknown[]> {
  let runIds: string[] | null = null;
  if (filters.agentId !== undefined) {
    const runs = await database
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.agentId, filters.agentId), eq(agentRuns.teamId, teamId)));
    runIds = runs.map((r) => r.id);
    if (runIds.length === 0) return [];
  }
  const rows = await database
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.teamId, teamId),
        filters.status === undefined ? undefined : eq(approvalRequests.status, filters.status),
        runIds === null ? undefined : inArray(approvalRequests.agentRunId, runIds),
      ),
    );
  let views = await Promise.all(rows.map((r) => toApprovalView(database, teamId, r)));
  if (filters.contextTrustLevel !== undefined) {
    views = views.filter(
      (v) =>
        (v as { context_trust_level?: unknown }).context_trust_level === filters.contextTrustLevel,
    );
  }
  return views;
}

export async function getApproval(
  database: AnyDb,
  teamId: string,
  approvalId: string,
): Promise<unknown> {
  const rows = await database
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.teamId, teamId)));
  const approval = rows[0];
  if (approval === undefined) throw notFound("Approval");
  return toApprovalView(database, teamId, approval);
}

async function requirePendingApproval(
  database: AnyDb,
  teamId: string,
  approvalId: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<ApprovalRow> {
  const rows = await database
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.teamId, teamId)));
  const approval = rows[0];
  if (approval === undefined) throw notFound("Approval");
  if (approval.status !== "pending") {
    throw badRequest("APPROVAL_NOT_PENDING", "The approval has already been decided.");
  }
  if (approval.expiresAt.getTime() <= Date.now()) {
    if (approval.agentRunId !== null) {
      await expireStaleApproval(database, teamId, approval.agentRunId, meta);
    }
    throw badRequest("APPROVAL_EXPIRED", "The approval expired without a decision.");
  }
  return approval;
}

/** Claim a pending approval exactly once; a lost race is a 409, not a double resume. */
async function claimApproval(
  database: AnyDb,
  approvalId: string,
  patch: { status: string; decidedBy: string | null; decidedAt: Date },
): Promise<void> {
  const claimed = await database
    .update(approvalRequests)
    .set(patch)
    .where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.status, "pending")))
    .returning();
  if (claimed.length === 0) {
    throw conflict("APPROVAL_ALREADY_DECIDED", "The approval was decided concurrently.");
  }
}

interface ResumeContext {
  run: typeof agentRuns.$inferSelect;
  agent: { id: string; name: string };
  attempt: typeof toolCalls.$inferSelect;
  proposedArgs: unknown;
  proposedDestination: string | null;
  snapshot: {
    model: { id: string; provider: string; name: string; version: string };
    systemPrompt: string | null;
    permissionNames: string[];
    knowledgeBaseIds: string[];
    budgetsRaw: unknown;
    ingressTrust: ContextTrustLevel;
  };
  grants: Awaited<ReturnType<typeof resolveGrants>>;
  state: SuspendedState;
  origin: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseContextItem(value: unknown): ContextItem | null {
  if (!isRecord(value)) return null;
  const { role, trust, origin, content, toolCallId } = value;
  if (role !== "user" && role !== "assistant" && role !== "tool") return null;
  if (trust !== "trusted" && trust !== "user_input" && trust !== "untrusted") return null;
  if (typeof origin !== "string" || typeof content !== "string") return null;
  if (toolCallId !== undefined && typeof toolCallId !== "string") return null;
  return { role, trust, origin, content, toolCallId };
}

function parseResumeState(output: unknown): SuspendedState | null {
  if (!isRecord(output) || !isRecord(output["resume"])) return null;
  const resume = output["resume"];
  const {
    transcript,
    inputTokens,
    outputTokens,
    modelIterations,
    toolCallsMade,
    elapsedMs,
    trust,
    requestingUserId,
  } = resume as Record<string, unknown>;
  if (!Array.isArray(transcript)) return null;
  const items: ContextItem[] = [];
  for (const entry of transcript) {
    const item = parseContextItem(entry);
    if (item === null) return null;
    items.push(item);
  }
  const refs: SuspendedState["knowledge"] = [];
  const rawKnowledge = (resume as Record<string, unknown>)["knowledge"];
  if (rawKnowledge !== undefined) {
    if (!Array.isArray(rawKnowledge)) return null;
    for (const entry of rawKnowledge) {
      if (!isRecord(entry)) return null;
      const ref = entry as Record<string, unknown>;
      if (typeof ref["itemId"] !== "string" || typeof ref["chunkId"] !== "string") return null;
      if (
        ref["trust"] !== "trusted" &&
        ref["trust"] !== "user_input" &&
        ref["trust"] !== "untrusted"
      ) {
        return null;
      }
      refs.push({
        itemId: ref["itemId"] as string,
        chunkId: ref["chunkId"] as string,
        trust: ref["trust"] as ContextTrustLevel,
      });
    }
  }
  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof modelIterations !== "number" ||
    typeof toolCallsMade !== "number" ||
    typeof elapsedMs !== "number"
  ) {
    return null;
  }
  if (trust !== "trusted" && trust !== "user_input" && trust !== "untrusted") return null;
  if (
    requestingUserId !== null &&
    requestingUserId !== undefined &&
    typeof requestingUserId !== "string"
  ) {
    return null;
  }
  return {
    transcript: items,
    usage: { inputTokens, outputTokens },
    knowledge: refs,
    modelIterations,
    toolCallsMade,
    elapsedMs,
    trust,
    requestingUserId: typeof requestingUserId === "string" ? requestingUserId : null,
  };
}

function parseSnapshot(snapshot: unknown): ResumeContext["snapshot"] | null {
  if (!isRecord(snapshot)) return null;
  const model = snapshot["model"];
  const ingress = snapshot["ingress"];
  if (!isRecord(model) || !isRecord(ingress)) return null;
  const { id, provider, name, version } = model as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    typeof provider !== "string" ||
    typeof name !== "string" ||
    typeof version !== "string"
  ) {
    return null;
  }
  const trust = ingress["trust"];
  if (trust !== "trusted" && trust !== "user_input" && trust !== "untrusted") return null;
  const permissions = snapshot["permissions"];
  const systemPrompt = snapshot["system_prompt"];
  const knowledgeBases = snapshot["knowledge_bases"];
  if (!Array.isArray(permissions) || !permissions.every((p) => typeof p === "string")) return null;
  if (
    knowledgeBases !== undefined &&
    (!Array.isArray(knowledgeBases) || !knowledgeBases.every((b) => typeof b === "string"))
  ) {
    return null;
  }
  if (systemPrompt !== null && systemPrompt !== undefined && typeof systemPrompt !== "string") {
    return null;
  }
  return {
    model: { id, provider, name, version },
    systemPrompt: typeof systemPrompt === "string" ? systemPrompt : null,
    permissionNames: permissions as string[],
    knowledgeBaseIds: Array.isArray(knowledgeBases) ? (knowledgeBases as string[]) : [],
    budgetsRaw: snapshot["budgets"],
    ingressTrust: trust,
  };
}

async function loadResumeContext(
  database: AnyDb,
  teamId: string,
  approval: ApprovalRow,
): Promise<ResumeContext> {
  if (approval.agentRunId === null) {
    throw badRequest("RUN_NOT_WAITING", "The approval is not attached to a run.");
  }
  const runRows = await database
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, approval.agentRunId), eq(agentRuns.teamId, teamId)));
  const run = runRows[0];
  if (run === undefined) throw notFound("Run");
  if (run.status !== "waiting_for_approval") {
    throw badRequest("RUN_NOT_WAITING", "The run is no longer suspended on this approval.");
  }
  const agentRows = await database
    .select()
    .from(agents)
    .where(and(eq(agents.id, run.agentId), eq(agents.teamId, teamId)));
  const agent = agentRows[0];
  if (agent === undefined || agent.status !== "active") {
    throw badRequest("AGENT_UNAVAILABLE", "The agent is not active and the run cannot resume.");
  }
  const modelRows = await database
    .select()
    .from(models)
    .where(eq(models.id, agent.modelId ?? ""));
  const model = modelRows[0];
  if (model === undefined || model.status !== "active") {
    throw badRequest("MODEL_UNAVAILABLE", "The agent's model is not available.");
  }
  const snapshot = parseSnapshot(run.agentSnapshot);
  const state = parseResumeState(run.output);
  if (snapshot === null || state === null) {
    throw badRequest("RESUME_STATE_CORRUPT", "The suspended run state cannot be read.");
  }
  const attemptRows =
    approval.toolCallId === null
      ? []
      : await database.select().from(toolCalls).where(eq(toolCalls.id, approval.toolCallId));
  const attempt = attemptRows[0];
  if (attempt === undefined) {
    throw badRequest("RESUME_STATE_CORRUPT", "The suspended tool call cannot be found.");
  }
  const proposed = approval.proposedAction;
  if (!isRecord(proposed)) {
    throw badRequest("RESUME_STATE_CORRUPT", "The approved action cannot be read.");
  }
  const grants = await resolveGrants(database, teamId, agent.id);
  const inputPayload = isRecord(run.inputPayload) ? run.inputPayload : {};
  const origin =
    typeof inputPayload["source_id"] === "string" ? (inputPayload["source_id"] as string) : null;
  return {
    run,
    agent: { id: agent.id, name: agent.name },
    attempt,
    proposedArgs: proposed["arguments"],
    proposedDestination:
      typeof proposed["resolved_destination"] === "string"
        ? (proposed["resolved_destination"] as string)
        : null,
    snapshot,
    grants,
    state,
    origin,
  };
}

async function requestingUserPermissions(
  database: AnyDb,
  teamId: string,
  requestingUserId: string | null,
): Promise<string[]> {
  if (requestingUserId === null) return [];
  const memberships = await loadMemberships(database, requestingUserId, new Date()).catch(() => []);
  return memberships.find((m) => m.teamId === teamId)?.permissions ?? [];
}

function buildLoopRequest(
  teamId: string,
  traceId: string,
  ctx: ResumeContext,
  requestingPerms: string[],
  actor: { type: "user" | "api_key"; id: string | null },
  ip: string | null,
  userAgent: string | null,
): LoopRequest {
  return {
    teamId,
    agentRunId: ctx.run.id,
    traceId,
    agent: ctx.agent,
    model: ctx.snapshot.model,
    systemPrompt: ctx.snapshot.systemPrompt,
    permissionNames: ctx.snapshot.permissionNames,
    requestingUserPermissions: requestingPerms,
    tools: ctx.grants.tools,
    destinationPolicy: destinationPolicyFor(ctx.grants.sources),
    origin: ctx.origin,
    ingressTrust: ctx.snapshot.ingressTrust,
    inputMessages: [],
    knowledgeBaseIds: ctx.snapshot.knowledgeBaseIds,
    budgets: parseBudgets(ctx.snapshot.budgetsRaw),
    actor,
    ip,
    userAgent,
  };
}

/**
 * Approve exactly the suspended action — these arguments, this destination —
 * and resume the run. Approval grants one execution: trust does not rise,
 * later calls need their own approvals, and current grants are re-checked
 * before anything executes, so a revoked grant fails closed.
 */
export async function approveApproval(
  database: AnyDb,
  runtime: RuntimeDeps,
  input: {
    teamId: string;
    approvalId: string;
    note?: string | null;
    actor: ApprovalActor;
  },
): Promise<{ runId: string; status: string; traceId: string }> {
  const meta = { ip: input.actor.ip ?? null, userAgent: input.actor.userAgent ?? null };
  const approval = await requirePendingApproval(database, input.teamId, input.approvalId, meta);
  const ctx = await loadResumeContext(database, input.teamId, approval);

  // The tool must still be granted: an approval cannot outlive revocation.
  const granted = ctx.grants.tools.find((t) => t.id === ctx.attempt.toolId);
  if (granted === undefined || ctx.attempt.toolId === null) {
    throw badRequest("GRANT_REVOKED", "The tool is no longer granted to the agent.");
  }

  await claimApproval(database, approval.id, {
    status: "approved",
    decidedBy: input.actor.userId,
    decidedAt: new Date(),
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actor.kind,
    actorId: input.actor.userId,
    action: "approval.decide",
    resourceType: "approval_request",
    resourceId: approval.id,
    outcome: "allowed",
    metadata: { decision: "approved", run_id: ctx.run.id },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    traceId: ctx.run.traceId,
  });

  const requestingPerms = await requestingUserPermissions(
    database,
    input.teamId,
    ctx.state.requestingUserId,
  );
  const loopRequest = buildLoopRequest(
    input.teamId,
    ctx.run.traceId ?? "",
    ctx,
    requestingPerms,
    { type: input.actor.kind, id: input.actor.userId },
    meta.ip,
    meta.userAgent,
  );

  const execution = await executeToolCall(database, {
    teamId: input.teamId,
    actor: { type: input.actor.kind, id: input.actor.userId },
    toolId: granted.id,
    args: ctx.proposedArgs,
    contextTrust: ctx.state.trust,
    callerPermissions: ctx.snapshot.permissionNames,
    onBehalfOfPermissions: requestingPerms,
    agentRunId: ctx.run.id,
    origin: ctx.origin,
    destinationPolicy: destinationPolicyFor(ctx.grants.sources),
    proposedDestination: ctx.proposedDestination,
    handlerDeps: runtime.toolHandlerDeps,
    preAuthorized: { approvalId: approval.id },
  });

  if (execution.decision !== "allowed") {
    // Approved by a human but refused by current policy (schema or allowlist
    // changed mid-wait): terminal denial, never silent execution.
    const completedAt = new Date();
    await database
      .update(agentRuns)
      .set({
        status: "denied",
        error: `Approved action refused by policy: ${execution.reason}.`,
        completedAt,
      })
      .where(eq(agentRuns.id, ctx.run.id));
    await writeAudit(database, {
      teamId: input.teamId,
      actorType: "agent",
      actorId: ctx.agent.id,
      action: "agent.run.complete",
      resourceType: "agent_run",
      resourceId: ctx.run.id,
      outcome: "allowed",
      reason: execution.reason,
      metadata: { status: "denied" },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      traceId: ctx.run.traceId,
    });
    return { runId: ctx.run.id, status: "denied", traceId: ctx.run.traceId ?? "" };
  }

  // The approved result re-enters untrusted like any other (docs/17 T4):
  // an approval permits the action, it never launders the content.
  const resumed: SuspendedState = {
    transcript: [
      ...ctx.state.transcript,
      {
        role: "tool",
        trust: "untrusted" as const,
        origin: `tool:${granted.name}`,
        content: JSON.stringify(execution.output),
      },
    ],
    usage: {
      inputTokens: ctx.state.usage.inputTokens,
      outputTokens: ctx.state.usage.outputTokens,
    },
    knowledge: ctx.state.knowledge,
    modelIterations: ctx.state.modelIterations,
    toolCallsMade: ctx.state.toolCallsMade + 1,
    elapsedMs: ctx.state.elapsedMs,
    trust: minTrust(ctx.state.trust, execution.outputTrust),
    requestingUserId: ctx.state.requestingUserId,
  };

  const outcome = await resumeRunLoop(
    {
      db: database,
      provider: runtime.provider,
      toolHandlerDeps: runtime.toolHandlerDeps,
      approvalTtlSeconds: runtime.approvalTtlSeconds,
    },
    loopRequest,
    resumed,
  );
  await persistOutcome(database, ctx.run.id, outcome, new Date());
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "agent",
    actorId: ctx.agent.id,
    action: "agent.run.complete",
    resourceType: "agent_run",
    resourceId: ctx.run.id,
    outcome: "allowed",
    reason: outcome.status === "succeeded" ? null : outcome.status,
    metadata: { status: outcome.status },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    traceId: ctx.run.traceId,
  });
  return { runId: ctx.run.id, status: outcome.status, traceId: ctx.run.traceId ?? "" };
}

/**
 * Reject the suspended action and terminate the run. The reason is recorded
 * on the run so the refusal is explainable rather than a silent stop.
 */
export async function rejectApproval(
  database: AnyDb,
  input: {
    teamId: string;
    approvalId: string;
    reason?: string | null;
    actor: ApprovalActor;
  },
): Promise<{ runId: string; status: string }> {
  const meta = { ip: input.actor.ip ?? null, userAgent: input.actor.userAgent ?? null };
  const approval = await requirePendingApproval(database, input.teamId, input.approvalId, meta);
  if (approval.agentRunId === null) {
    throw badRequest("RUN_NOT_WAITING", "The approval is not attached to a run.");
  }
  const runRows = await database
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, approval.agentRunId), eq(agentRuns.teamId, input.teamId)));
  const run = runRows[0];
  if (run === undefined) throw notFound("Run");
  if (run.status !== "waiting_for_approval") {
    throw badRequest("RUN_NOT_WAITING", "The run is no longer suspended on this approval.");
  }

  await claimApproval(database, approval.id, {
    status: "rejected",
    decidedBy: input.actor.userId,
    decidedAt: new Date(),
  });
  const completedAt = new Date();
  const error =
    input.reason !== undefined && input.reason !== null && input.reason !== ""
      ? input.reason
      : "Rejected by reviewer.";
  await database
    .update(agentRuns)
    .set({ status: "denied", error, completedAt })
    .where(eq(agentRuns.id, run.id));
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actor.kind,
    actorId: input.actor.userId,
    action: "approval.decide",
    resourceType: "approval_request",
    resourceId: approval.id,
    outcome: "allowed",
    metadata: { decision: "rejected", run_id: run.id },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    traceId: run.traceId,
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "agent",
    actorId: run.agentId,
    action: "agent.run.complete",
    resourceType: "agent_run",
    resourceId: run.id,
    outcome: "allowed",
    reason: "approval-rejected",
    metadata: { status: "denied" },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    traceId: run.traceId,
  });
  return { runId: run.id, status: "denied" };
}
