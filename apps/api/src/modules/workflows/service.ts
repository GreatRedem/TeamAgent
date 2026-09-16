import { randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  agentRuns,
  agents,
  tools,
  workflowRuns,
  workflowStepRuns,
  workflowSteps,
  workflowVersions,
  workflows,
} from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { AppError, badRequest, notFound } from "../../lib/http.js";
import {
  maxRiskTier,
  type ContextTrustLevel,
  type RiskTier,
} from "../../runtime/policy/capability.js";
import { minTrust } from "../../runtime/agent-runtime/context.js";
import { executeToolCall } from "../tools/runtime.js";
import { getRun as getAgentRun, newTraceId, startRun, type RuntimeDeps } from "../agents/runs.js";
import type { AgentMeta } from "../agents/service.js";
import { writeAudit } from "../audit/log.js";
import { assertValidScheduleCron, syncWorkflowSchedule } from "./schedule.js";
import { setWorkflowCurrentVersion } from "./versions.js";
import { collectStepReferences, renderTemplate, TemplateReferenceError } from "./template.js";

export const WORKFLOW_STATUSES = ["active", "paused", "archived"] as const;
export const STEP_KINDS = ["agent", "tool", "transform"] as const;
export const TRIGGER_TYPES = [
  "manual",
  "webhook",
  "message.received",
  "schedule",
  "agent.started",
  "user.created",
  "user.updated",
  "file.uploaded",
] as const;

const MAX_STEPS = 50;
const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_TIMEOUT_SECONDS = 600;
const MAX_RETRIES = 5;

function isUniqueViolation(error: unknown): boolean {
  return (error as { cause?: { code?: unknown } }).cause?.code === "23505";
}

function actorType(actorId: string | null): string {
  return actorId === null ? "api_key" : "user";
}

function asTrustLevel(value: unknown): ContextTrustLevel {
  return value === "trusted" || value === "user_input" || value === "untrusted"
    ? value
    : "untrusted";
}

async function requireWorkflow(database: AnyDb, teamId: string, workflowId: string) {
  const rows = await database
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.teamId, teamId)));
  const workflow = rows[0];
  if (workflow === undefined) throw notFound("Workflow");
  return workflow;
}

function toWorkflowJson(row: typeof workflows.$inferSelect): unknown {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    current_version_id: row.currentVersionId,
    created_at: row.createdAt.toISOString(),
  };
}

