import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { tools } from "../../db/schema/index.js";
import { badRequest, conflict, notFound, ok } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";
import { authenticate, requirePermission, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import { getBuiltinTool } from "./registry.js";
import { executeToolCall } from "./runtime.js";

const RISK_TIERS = ["read_only", "reply", "write", "admin"] as const;

const RegisterToolBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  risk_tier: z.enum(RISK_TIERS),
  input_schema: z.record(z.string(), z.unknown()).optional(),
});
const ExecuteBody = z.object({
  arguments: z.unknown(),
  proposed_destination: z.string().optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw badRequest("INVALID_INPUT", "The request body is invalid.", {
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    throw error;
  }
}

export async function toolRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();
  const use = requirePermission("tool.execute");
  const manage = requirePermission("tool.manage");

  app.get("/teams/:teamId/tools", { preHandler: [auth, scope, use] }, async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    const rows = await deps.db
      .select()
      .from(tools)
      .where(or(eq(tools.teamId, teamId), isNull(tools.teamId)));
    return ok(reply, {
      tools: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        risk_tier: r.riskTier,
        system: r.teamId === null,
      })),
    });
  });

  app.post(
    "/teams/:teamId/tools",
    { preHandler: [auth, scope, manage] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(RegisterToolBody, request.body);
      const builtin = getBuiltinTool(body.name);
      if (builtin === undefined) {
        throw badRequest("UNKNOWN_TOOL_HANDLER", `No registered handler for tool ${body.name}.`);
      }
      const existing = await deps.db
        .select()
        .from(tools)
        .where(and(eq(tools.teamId, teamId), eq(tools.name, body.name)));
      if (existing.length > 0) {
        throw conflict("TOOL_EXISTS", "This team already has a tool with that name.");
      }
      const id = randomUUID();
      await deps.db.insert(tools).values({
        id,
        teamId,
        name: body.name,
        description: body.description ?? builtin.description,
        // No default, by design: every tool carries an explicit tier (C2).
        riskTier: body.risk_tier,
        inputSchema: (body.input_schema ?? builtin.inputSchema) as Record<string, unknown>,
      });
      await writeAudit(deps.db, {
        teamId,
        actorType: request.principal.userId === null ? "api_key" : "user",
        actorId: request.principal.userId,
        action: "tool.register",
        resourceType: "tool",
        resourceId: id,
        outcome: "allowed",
        metadata: { name: body.name, risk_tier: body.risk_tier },
        ipAddress: request.ip,
      });
      return ok(reply, { id });
    },
  );

  app.delete(
    "/teams/:teamId/tools/:toolId",
    { preHandler: [auth, scope, manage] },
    async (request, reply) => {
      const { teamId, toolId } = request.params as { teamId: string; toolId: string };
      const rows = await deps.db
        .select()
        .from(tools)
        .where(and(eq(tools.id, toolId), eq(tools.teamId, teamId)));
      if (rows.length === 0) throw notFound("Tool");
      await deps.db.delete(tools).where(eq(tools.id, toolId));
      await writeAudit(deps.db, {
        teamId,
        actorType: request.principal.userId === null ? "api_key" : "user",
        actorId: request.principal.userId,
        action: "tool.remove",
        resourceType: "tool",
        resourceId: toolId,
        outcome: "allowed",
        ipAddress: request.ip,
      });
      return ok(reply, {});
    },
  );

  /**
   * Direct human execution (docs/15-api.md section 9). Still goes through
   * the policy decision point with a context trust level like any other
   * call: session callers are user_input, key callers carry the key's
   * ceiling. Recorded in tool_calls exactly as a model-requested call.
   */
  app.post(
    "/teams/:teamId/tools/:toolId/execute",
    { preHandler: [auth, scope, use] },
    async (request, reply) => {
      const { teamId, toolId } = request.params as { teamId: string; toolId: string };
      const body = parseBody(ExecuteBody, request.body);
      const grant = request.principal.memberships.find((m) => m.teamId === teamId);
      const outcome = await executeToolCall(deps.db, {
        teamId,
        actor: {
          type: request.principal.kind,
          id: request.principal.userId ?? request.principal.apiKeyId,
        },
        toolId,
        args: body.arguments,
        contextTrust: request.principal.ingressTrust,
        callerPermissions: grant ? grant.permissions : [],
        proposedDestination: body.proposed_destination ?? null,
        handlerDeps: deps.toolHandlerDeps,
        ip: request.ip,
      });
      if (outcome.decision === "allowed") {
        return ok(reply, { tool_call_id: outcome.toolCallId, output: outcome.output });
      }
      if (outcome.decision === "approval_required") {
        return reply.code(202).send({
          success: true,
          data: {
            tool_call_id: outcome.toolCallId,
            decision: outcome.decision,
            reason: outcome.reason,
          },
          error: null,
          request_id: randomUUID(),
        });
      }
      return reply.code(403).send({
        success: false,
        data: { tool_call_id: outcome.toolCallId, decision: outcome.decision },
        error: {
          code: "TOOL_DENIED",
          message: `Tool execution denied: ${outcome.reason}.`,
          details: {},
        },
        request_id: randomUUID(),
      });
    },
  );
}
