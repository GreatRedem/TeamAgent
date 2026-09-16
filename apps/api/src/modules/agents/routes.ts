import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, ok } from "../../lib/http.js";
import { authenticate, requirePermission, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import {
  createAgent,
  deleteAgent,
  getAgent,
  getGrants,
  listAgents,
  replaceAgentKnowledge,
  replaceAgentPermissions,
  replaceAgentSources,
  replaceAgentTools,
  updateAgent,
} from "./service.js";

const CreateAgentBody = z.object({
  name: z.string().min(1).max(200),
  model_id: z.string().uuid().optional(),
  system_prompt: z.string().max(20000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  budgets: z.record(z.string(), z.unknown()).optional(),
});
const UpdateAgentBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    model_id: z.string().uuid().nullable().optional(),
    system_prompt: z.string().max(20000).nullable().optional(),
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
    budgets: z.record(z.string(), z.unknown()).nullable().optional(),
    status: z.string().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update." });
const PermissionsBody = z.object({ permission_ids: z.array(z.string().uuid()).max(200) });
const ToolsBody = z.object({ tool_ids: z.array(z.string().uuid()).max(200) });
const KnowledgeBody = z.object({ knowledge_base_ids: z.array(z.string().uuid()).max(200) });
const SourcesBody = z.object({
  sources: z
    .array(
      z.object({
        source_connection_id: z.string().uuid(),
        can_reply: z.boolean().optional(),
        can_initiate: z.boolean().optional(),
        allowed_destinations: z.array(z.string().max(500)).max(200).optional(),
      }),
    )
    .max(100),
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

export async function agentRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();
  const use = requirePermission("agent.use");
  const create = requirePermission("agent.create");
  const edit = requirePermission("agent.edit");
  const remove = requirePermission("agent.delete");

  app.post(
    "/teams/:teamId/agents",
    { preHandler: [auth, scope, create] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(CreateAgentBody, request.body);
      const created = await createAgent(deps.db, {
        teamId,
        name: body.name,
        modelId: body.model_id ?? null,
        systemPrompt: body.system_prompt ?? null,
        settings: (body.settings ?? null) as Record<string, unknown> | null,
        budgets: (body.budgets ?? null) as Record<string, unknown> | null,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, { id: created.id });
    },
  );

  app.get("/teams/:teamId/agents", { preHandler: [auth, scope, use] }, async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    return ok(reply, { agents: await listAgents(deps.db, teamId) });
  });

  app.get(
    "/teams/:teamId/agents/:agentId",
    { preHandler: [auth, scope, use] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      return ok(reply, await getAgent(deps.db, teamId, agentId));
    },
  );

  app.patch(
    "/teams/:teamId/agents/:agentId",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      const body = parseBody(UpdateAgentBody, request.body);
      await updateAgent(deps.db, {
        teamId,
        agentId,
        name: body.name,
        modelId: body.model_id,
        systemPrompt: body.system_prompt,
        settings: (body.settings ?? undefined) as Record<string, unknown> | null | undefined,
        budgets: (body.budgets ?? undefined) as Record<string, unknown> | null | undefined,
        status: body.status,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, await getAgent(deps.db, teamId, agentId));
    },
  );

  app.delete(
    "/teams/:teamId/agents/:agentId",
    { preHandler: [auth, scope, remove] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      await deleteAgent(deps.db, {
        teamId,
        agentId,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, {});
    },
  );

  app.get(
    "/teams/:teamId/agents/:agentId/grants",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      return ok(reply, await getGrants(deps.db, teamId, agentId));
    },
  );

  app.put(
    "/teams/:teamId/agents/:agentId/permissions",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      const body = parseBody(PermissionsBody, request.body);
      await replaceAgentPermissions(deps.db, {
        teamId,
        agentId,
        permissionIds: body.permission_ids,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, await getGrants(deps.db, teamId, agentId));
    },
  );

  app.put(
    "/teams/:teamId/agents/:agentId/tools",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      const body = parseBody(ToolsBody, request.body);
      await replaceAgentTools(deps.db, {
        teamId,
        agentId,
        toolIds: body.tool_ids,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, await getGrants(deps.db, teamId, agentId));
    },
  );

  app.put(
    "/teams/:teamId/agents/:agentId/knowledge-bases",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      const body = parseBody(KnowledgeBody, request.body);
      await replaceAgentKnowledge(deps.db, {
        teamId,
        agentId,
        knowledgeBaseIds: body.knowledge_base_ids,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, await getGrants(deps.db, teamId, agentId));
    },
  );

  app.put(
    "/teams/:teamId/agents/:agentId/sources",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, agentId } = request.params as { teamId: string; agentId: string };
      const body = parseBody(SourcesBody, request.body);
      await replaceAgentSources(deps.db, {
        teamId,
        agentId,
        sources: body.sources.map((s) => ({
          sourceConnectionId: s.source_connection_id,
          canReply: s.can_reply,
          canInitiate: s.can_initiate,
          allowedDestinations: s.allowed_destinations,
        })),
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, await getGrants(deps.db, teamId, agentId));
    },
  );
}
