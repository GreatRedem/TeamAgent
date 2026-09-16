import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { sources } from "../../db/schema/index.js";
import { badRequest, notFound, ok } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";
import { authenticate, requirePermission, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import {
  createConnection,
  createSource,
  deleteConnection,
  getSource,
  listConnections,
  listSources,
  updateSource,
} from "./service.js";
import { createSeenCache, envSecretResolver, verifyWebhookIngress } from "./webhook.js";

const CreateSourceBody = z.object({
  type: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  config: z.record(z.string(), z.unknown()).optional(),
  webhook_secret_ref: z.string().min(1).max(200).optional(),
});
const UpdateSourceBody = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.string().optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
});
const CreateConnectionBody = z.object({
  name: z.string().min(1).max(200),
  owner_scope: z.enum(["team", "user"]).optional(),
  user_id: z.string().uuid().optional(),
  credential_ref: z.string().max(500).optional(),
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

export async function sourceRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();
  const seen = createSeenCache(10_000, 10 * 60_000);

  app.post(
    "/teams/:teamId/sources",
    { preHandler: [auth, scope, requirePermission("source.connect")] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(CreateSourceBody, request.body);
      const created = await createSource(deps.db, {
        teamId,
        kind: body.type,
        name: body.name,
        config: (body.config ?? null) as Record<string, unknown> | null,
        webhookSecretRef: body.webhook_secret_ref ?? null,
        actorId: request.principal.userId,
        ip: request.ip,
      });
      return ok(reply, { id: created.id });
    },
  );

  app.get(
    "/teams/:teamId/sources",
    { preHandler: [auth, scope, requirePermission("source.read")] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      return ok(reply, { sources: await listSources(deps.db, teamId) });
    },
  );

  app.get(
    "/teams/:teamId/sources/:sourceId",
    { preHandler: [auth, scope, requirePermission("source.read")] },
    async (request, reply) => {
      const { teamId, sourceId } = request.params as { teamId: string; sourceId: string };
      return ok(reply, await getSource(deps.db, teamId, sourceId));
    },
  );

  app.patch(
    "/teams/:teamId/sources/:sourceId",
    { preHandler: [auth, scope, requirePermission("source.connect")] },
    async (request, reply) => {
      const { teamId, sourceId } = request.params as { teamId: string; sourceId: string };
      const body = parseBody(UpdateSourceBody, request.body);
      await updateSource(deps.db, {
        teamId,
        sourceId,
        ...body,
        config: (body.config ?? undefined) as Record<string, unknown> | undefined,
        actorId: request.principal.userId,
        ip: request.ip,
      });
      return ok(reply, await getSource(deps.db, teamId, sourceId));
    },
  );

  app.post(
    "/teams/:teamId/sources/:sourceId/connections",
    { preHandler: [auth, scope, requirePermission("source.connect")] },
    async (request, reply) => {
      const { teamId, sourceId } = request.params as { teamId: string; sourceId: string };
      const body = parseBody(CreateConnectionBody, request.body);
      const created = await createConnection(deps.db, {
        teamId,
        sourceId,
        name: body.name,
        ownerScope: body.owner_scope,
        userId: body.user_id ?? null,
        credentialRef: body.credential_ref ?? null,
        actorId: request.principal.userId,
        ip: request.ip,
      });
      return ok(reply, { id: created.id });
    },
  );

  app.get(
    "/teams/:teamId/sources/:sourceId/connections",
    { preHandler: [auth, scope, requirePermission("source.read")] },
    async (request, reply) => {
      const { teamId, sourceId } = request.params as { teamId: string; sourceId: string };
      return ok(reply, { connections: await listConnections(deps.db, teamId, sourceId) });
    },
  );

  app.delete(
    "/teams/:teamId/sources/:sourceId/connections/:connectionId",
    { preHandler: [auth, scope, requirePermission("source.disconnect")] },
    async (request, reply) => {
      const { teamId, sourceId, connectionId } = request.params as {
        teamId: string;
        sourceId: string;
        connectionId: string;
      };
      await deleteConnection(deps.db, {
        teamId,
        sourceId,
        connectionId,
        actorId: request.principal.userId,
        ip: request.ip,
      });
      return ok(reply, {});
    },
  );

  /**
   * Unauthenticated by design: the HMAC is the credential (T7). Trigger
   * payloads are always untrusted — the runtime labels them on receipt in
   * Phase 4/6; here ingress is verified and recorded.
   */
  app.post("/teams/:teamId/sources/:sourceId/webhook", async (request, reply) => {
    const { teamId, sourceId } = request.params as { teamId: string; sourceId: string };
    const rawBody = (request as unknown as { rawBody?: unknown }).rawBody;
    if (typeof rawBody !== "string") {
      throw badRequest("INVALID_INPUT", "The webhook body could not be read.");
    }
    const rows = await deps.db
      .select({
        id: sources.id,
        teamId: sources.teamId,
        webhookSecretRef: sources.webhookSecretRef,
      })
      .from(sources)
      .where(and(eq(sources.id, sourceId), eq(sources.teamId, teamId)));
    const source = rows[0];
    if (source === undefined) throw notFound("Source");
    verifyWebhookIngress({
      source,
      rawBody,
      signatureHeader: request.headers["x-webhook-signature"] as string | undefined,
      resolveSecret: envSecretResolver,
      seen,
    });
    await writeAudit(deps.db, {
      teamId,
      actorType: "source",
      actorId: null,
      action: "source.webhook.ingress",
      resourceType: "source",
      resourceId: sourceId,
      outcome: "allowed",
      ipAddress: request.ip,
      userAgent: (request.headers["user-agent"] as string | undefined) ?? null,
    });
    return ok(reply, { received: true });
  });
}
