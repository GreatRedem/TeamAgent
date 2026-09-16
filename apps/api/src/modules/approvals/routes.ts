import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, ok } from "../../lib/http.js";
import { authenticate, requirePermission, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import { approveApproval, getApproval, listApprovals, rejectApproval } from "./service.js";

const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
const TRUST_LEVELS = ["trusted", "user_input", "untrusted"] as const;

const ListQuery = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
  agent_id: z.string().uuid().optional(),
  context_trust_level: z.enum(TRUST_LEVELS).optional(),
});
const ApproveBody = z.object({ note: z.string().max(2000).optional() });
const RejectBody = z.object({ reason: z.string().max(2000).optional() });

function parseQuery(value: unknown): {
  status?: string;
  agent_id?: string;
  context_trust_level?: string;
} {
  try {
    return ListQuery.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw badRequest("INVALID_INPUT", "The query string is invalid.", {
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    throw error;
  }
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body ?? {});
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw badRequest("INVALID_INPUT", "The request body is invalid.", {
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    throw error;
  }
}

function meta(request: { ip: string; headers: Record<string, unknown> }): {
  ip: string;
  userAgent: string | null;
} {
  const userAgent = request.headers["user-agent"];
  return { ip: request.ip, userAgent: typeof userAgent === "string" ? userAgent : null };
}

export async function approvalRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();
  const decide = requirePermission("approval.decide");

  app.get(
    "/teams/:teamId/approvals",
    { preHandler: [auth, scope, decide] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const query = parseQuery(request.query);
      return ok(reply, {
        approvals: await listApprovals(deps.db, teamId, {
          status: query.status,
          agentId: query.agent_id,
          contextTrustLevel: query.context_trust_level,
        }),
      });
    },
  );

  app.get(
    "/teams/:teamId/approvals/:approvalId",
    { preHandler: [auth, scope, decide] },
    async (request, reply) => {
      const { teamId, approvalId } = request.params as { teamId: string; approvalId: string };
      return ok(reply, await getApproval(deps.db, teamId, approvalId));
    },
  );

  app.post(
    "/teams/:teamId/approvals/:approvalId/approve",
    { preHandler: [auth, scope, decide] },
    async (request, reply) => {
      const { teamId, approvalId } = request.params as { teamId: string; approvalId: string };
      const body = parseBody(ApproveBody, request.body);
      const result = await approveApproval(
        deps.db,
        {
          provider: deps.modelProvider,
          toolHandlerDeps: deps.toolHandlerDeps,
          approvalTtlSeconds: deps.approvalTtlSeconds,
        },
        {
          teamId,
          approvalId,
          note: body.note ?? null,
          actor: {
            kind: request.principal.kind,
            userId: request.principal.userId,
            ...meta(request),
          },
        },
      );
      return ok(reply, { run_id: result.runId, status: result.status, trace_id: result.traceId });
    },
  );

  app.post(
    "/teams/:teamId/approvals/:approvalId/reject",
    { preHandler: [auth, scope, decide] },
    async (request, reply) => {
      const { teamId, approvalId } = request.params as { teamId: string; approvalId: string };
      const body = parseBody(RejectBody, request.body);
      const result = await rejectApproval(deps.db, {
        teamId,
        approvalId,
        reason: body.reason ?? null,
        actor: {
          kind: request.principal.kind,
          userId: request.principal.userId,
          ...meta(request),
        },
      });
      return ok(reply, { run_id: result.runId, status: result.status });
    },
  );
}