export async function createWorkflow(
  database: AnyDb,
  input: { teamId: string; name: string; description?: string | null } & AgentMeta,
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (name.length === 0) throw badRequest("INVALID_INPUT", "Workflow name must not be empty.");
  const id = randomUUID();
  await database.insert(workflows).values({
    id,
    teamId: input.teamId,
    name,
    description: input.description ?? null,
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "workflow.create",
    resourceType: "workflow",
    resourceId: id,
    outcome: "allowed",
    metadata: { name },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id };
}

export async function listWorkflows(database: AnyDb, teamId: string): Promise<unknown[]> {
  const rows = await database.select().from(workflows).where(eq(workflows.teamId, teamId));
  return rows.map(toWorkflowJson);
}

export async function getWorkflow(
  database: AnyDb,
  teamId: string,
  workflowId: string,
): Promise<unknown> {
  return toWorkflowJson(await requireWorkflow(database, teamId, workflowId));
}

export async function updateWorkflow(
  database: AnyDb,
  input: {
    teamId: string;
    workflowId: string;
    name?: string;
    description?: string | null;
    status?: string;
  } & AgentMeta,
): Promise<void> {
  await requireWorkflow(database, input.teamId, input.workflowId);
  const patch: Partial<typeof workflows.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0) throw badRequest("INVALID_INPUT", "Workflow name must not be empty.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description;
  if (input.status !== undefined) {
    if (!(WORKFLOW_STATUSES as readonly string[]).includes(input.status)) {
      throw badRequest("INVALID_INPUT", "Status must be active, paused, or archived.");
    }
    patch.status = input.status;
  }
  if (Object.keys(patch).length > 0) {
    await database.update(workflows).set(patch).where(eq(workflows.id, input.workflowId));
    // Status is the arming switch for schedule triggers: pausing must stop
    // the cron from firing, reactivating must resume it (now, not at the
    // next publish).
    if (patch.status !== undefined) {
      await syncWorkflowSchedule(database, input.workflowId);
    }
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "workflow.update",
    resourceType: "workflow",
    resourceId: input.workflowId,
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export interface VersionStepInput {
  stepKey: string;
  kind: string;
  config: Record<string, unknown>;
  position?: number;
}

export interface PublishVersionInput extends AgentMeta {
  teamId: string;
  workflowId: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown> | null;
  settings?: { retryCount?: number; timeoutSeconds?: number } | null;
  steps: VersionStepInput[];
  setCurrent?: boolean;
}

interface ValidatedStep {
  stepKey: string;
  kind: (typeof STEP_KINDS)[number];
  config: Record<string, unknown>;
  position: number;
}

function validateSettings(input: PublishVersionInput["settings"]): Record<string, unknown> {
  const retryCount = input?.retryCount ?? 0;
  const timeoutSeconds = input?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount > MAX_RETRIES) {
    throw badRequest("INVALID_INPUT", `retry_count must be an integer 0-${MAX_RETRIES}.`);
  }
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > MAX_TIMEOUT_SECONDS
  ) {
    throw badRequest(
      "INVALID_INPUT",
      `timeout_seconds must be an integer 1-${MAX_TIMEOUT_SECONDS}.`,
    );
  }
  return { retry_count: retryCount, timeout_seconds: timeoutSeconds };
}

async function validateSteps(
  database: AnyDb,
  teamId: string,
  steps: VersionStepInput[],
): Promise<ValidatedStep[]> {
  if (steps.length === 0 || steps.length > MAX_STEPS) {
    throw badRequest("INVALID_INPUT", `A version needs 1-${MAX_STEPS} steps.`);
  }
  const seen = new Set<string>();
  const validated: ValidatedStep[] = steps.map((step, index) => {
    if (!/^[a-z0-9_]{1,64}$/.test(step.stepKey)) {
      throw badRequest("INVALID_INPUT", `Step keys must match [a-z0-9_]{1,64}: '${step.stepKey}'.`);
    }
    if (seen.has(step.stepKey)) {
      throw badRequest("INVALID_INPUT", `Duplicate step key: '${step.stepKey}'.`);
    }
    seen.add(step.stepKey);
    if (!(STEP_KINDS as readonly string[]).includes(step.kind)) {
      throw badRequest(
        "INVALID_INPUT",
        `Unknown step kind '${step.kind}'. Linear MVP kinds: ${STEP_KINDS.join(", ")}.`,
      );
    }
    if (typeof step.config !== "object" || step.config === null || Array.isArray(step.config)) {
      throw badRequest("INVALID_INPUT", `Step '${step.stepKey}' needs a config object.`);
    }
    const position = step.position ?? index;
    if (!Number.isInteger(position) || position < 0) {
      throw badRequest("INVALID_INPUT", `Step '${step.stepKey}' needs a position >= 0.`);
    }
    return {
      stepKey: step.stepKey,
      kind: step.kind as ValidatedStep["kind"],
      config: step.config,
      position,
    };
  });

  // References must point strictly backwards: linear flow, no forward edges,
  // no self loops, no typos that fail silently at runtime.
  const order = new Map(validated.map((s, i) => [s.stepKey, i]));
  validated.forEach((step, index) => {
    for (const ref of collectStepReferences(step.config)) {
      const target = order.get(ref);
      if (target === undefined) {
        throw badRequest(
          "STEP_UNKNOWN_REFERENCE",
          `Step '${step.stepKey}' references unknown step '${ref}'.`,
        );
      }
      if (target >= index) {
        throw badRequest(
          "STEP_FORWARD_REFERENCE",
          `Step '${step.stepKey}' references '${ref}', which does not run before it.`,
        );
      }
    }
  });

  // Referenced resources must exist in this team now (advisory fail-fast;
  // the runtime re-checks before executing).
  for (const step of validated) {
    if (step.kind === "agent") {
      const agentId = step.config["agent_id"];
      if (typeof agentId !== "string") {
        throw badRequest("INVALID_INPUT", `Agent step '${step.stepKey}' needs an agent_id.`);
      }
      const rows = await database
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.teamId, teamId)));
      if (rows.length === 0)
        throw badRequest(
          "UNKNOWN_AGENT",
          `Agent step '${step.stepKey}' references an unknown agent.`,
        );
      const messages = step.config["messages"];
      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages.length > 20 ||
        messages.some(
          (m) =>
            typeof m !== "object" ||
            m === null ||
            !["user", "assistant"].includes((m as Record<string, unknown>)["role"] as string) ||
            typeof (m as Record<string, unknown>)["content"] !== "string" ||
            ((m as Record<string, unknown>)["content"] as string).length === 0 ||
            ((m as Record<string, unknown>)["content"] as string).length > 8000,
        )
      ) {
        throw badRequest(
          "INVALID_INPUT",
          `Agent step '${step.stepKey}' needs 1-20 messages with role user|assistant and content 1-8000 chars.`,
        );
      }
    } else if (step.kind === "tool") {
      const toolId = step.config["tool_id"];
      if (typeof toolId !== "string") {
        throw badRequest("INVALID_INPUT", `Tool step '${step.stepKey}' needs a tool_id.`);
      }
      const rows = await database
        .select({ id: tools.id })
        .from(tools)
        .where(and(eq(tools.id, toolId), or(eq(tools.teamId, teamId), isNull(tools.teamId))));
      if (rows.length === 0)
        throw badRequest("UNKNOWN_TOOL", `Tool step '${step.stepKey}' references an unknown tool.`);
      const args = step.config["arguments"];
      if (
        args !== undefined &&
        (typeof args !== "object" || args === null || Array.isArray(args))
      ) {
        throw badRequest(
          "INVALID_INPUT",
          `Tool step '${step.stepKey}' arguments must be an object.`,
        );
      }
    } else if (step.config["data"] === undefined) {
      throw badRequest("INVALID_INPUT", `Transform step '${step.stepKey}' needs a data template.`);
    }
  }
  return validated;
}

