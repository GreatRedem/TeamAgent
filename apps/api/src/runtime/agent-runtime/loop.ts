import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { agentRuns, approvalRequests, toolCalls } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import type { ContextTrustLevel } from "../policy/capability.js";
import { GatewayError, type GatewayTool, type ModelProvider } from "../model/gateway.js";
import { executeToolCall } from "../../modules/tools/runtime.js";
import type { ToolHandlerDeps } from "../../modules/tools/registry.js";
import { writeAudit } from "../../modules/audit/log.js";
import { assembleMessages, minTrust, type ContextItem } from "./context.js";
import { checkBudgets, type BudgetUsage, type RunBudgets } from "./budgets.js";

export interface LoopTool extends GatewayTool {
  riskTier: string;
}

export interface LoopRequest {
  teamId: string;
  agentRunId: string;
  traceId: string;
  agent: { id: string; name: string };
  model: { id: string; provider: string; name: string; version: string };
  systemPrompt: string | null;
  /** Resolved agent permission names — the grants side of the C2 decision. */
  permissionNames: string[];
  /**
   * Resolved requesting-user permission names for the `user_input` x `write`
   * cell. Empty when the run started on untrusted ingress with no human to
   * resolve against (default API key, webhook): the cell then fails closed.
   */
  requestingUserPermissions: string[];
  tools: LoopTool[];
  destinationPolicy: { allowedDestinations: string[]; canInitiate: boolean };
  /** Opaque conversation identifier for reply-to-origin (C4), if any. */
  origin: string | null;
  ingressTrust: ContextTrustLevel;
  inputMessages: Array<{ role: "user" | "assistant"; content: string }>;
  budgets: RunBudgets;
  actor: { type: "user" | "api_key"; id: string | null };
  ip: string | null;
  userAgent: string | null;
}

export interface LoopDeps {
  db: AnyDb;
  provider: ModelProvider;
  toolHandlerDeps?: Partial<ToolHandlerDeps>;
  approvalTtlSeconds: number;
  now?: () => Date;
}

export interface LoopTranscript extends Array<ContextItem> {}

export interface LoopUsage {
  inputTokens: number;
  outputTokens: number;
}

export type LoopOutcome =
  | { status: "succeeded"; finalText: string; usage: LoopUsage; transcript: LoopTranscript }
  | {
      status: "waiting_for_approval";
      approvalId: string;
      toolCallId: string;
      usage: LoopUsage;
      transcript: LoopTranscript;
    }
  | { status: "budget_exceeded"; reason: string; usage: LoopUsage; transcript: LoopTranscript }
  | { status: "failed"; error: string; usage: LoopUsage; transcript: LoopTranscript };

const TRIGGERING_CONTENT_MAX = 2000;

function lastUserContent(transcript: LoopTranscript): string | null {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const item = transcript[i];
    if (item?.role === "user") return item.content.slice(0, TRIGGERING_CONTENT_MAX);
  }
  return null;
}

/**
 * The agent execution loop (docs/11-runtime.md core flow).
 *
 * The model chooses the tool; the runtime never calls one beforehand.
 * Every tool result re-enters as `untrusted` and can only lower the
 * effective trust. Denials return to the model as structured errors so the
 * agent can explain the refusal instead of looping against it. Budgets are
 * checked before every inference and after every usage report — a runaway
 * loop is a cost incident (docs/17 T12), and the limits are the only thing
 * between an injected agent and an unbounded bill.
 */
