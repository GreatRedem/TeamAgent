import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, ok } from "../../lib/http.js";
import { authenticate, requirePermission, requireUser, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import {
  createBase,
  createItem,
  getBase,
  listBases,
  searchKnowledge,
  setItemTrust,
} from "./service.js";

const CreateBaseBody = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
});
const CreateItemBody = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(100_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ingested_from: z.string().min(1).max(2000).optional(),
});
const TrustBody = z.object({ trusted: z.boolean() });
const SearchBody = z.object({
  query: z.string().min(1).max(500),
  knowledge_base_ids: z.array(z.string().uuid()).min(1).max(20),
  limit: z.number().int().min(1).max(20).optional(),
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

function meta(request: { ip: string; headers: Record<string, unknown> }): {
  ip: string;
  userAgent: string | null;
} {
  const userAgent = request.headers["user-agent"];
  return { ip: request.ip, userAgent: typeof userAgent === "string" ? userAgent : null };
}

export async function knowledgeRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();
  const read = requirePermission("knowledge.read");
  const write = requirePermission("knowledge.write");
  const human = requireUser();

  app.post(
    "/teams/:teamId/knowledge",
    { preHandler: [auth, scope, write] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(CreateBaseBody, request.body);
      const created = await createBase(deps.db, {
        teamId,
        name: body.name,
        kind: body.type ?? null,
        description: body.description ?? null,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, { id: created.id });
    },
  );

  app.get(
    "/teams/:teamId/knowledge",
    { preHandler: [auth, scope, read] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      return ok(reply, { knowledge_bases: await listBases(deps.db, teamId) });
    },
  );

  app.get(
    "/teams/:teamId/knowledge/:knowledgeId",
    { preHandler: [auth, scope, read] },
    async (request, reply) => {
      const { teamId, knowledgeId } = request.params as { teamId: string; knowledgeId: string };
      return ok(reply, await getBase(deps.db, teamId, knowledgeId));
    },
  );

  app.post(
    "/teams/:teamId/knowledge/:knowledgeId/items",
    { preHandler: [auth, scope, write] },
    async (request, reply) => {
      const { teamId, knowledgeId } = request.params as { teamId: string; knowledgeId: string };
      const body = parseBody(CreateItemBody, request.body);
      const created = await createItem(deps.db, {
        teamId,
        baseId: knowledgeId,
        title: body.title ?? null,
        content: body.content,
        metadata: (body.metadata ?? null) as Record<string, unknown> | null,
        ingestedFrom: body.ingested_from ?? null,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, { id: created.id, chunk_count: created.chunkCount });
    },
  );

  // Trust is an action a human takes: machine keys without a bound user
  // cannot assert it, or a relay could launder its own input to trusted.
  app.post(
    "/teams/:teamId/knowledge/:knowledgeId/items/:itemId/trust",
    { preHandler: [auth, scope, write, human] },
    async (request, reply) => {
      const { teamId, knowledgeId, itemId } = request.params as {
        teamId: string;
        knowledgeId: string;
        itemId: string;
      };
      const body = parseBody(TrustBody, request.body);
      return ok(
        reply,
        await setItemTrust(deps.db, {
          teamId,
          baseId: knowledgeId,
          itemId,
          trusted: body.trusted,
          actorId: request.principal.userId as string,
          ...meta(request),
        }),
      );
    },
  );

  app.post(
    "/teams/:teamId/knowledge/search",
    { preHandler: [auth, scope, read] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(SearchBody, request.body);
      return ok(reply, {
        results: await searchKnowledge(deps.db, {
          teamId,
          baseIds: body.knowledge_base_ids,
          query: body.query,
          limit: body.limit,
        }),
      });
    },
  );
}