/**
 * Publish an immutable version. Editing is publishing: versions never
 * change, runs pin one, and rolling back means publishing a pointer change
 * (a new version row with old content, set_current) rather than editing.
 */
export async function publishVersion(
  database: AnyDb,
  input: PublishVersionInput,
): Promise<{ id: string; version: number }> {
  const workflow = await requireWorkflow(database, input.teamId, input.workflowId);
  if (!(TRIGGER_TYPES as readonly string[]).includes(input.triggerType)) {
    throw badRequest("INVALID_INPUT", `Unknown trigger type '${input.triggerType}'.`);
  }
  // Schedule triggers are validated at publish, not at fire time: a cron
  // that can never run should fail the request the author is watching.
  if (input.triggerType === "schedule") {
    assertValidScheduleCron(input.triggerConfig ?? null);
  }
  const settings = validateSettings(input.settings);
  const steps = await validateSteps(database, input.teamId, input.steps);

  // Monotonic per workflow; a lost race on the unique constraint retries
  // with a fresh maximum rather than failing the publish.
  let versionRow: { id: string; version: number } | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await database
      .select({ version: workflowVersions.version })
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id));
    const next = existing.reduce((max, r) => Math.max(max, r.version), 0) + 1;
    const id = randomUUID();
    try {
      await database.insert(workflowVersions).values({
        id,
        teamId: input.teamId,
        workflowId: workflow.id,
        version: next,
        trigger: {
          type: input.triggerType,
          config: input.triggerConfig ?? null,
        } as Record<string, unknown>,
        settings: settings as Record<string, unknown>,
      });
      versionRow = { id, version: next };
      break;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 2) throw error;
    }
  }
  if (versionRow === undefined) throw new Error("version publish retry exhausted");

  await database.insert(workflowSteps).values(
    steps.map((step) => ({
      id: randomUUID(),
      teamId: input.teamId,
      workflowVersionId: versionRow.id,
      stepKey: step.stepKey,
      kind: step.kind,
      config: step.config,
      position: step.position,
    })),
  );

  if (input.setCurrent ?? true) {
    // Own version: the R5 check passes by construction.
    await setWorkflowCurrentVersion(database, workflow.id, versionRow.id);
    // Derived state: the job_schedules row now agrees with the new current
    // version — armed iff the workflow is active with a schedule trigger.
    await syncWorkflowSchedule(database, workflow.id);
  }

  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "workflow.version.publish",
    resourceType: "workflow_version",
    resourceId: versionRow.id,
    outcome: "allowed",
    metadata: { workflow_id: workflow.id, version: versionRow.version },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return versionRow;
}

