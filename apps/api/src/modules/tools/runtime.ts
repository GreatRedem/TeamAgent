import { randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { toolCalls, tools } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { AppError, notFound } from "../../lib/http.js";
import {
  decideCapability,
  maxRiskTier,
  type ContextTrustLevel,
  type RiskTier,
} from "../../runtime/policy/capability.js";
import { resolveDestination } from "./destinations.js";
import { incrementMetric } from "../../observability/metrics.js";
import { defaultToolHandlerDeps, getBuiltinTool, type ToolHandlerDeps } from "./registry.js";
import { validateToolArguments } from "./validation.js";

export interface ToolExecutionRequest {
  teamId: string;
  actor: { type: "user" | "api_key"; id: string | null };
  /** Database row id of the tool (system or team tool). */
  toolId: string;
  args: unknown;
  contextTrust: ContextTrustLevel;
  /** Resolved grants of the invoking principal (human now, agent in Phase 4). */
  callerPermissions: string[];
  /**
   * Resolved grants of the requesting human, for the `user_input` x `write`
   * cell. Set on the agent path (the run carries whose message started it);
   * absent on the direct human path, where the caller acts for themselves.
   */
  onBehalfOfPermissions?: string[];
  /** Null for direct human execution; set for agent-run tool calls. */
  agentRunId?: string | null;
  origin?: string | null;
  /**
   * Allowlist policy for egress tools. Absent on the direct human path
   * (the human acts for themselves; SSRF controls still apply in-handler).
   * Required on the agent path, where the model proposes destinations.
   */
  destinationPolicy?: { allowedDestinations: string[]; canInitiate: boolean } | null;
  proposedDestination?: string | null;
  handlerDeps?: Partial<ToolHandlerDeps>;
  signal?: AbortSignal;
  timeoutMs?: number;
  ip?: string | null;
  /**
   * Set when a human approved exactly this call. Skips the capability
   * decision — the approval IS the decision — but keeps everything else:
   * argument validation, destination re-resolution against current grants,
   * and the before/after tool_calls record. The approval grants one
   * execution, not a trust elevation and not a policy bypass.
   */
  preAuthorized?: { approvalId: string };
}

export type ToolExecutionOutcome =
  | { decision: "allowed"; toolCallId: string; output: unknown; outputTrust: "untrusted" }
  | { decision: "denied" | "approval_required"; toolCallId: string; reason: string };

const RUNTIME_TIMEOUT_MS = 30_000;

/**
 * The policy decision point lives here, immediately before execution
 * (docs/17 runtime requirements). tool_calls rows are written BEFORE
 * execution and updated after — denied and pending attempts are recorded,
 * not just successful ones (C11).
 */
export async function executeToolCall(
  database: AnyDb,
  request: ToolExecutionRequest,
): Promise<ToolExecutionOutcome> {
  const rows = await database
    .select()
    .from(tools)
    .where(
      and(eq(tools.id, request.toolId), or(eq(tools.teamId, request.teamId), isNull(tools.teamId))),
    );
  const tool = rows[0];
  if (tool === undefined) throw notFound("Tool");

  const definition = getBuiltinTool(tool.name);
  if (definition === undefined) {
    throw new AppError("TOOL_MISCONFIGURED", 500, `Tool ${tool.name} has no registered handler.`);
  }

  const agentHasGrant =
    request.callerPermissions.includes("tool.execute") &&
    request.callerPermissions.includes(definition.requiredPermission);
  const effectiveTier = maxRiskTier("read_only", tool.riskTier as RiskTier);
  const behalfOfGrant =
    request.onBehalfOfPermissions === undefined
      ? agentHasGrant
      : request.onBehalfOfPermissions.includes(definition.requiredPermission);
  // A human approval replaces the matrix cell for this call only. It is
  // evaluated here, at the boundary, so an approval can never be mistaken
  // for a standing grant anywhere else.
  const verdict =
    request.preAuthorized === undefined
      ? decideCapability({
          contextTrust: request.contextTrust,
          riskTier: effectiveTier,
          agentHasGrant,
          // Direct human callers act for themselves; the agent path passes the
          // interactive user's grants separately so the `user_input` x `write`
          // cell resolves against the human, never the agent alone.
          requestingUserHasGrant: behalfOfGrant,
        })
      : { decision: "allowed" as const, reason: "human-approval-granted" };

  const toolCallId = randomUUID();
  await database.insert(toolCalls).values({
    id: toolCallId,
    teamId: request.teamId,
    agentRunId: request.agentRunId ?? null,
    toolId: tool.id,
    toolName: tool.name,
    arguments: (request.args ?? null) as Record<string, unknown> | null,
    contextTrustLevel: request.contextTrust,
    riskTier: effectiveTier,
    decision: verdict.decision,
    decisionReason: verdict.reason,
  });

  async function finalize(
    patch: Partial<{
      result: unknown;
      error: string | null;
      decision: string;
      decisionReason: string;
      resolvedDestination: string | null;
    }>,
  ): Promise<void> {
    await database
      .update(toolCalls)
      .set({
        result: (patch.result ?? null) as Record<string, unknown> | null,
        error: patch.error ?? null,
        decision: patch.decision ?? verdict.decision,
        decisionReason: patch.decisionReason ?? verdict.reason,
        resolvedDestination: patch.resolvedDestination ?? null,
        completedAt: new Date(),
      })
      .where(eq(toolCalls.id, toolCallId));
  }

  if (verdict.decision !== "allowed") {
    // docs/22 security signals: the denied rate is the observable signature
    // of a misconfigured agent or an active injection attempt.
    if (verdict.decision === "denied") {
      incrementMetric("tool_calls_denied_total");
    } else if (verdict.decision === "approval_required") {
      incrementMetric("approval_requests_total", { context_trust_level: request.contextTrust });
    }
    await finalize({});
    return { decision: verdict.decision, toolCallId, reason: verdict.reason };
  }

  const validation = validateToolArguments(tool.inputSchema, request.args);
  if (!validation.valid) {
    await finalize({
      decision: "denied",
      decisionReason: "invalid-arguments",
      error: validation.errors.join("; "),
    });
    return { decision: "denied", toolCallId, reason: "invalid-arguments" };
  }

  // Destination resolution (docs/17 C3) applies when the caller proposes a
  // destination. Tools whose addressing is intrinsic to their arguments —
  // a URL to fetch — propose none and are governed by their in-handler
  // controls (C8 SSRF vetting), not by the send-destination allowlist.
  let resolvedDestination: string | null = null;
  if (
    definition.egress &&
    request.destinationPolicy !== undefined &&
    request.destinationPolicy !== null &&
    request.proposedDestination !== undefined &&
    request.proposedDestination !== null
  ) {
    const resolution = resolveDestination({
      proposed: request.proposedDestination,
      allowedDestinations: request.destinationPolicy.allowedDestinations,
      canInitiate: request.destinationPolicy.canInitiate,
      origin: request.origin,
    });
    if (!resolution.allowed) {
      // C3 doing its job: near zero in normal operation.
      incrementMetric("destination_denied_total");
      await finalize({ decision: "denied", decisionReason: resolution.reason });
      return { decision: "denied", toolCallId, reason: resolution.reason };
    }
    resolvedDestination = request.proposedDestination;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? RUNTIME_TIMEOUT_MS);
  const signal = request.signal
    ? AbortSignal.any([request.signal, controller.signal])
    : controller.signal;
  try {
    const output = await definition.execute(request.args as Record<string, unknown>, {
      deps: { ...defaultToolHandlerDeps, ...request.handlerDeps },
      signal,
    });
    await finalize({ result: output as Record<string, unknown>, resolvedDestination });
    // Tool output is always untrusted, unconditionally (docs/17 T4).
    return { decision: "allowed", toolCallId, output, outputTrust: "untrusted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (message.startsWith("SSRF_DENIED")) {
      await finalize({ decision: "denied", decisionReason: "ssrf-denied", error: message });
      return { decision: "denied", toolCallId, reason: "ssrf-denied" };
    }
    await finalize({ error: message });
    throw new AppError("TOOL_EXECUTION_FAILED", 502, `Tool ${tool.name} failed.`);
  } finally {
    clearTimeout(timeout);
  }
}
