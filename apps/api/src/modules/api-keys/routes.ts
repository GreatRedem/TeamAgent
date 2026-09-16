import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, ok } from "../../lib/http.js";
import { authenticate, requirePermission, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import { issueApiKey, listApiKeys, revokeApiKey } from "./keys.js";

const IssueKeyBody = z.object({
  name: z.string().min(1).max(200),
  trust_ceiling: z.enum(["untrusted", "user_input"]).optional(),
  bound_user_id: z.string().uuid().optional(),
  expires_at: z.string().datetime().optional(),
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

export async function apiKeyRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();
  const manage = requirePermission("apikey.manage");

  app.post(
    "/teams/:teamId/api-keys",
    { preHandler: [auth, scope, manage] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(IssueKeyBody, request.body);
      const issued = await issueApiKey(deps.db, {
        teamId,
        name: body.name,
        trustCeiling: body.trust_ceiling,
        boundUserId: body.bound_user_id ?? null,
        expiresAt: body.expires_at ? new Date(body.expires_at) : null,
        keyPrefix: deps.keyPrefix,
        actorUserId: request.principal.userId,
        ip: request.ip,
      });
      return ok(reply, issued);
    },
  );

  app.get(
    "/teams/:teamId/api-keys",
    { preHandler: [auth, scope, manage] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      return ok(reply, { keys: await listApiKeys(deps.db, teamId) });
    },
  );

  app.delete(
    "/teams/:teamId/api-keys/:keyId",
    { preHandler: [auth, scope, manage] },
    async (request, reply) => {
      const { teamId, keyId } = request.params as { teamId: string; keyId: string };
      await revokeApiKey(deps.db, {
        teamId,
        keyId,
        actorUserId: request.principal.userId,
        ip: request.ip,
      });
      return ok(reply, {});
    },
  );
}