export async function listVersions(
  database: AnyDb,
  teamId: string,
  workflowId: string,
): Promise<unknown[]> {
  const workflow = await requireWorkflow(database, teamId, workflowId);
  const rows = await database
    .select()
    .from(workflowVersions)
    .where(and(eq(workflowVersions.workflowId, workflowId), eq(workflowVersions.teamId, teamId)));
  return rows
    .sort((a, b) => a.version - b.version)
    .map((r) => ({
      id: r.id,
      version: r.version,
      trigger: r.trigger,
      settings: r.settings,
      is_current: r.id === workflow.currentVersionId,
      created_at: r.createdAt.toISOString(),
    }));
}

export async function getVersion(
  database: AnyDb,
  teamId: string,
  workflowId: string,
  versionId: string,
): Promise<unknown> {
  const workflow = await requireWorkflow(database, teamId, workflowId);
  const rows = await database
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.id, versionId),
        eq(workflowVersions.workflowId, workflowId),
        eq(workflowVersions.teamId, teamId),
      ),
    );
  const version = rows[0];
  if (version === undefined) throw notFound("Workflow version");
  const steps = await database
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.workflowVersionId, versionId));
  return {
    id: version.id,
    version: version.version,
    trigger: version.trigger,
    settings: version.settings,
    is_current: version.id === workflow.currentVersionId,
    created_at: version.createdAt.toISOString(),
    steps: steps
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ step_key: s.stepKey, kind: s.kind, config: s.config, position: s.position })),
  };
}

export interface WorkflowRunPrincipal {
  kind: "user" | "api_key";
  userId: string | null;
  apiKeyId: string | null;
  ingressTrust: ContextTrustLevel;
  memberships: Array<{ teamId: string; permissions: string[] }>;
}

export interface WorkflowRuntimeDeps extends RuntimeDeps {
  sleep?: (ms: number) => Promise<void>;
}

export interface StartWorkflowRunInput extends AgentMeta {
  teamId: string;
  workflowId: string;
  principal: WorkflowRunPrincipal;
  input?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  /**
   * Propagate the caller's trace across a queue boundary (docs/23). Manual
   * runs omit it and mint a fresh trace; the workflow_trigger handler passes
   * the one the scheduler stamped on the job row.
   */
  traceId?: string | null;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function backoffMs(attempt: number): number {
  const base = Math.min(2000, 200 * 2 ** Math.max(0, attempt - 1));
  return Math.floor(base * (0.5 + Math.random()));
}

function toRunSummary(row: typeof workflowRuns.$inferSelect): {
  runId: string;
  status: string;
  traceId: string | null;
} {
  return { runId: row.id, status: row.status, traceId: row.traceId };
}

async function findExistingRun(
  database: AnyDb,
  teamId: string,
  workflowId: string,
  idempotencyKey: string,
): Promise<typeof workflowRuns.$inferSelect | undefined> {
  const rows = await database
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.teamId, teamId),
        eq(workflowRuns.idempotencyKey, idempotencyKey),
      ),
    );
  return rows[0];
}