export async function executeRunLoop(deps: LoopDeps, request: LoopRequest): Promise<LoopOutcome> {
  const db = deps.db;
  const now = deps.now ?? (() => new Date());
  const usage: LoopUsage = { inputTokens: 0, outputTokens: 0 };
  const budgetUsage: BudgetUsage = {
    modelIterations: 0,
    toolCalls: 0,
    tokensTotal: 0,
    startedAtMs: now().getTime(),
  };
  let trust = request.ingressTrust;
  const transcript: LoopTranscript = request.inputMessages.map((m) => ({
    role: m.role,
    trust: request.ingressTrust,
    origin: `ingress:${request.ingressTrust}`,
    content: m.content,
  }));

  await db
    .update(agentRuns)
    .set({ status: "running", startedAt: now(), contextTrustLevel: trust })
    .where(eq(agentRuns.id, request.agentRunId));

  for (;;) {
    const verdict = checkBudgets(request.budgets, budgetUsage, now().getTime());
    if (verdict !== "ok") {
      return { status: "budget_exceeded", reason: verdict, usage, transcript };
    }

    const messages = assembleMessages(request.systemPrompt, transcript);
    const remainingMs = Math.max(
      1000,
      request.budgets.maxWallClockMs - (now().getTime() - budgetUsage.startedAtMs),
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    let result;
    try {
      result = await deps.provider.invoke({
        model: request.model,
        messages,
        tools: request.tools,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message =
        error instanceof GatewayError
          ? `${error.code}: ${error.message}`
          : `MODEL_PROVIDER_ERROR: ${(error as Error).message}`;
      return { status: "failed", error: message, usage, transcript };
    }
    clearTimeout(timeout);

    budgetUsage.modelIterations += 1;
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;
    budgetUsage.tokensTotal = usage.inputTokens + usage.outputTokens;

    const tokenVerdict = checkBudgets(request.budgets, budgetUsage, now().getTime());
    if (tokenVerdict !== "ok") {
      return { status: "budget_exceeded", reason: tokenVerdict, usage, transcript };
    }

    if (result.toolCall === null) {
      return { status: "succeeded", finalText: result.text ?? "", usage, transcript };
    }

    const requested = result.toolCall;
    if (result.text !== null && result.text !== "") {
      transcript.push({ role: "assistant", trust, origin: "model", content: result.text });
    }

    const granted = request.tools.find((t) => t.id === requested.toolId);
    if (granted === undefined) {
      // The model named something outside its granted set. Recorded as a
      // denial (tool_calls.tool_id is nullable for exactly this), returned
      // to the model as a structured error — never executed.
      const { toolCallId } = await recordUnknownTool(db, request, requested.toolName, trust, now);
      void toolCallId;
      transcript.push({
        role: "tool",
        trust: "untrusted",
        origin: "runtime:policy",
        content: `The tool '${requested.toolName}' is not granted to this agent. Explain that you cannot call it.`,
      });
      continue;
    }

    const outcome = await executeToolCall(db, {
      teamId: request.teamId,
      actor: request.actor,
      toolId: granted.id,
      args: requested.args,
      contextTrust: trust,
      callerPermissions: request.permissionNames,
      onBehalfOfPermissions: request.requestingUserPermissions,
      agentRunId: request.agentRunId,
      origin: request.origin,
      destinationPolicy: request.destinationPolicy,
      proposedDestination: requested.destination,
      handlerDeps: deps.toolHandlerDeps,
    });

    if (outcome.decision === "approval_required") {
      const approvalId = randomUUID();
      const expiresAt = new Date(now().getTime() + deps.approvalTtlSeconds * 1000);
      await db.insert(approvalRequests).values({
        id: approvalId,
        teamId: request.teamId,
        agentRunId: request.agentRunId,
        toolCallId: outcome.toolCallId,
        proposedAction: {
          tool: granted.name,
          risk_tier: granted.riskTier,
          arguments: requested.args,
          resolved_destination: requested.destination,
        } as Record<string, unknown>,
        triggeringContent: lastUserContent(transcript),
        triggeringOrigin: JSON.stringify({
          ingress_trust: request.ingressTrust,
          origin: request.origin,
          actor_type: request.actor.type,
        }),
        status: "pending",
        expiresAt,
      });
      await writeAudit(db, {
        teamId: request.teamId,
        actorType: "agent",
        actorId: request.agent.id,
        action: "agent.run.approval_requested",
        resourceType: "agent_run",
        resourceId: request.agentRunId,
        outcome: "allowed",
        reason: outcome.reason,
        metadata: { approval_id: approvalId, tool: granted.name },
        ipAddress: request.ip,
        userAgent: request.userAgent,
        traceId: request.traceId,
      });
      return {
        status: "waiting_for_approval",
        approvalId,
        toolCallId: outcome.toolCallId,
        usage,
        transcript,
      };
    }

    if (outcome.decision === "allowed") {
      // The result re-enters unconditionally untrusted (docs/17 T4), and
      // trust recomputes downward — it may only decrease.
      budgetUsage.toolCalls += 1;
      trust = minTrust(trust, outcome.outputTrust);
      await db
        .update(agentRuns)
        .set({ contextTrustLevel: trust })
        .where(eq(agentRuns.id, request.agentRunId));
      transcript.push({
        role: "tool",
        trust: "untrusted",
        origin: `tool:${granted.name}`,
        content: JSON.stringify(outcome.output),
      });
      continue;
    }

    if (outcome.decision === "denied") {
      transcript.push({
        role: "tool",
        trust: "untrusted",
        origin: `tool:${granted.name}`,
        content:
          `That call was denied (${outcome.reason}). Do not retry it with different ` +
          `wording; explain the refusal to the user if it matters to their request.`,
      });
      continue;
    }
  }
}

async function recordUnknownTool(
  db: AnyDb,
  request: LoopRequest,
  toolName: string,
  trust: ContextTrustLevel,
  now: () => Date,
): Promise<{ toolCallId: string }> {
  const toolCallId = randomUUID();
  await db.insert(toolCalls).values({
    id: toolCallId,
    teamId: request.teamId,
    agentRunId: request.agentRunId,
    toolId: null,
    toolName: typeof toolName === "string" && toolName.length > 0 ? toolName : "(unnamed)",
    arguments: null,
    contextTrustLevel: trust,
    riskTier: "admin",
    decision: "denied",
    decisionReason: "unknown-tool-to-agent",
    completedAt: now(),
  });
  return { toolCallId };
}

export function summarizeUsage(usage: LoopUsage): Record<string, unknown> {
  return { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens };
}