type StepRow = typeof workflowSteps.$inferSelect;

interface StepOutcome {
  status: "succeeded" | "failed" | "denied";
  output: unknown;
  trust: ContextTrustLevel;
  error: string | null;
  agentRunId: string | null;
  attempts: number;
}

/**
 * Execute one step. Unattended semantics throughout: there is no human to
 * answer an approval gate mid-run, so write/admin-tier tool calls are denied
 * without executing, and a sub-agent run that suspends on approval denies
 * its step (the sub-run itself stays waiting — expiry still governs it).
 */
async function executeStep(
  database: AnyDb,
  runtime: WorkflowRuntimeDeps,
  ctx: {
    teamId: string;
    runId: string;
    step: StepRow;
    stepTrust: ContextTrustLevel;
    stepInput: { outputs: Record<string, unknown>; input: unknown };
    triggerPermissions: string[];
    principal: WorkflowRunPrincipal;
    retryCount: number;
    timeoutMs: number;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<StepOutcome> {
  const templateCtx = { steps: ctx.stepInput.outputs, input: ctx.stepInput.input };
  if (ctx.step.kind === "transform") {
    try {
      const output = renderTemplate(
        (ctx.step.config as Record<string, unknown>)["data"],
        templateCtx,
      );
      return {
        status: "succeeded",
        output,
        trust: ctx.stepTrust,
        error: null,
        agentRunId: null,
        attempts: 1,
      };
    } catch (error) {
      const message =
        error instanceof TemplateReferenceError ? error.message : "Transform step failed.";
      return {
        status: "failed",
        output: null,
        trust: ctx.stepTrust,
        error: message,
        agentRunId: null,
        attempts: 1,
      };
    }
  }

  if (ctx.step.kind === "agent") {
    const config = ctx.step.config as Record<string, unknown>;
    let messages: Array<{ role: "user" | "assistant"; content: string }>;
    try {
      messages = renderTemplate(config["messages"], templateCtx) as Array<{
        role: "user" | "assistant";
        content: string;
      }>;
    } catch (error) {
      const message =
        error instanceof TemplateReferenceError
          ? error.message
          : "Agent step input failed to render.";
      return {
        status: "failed",
        output: null,
        trust: ctx.stepTrust,
        error: message,
        agentRunId: null,
        attempts: 1,
      };
    }
    let started: { runId: string; status: string; traceId: string };
    try {
      started = await startRun(database, runtime, {
        teamId: ctx.teamId,
        agentId: config["agent_id"] as string,
        principal: {
          kind: "api_key",
          userId: null,
          apiKeyId: null,
          // startRun takes user_input|untrusted; a trusted label must
          // never enter a sub-run, so coerce rather than thread it.
          ingressTrust: ctx.stepTrust === "user_input" ? "user_input" : "untrusted",
          memberships: [],
        },
        messages,
        sourceId: null,
        idempotencyKey: `${ctx.runId}:${ctx.step.id}`,
        actorId: null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } catch (error) {
      const message =
        error instanceof AppError
          ? `${error.code}: ${error.message}`
          : "Agent step failed to start.";
      return {
        status: "failed",
        output: null,
        trust: ctx.stepTrust,
        error: message,
        agentRunId: null,
        attempts: 1,
      };
    }
    // Side effect only: let an expired suspended approval deny the sub-run.
    await getAgentRun(database, ctx.teamId, config["agent_id"] as string, started.runId).catch(
      () => null,
    );
    const subRows = await database.select().from(agentRuns).where(eq(agentRuns.id, started.runId));
    const sub = subRows[0];
    if (sub === undefined) {
      return {
        status: "failed",
        output: null,
        trust: ctx.stepTrust,
        error: "Agent run vanished.",
        agentRunId: started.runId,
        attempts: 1,
      };
    }
    const subTrust = asTrustLevel(sub.contextTrustLevel);
    if (sub.status === "succeeded") {
      return {
        status: "succeeded",
        output: sub.output,
        trust: minTrust(ctx.stepTrust, subTrust),
        error: null,
        agentRunId: sub.id,
        attempts: 1,
      };
    }
    if (sub.status === "waiting_for_approval") {
      return {
        status: "denied",
        output: null,
        trust: ctx.stepTrust,
        error: "Unattended run cannot obtain approval: write-tier action denied.",
        agentRunId: sub.id,
        attempts: 1,
      };
    }
    return {
      status: sub.status === "denied" ? "denied" : "failed",
      output: null,
      trust: ctx.stepTrust,
      error: sub.error ?? `Agent run ${sub.status}.`,
      agentRunId: sub.id,
      attempts: 1,
    };
  }

  // Tool step.
  const config = ctx.step.config as Record<string, unknown>;
  let args: unknown;
  try {
    args = renderTemplate(config["arguments"] ?? {}, templateCtx);
  } catch (error) {
    const message =
      error instanceof TemplateReferenceError ? error.message : "Tool arguments failed to render.";
    return {
      status: "failed",
      output: null,
      trust: ctx.stepTrust,
      error: message,
      agentRunId: null,
      attempts: 1,
    };
  }
  const toolRows = await database
    .select()
    .from(tools)
    .where(eq(tools.id, config["tool_id"] as string));
  const tool = toolRows[0];
  if (tool === undefined || (tool.teamId !== null && tool.teamId !== ctx.teamId)) {
    return {
      status: "failed",
      output: null,
      trust: ctx.stepTrust,
      error: "Tool step references an unknown tool.",
      agentRunId: null,
      attempts: 1,
    };
  }
  // Mirror the runtime's effective tier, then gate: unattended steps are
  // restricted to read_only and reply (docs/17 T7).
  const effectiveTier = maxRiskTier("read_only", tool.riskTier as RiskTier);
  if (effectiveTier === "write" || effectiveTier === "admin") {
    return {
      status: "denied",
      output: null,
      trust: ctx.stepTrust,
      error: "Unattended steps are restricted to read_only and reply tiers.",
      agentRunId: null,
      attempts: 1,
    };
  }
  let attempts = 0;
  for (let attempt = 0; ; attempt += 1) {
    attempts = attempt + 1;
    try {
      const outcome = await executeToolCall(database, {
        teamId: ctx.teamId,
        actor: { type: ctx.principal.kind, id: ctx.principal.userId ?? ctx.principal.apiKeyId },
        toolId: tool.id,
        args,
        contextTrust: ctx.stepTrust,
        callerPermissions: ctx.triggerPermissions,
        agentRunId: null,
        origin: null,
        destinationPolicy: null,
        proposedDestination: null,
        handlerDeps: runtime.toolHandlerDeps,
        timeoutMs: ctx.timeoutMs,
      });
      if (outcome.decision === "allowed") {
        return {
          status: "succeeded",
          output: outcome.output,
          trust: minTrust(ctx.stepTrust, outcome.outputTrust),
          error: null,
          agentRunId: null,
          attempts,
        };
      }
      // Denials (missing grant, invalid args, destination) are permanent:
      // retrying the same call changes nothing.
      return {
        status: "failed",
        output: null,
        trust: ctx.stepTrust,
        error: `Tool call ${outcome.decision}: ${outcome.reason}.`,
        agentRunId: null,
        attempts,
      };
    } catch (error) {
      const retryable = error instanceof AppError && error.code === "TOOL_EXECUTION_FAILED";
      if (!retryable || attempt >= ctx.retryCount) {
        const message =
          error instanceof AppError ? `${error.code}: ${error.message}` : "Tool step threw.";
        return {
          status: "failed",
          output: null,
          trust: ctx.stepTrust,
          error: message,
          agentRunId: null,
          attempts,
        };
      }
      await (runtime.sleep ?? defaultSleep)(backoffMs(attempt + 1));
    }
  }
}

/**
 * Trigger execution of the pinned current version, synchronously and
 * linearly. Steps run in position order; each step inherits the minimum
 * trust of the run input and every upstream step that fed it (docs/17 T8),
 * and trust never increases. Queue dispatch for long-running automation is
 * a follow-up; this path bounds work with per-step timeouts instead.
 */
export async function startWorkflowRun(
  database: AnyDb,
  runtime: WorkflowRuntimeDeps,
  input: StartWorkflowRunInput,
): Promise<{ runId: string; status: string; traceId: string }> {
  const workflow = await requireWorkflow(database, input.teamId, input.workflowId);
  if (workflow.status !== "active") {
    throw badRequest("WORKFLOW_NOT_ACTIVE", "Only active workflows can start runs.");
  }
  if (workflow.currentVersionId === null) {
    throw badRequest("NO_CURRENT_VERSION", "The workflow has no published current version.");
  }
  const versionRows = await database
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.id, workflow.currentVersionId),
        eq(workflowVersions.teamId, input.teamId),
      ),
    );
  const version = versionRows[0];
  if (version === undefined) throw badRequest("NO_CURRENT_VERSION", "The current version is gone.");
  const stepRows = await database
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.workflowVersionId, version.id));
  const steps = stepRows.sort((a, b) => a.position - b.position);

  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    const existing = await findExistingRun(
      database,
      input.teamId,
      input.workflowId,
      input.idempotencyKey,
    );
    if (existing !== undefined) {
      const summary = toRunSummary(existing);
      return { runId: summary.runId, status: summary.status, traceId: summary.traceId ?? "" };
    }
  }

  const settings = (version.settings ?? {}) as { retry_count?: unknown; timeout_seconds?: unknown };
  const retryCount =
    typeof settings["retry_count"] === "number"
      ? Math.min(Math.max(Math.floor(settings["retry_count"]), 0), MAX_RETRIES)
      : 0;
  const timeoutMs =
    (typeof settings["timeout_seconds"] === "number"
      ? settings["timeout_seconds"]
      : DEFAULT_TIMEOUT_SECONDS) * 1000;

  const runId = randomUUID();
  const traceId = input.traceId ?? newTraceId();
  // Nothing legitimately starts a workflow at trusted trust: manual triggers
  // carry the caller's ingress label (user_input at most), and every other
  // trigger path is untrusted. Fail closed rather than threading a trusted
  // label into an unattended run.
  const ingressTrust: "user_input" | "untrusted" =
    input.principal.ingressTrust === "user_input" ? "user_input" : "untrusted";
  const runInput = input.input ?? {};
  const membership = input.principal.memberships.find((m) => m.teamId === input.teamId);
  const triggerPermissions = membership ? membership.permissions : [];
  try {
    await database.insert(workflowRuns).values({
      id: runId,
      teamId: input.teamId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      status: "running",
      input: runInput as Record<string, unknown>,
      contextTrustLevel: ingressTrust,
      idempotencyKey: input.idempotencyKey ?? null,
      traceId,
    });
  } catch (error) {
    if (
      input.idempotencyKey !== undefined &&
      input.idempotencyKey !== null &&
      isUniqueViolation(error)
    ) {
      const existing = await findExistingRun(
        database,
        input.teamId,
        input.workflowId,
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
    action: "workflow.run.start",
    resourceType: "workflow_run",
    resourceId: runId,
    outcome: "allowed",
    metadata: { workflow_id: workflow.id, version_id: version.id },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    traceId,
  });

  let runningTrust: ContextTrustLevel = ingressTrust;
  const outputs: Record<string, unknown> = {};
  let firstError: string | null = null;
  let runStatus: "succeeded" | "failed" | "denied" = "succeeded";

  for (const step of steps) {
    const stepTrust = runningTrust;
    const stepRunId = randomUUID();
    await database.insert(workflowStepRuns).values({
      id: stepRunId,
      teamId: input.teamId,
      workflowRunId: runId,
      workflowStepId: step.id,
      status: "running",
      contextTrustLevel: stepTrust,
      input: { config: step.config } as Record<string, unknown>,
      startedAt: new Date(),
    });

    const outcome = await executeStep(database, runtime, {
      teamId: input.teamId,
      runId,
      step,
      stepTrust,
      stepInput: { outputs, input: runInput },
      triggerPermissions,
      principal: input.principal,
      retryCount,
      timeoutMs,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    runningTrust = minTrust(runningTrust, outcome.trust);
    if (outcome.status === "succeeded") outputs[step.stepKey] = outcome.output;
    await database
      .update(workflowStepRuns)
      .set({
        status: outcome.status,
        attempt: outcome.attempts,
        contextTrustLevel: outcome.trust,
        output: (outcome.output ?? null) as Record<string, unknown> | null,
        agentRunId: outcome.agentRunId,
        error: outcome.error,
        completedAt: new Date(),
      })
      .where(eq(workflowStepRuns.id, stepRunId));

    if (outcome.status !== "succeeded") {
      if (firstError === null) firstError = outcome.error ?? `${step.stepKey} ${outcome.status}.`;
      // First failure stops the run, so runStatus is still "succeeded" here.
      runStatus = outcome.status === "denied" ? "denied" : "failed";
      break;
    }
  }

  const completedAt = new Date();
  await database
    .update(workflowRuns)
    .set({
      status: runStatus,
      contextTrustLevel: runningTrust,
      error: firstError,
      completedAt,
    })
    .where(eq(workflowRuns.id, runId));
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "workflow",
    actorId: null,
    action: "workflow.run.complete",
    resourceType: "workflow_run",
    resourceId: runId,
    outcome: "allowed",
    reason: runStatus === "succeeded" ? null : runStatus,
    metadata: { status: runStatus, version_id: version.id },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    traceId,
  });
  return { runId, status: runStatus, traceId };
}

export async function listWorkflowRuns(
  database: AnyDb,
  teamId: string,
  workflowId: string,
): Promise<unknown[]> {
  await requireWorkflow(database, teamId, workflowId);
  const rows = await database
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.teamId, teamId)));
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      workflow_version_id: r.workflowVersionId,
      status: r.status,
      trace_id: r.traceId,
      created_at: r.createdAt.toISOString(),
      completed_at: r.completedAt ? r.completedAt.toISOString() : null,
    }));
}

export async function getWorkflowRun(
  database: AnyDb,
  teamId: string,
  workflowId: string,
  runId: string,
): Promise<unknown> {
  await requireWorkflow(database, teamId, workflowId);
  const runRows = await database
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.teamId, teamId),
      ),
    );
  const run = runRows[0];
  if (run === undefined) throw notFound("Workflow run");
  const stepRows = await database
    .select({
      run: workflowStepRuns,
      stepKey: workflowSteps.stepKey,
      kind: workflowSteps.kind,
    })
    .from(workflowStepRuns)
    .leftJoin(workflowSteps, eq(workflowStepRuns.workflowStepId, workflowSteps.id))
    .where(eq(workflowStepRuns.workflowRunId, runId));
  return {
    id: run.id,
    workflow_version_id: run.workflowVersionId,
    status: run.status,
    input: run.input,
    context_trust_level: run.contextTrustLevel,
    error: run.error,
    trace_id: run.traceId,
    created_at: run.createdAt.toISOString(),
    completed_at: run.completedAt ? run.completedAt.toISOString() : null,
    steps: stepRows.map((r) => ({
      step_key: r.stepKey,
      kind: r.kind,
      status: r.run.status,
      attempt: r.run.attempt,
      context_trust_level: r.run.contextTrustLevel,
      agent_run_id: r.run.agentRunId,
      error: r.run.error,
    })),
  };
}
