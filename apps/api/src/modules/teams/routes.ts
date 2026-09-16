import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, notFound, ok } from "../../lib/http.js";
import { authenticate, requirePermission, requireUser, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import {
  addMember,
  createTeam,
  getTeam,
  listMembers,
  removeMember,
  updateMemberRole,
  updateTeam,
} from "./service.js";

const CreateTeamBody = z.object({ name: z.string().min(1).max(200) });
const UpdateTeamBody = z
  .object({ name: z.string().min(1).max(200).optional(), status: z.string().optional() })
  .refine((b) => b.name !== undefined || b.status !== undefined, {
    message: "Nothing to update.",
  });
const AddMemberBody = z.object({ user_id: z.string().uuid(), role_id: z.string().uuid() });
const UpdateMemberBody = z.object({ role_id: z.string().uuid() });

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

export async function teamRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();

  app.post("/teams", { preHandler: [auth, requireUser()] }, async (request, reply) => {
    const body = parseBody(CreateTeamBody, request.body);
    const team = await createTeam(deps.db, {
      name: body.name,
      // requireUser guarantees a user principal.
      ownerId: request.principal.userId as string,
      ...meta(request),
    });
    return ok(reply, team);
  });

  app.get("/teams/:teamId", { preHandler: [auth, scope] }, async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    const team = await getTeam(deps.db, teamId);
    if (team === null) throw notFound("Team");
    return ok(reply, team);
  });

  app.patch(
    "/teams/:teamId",
    { preHandler: [auth, scope, requirePermission("team.manage")] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(UpdateTeamBody, request.body);
      await updateTeam(deps.db, {
        teamId,
        ...body,
        actorId: request.principal.userId as string,
        ...meta(request),
      });
      return ok(reply, await getTeam(deps.db, teamId));
    },
  );

  app.get("/teams/:teamId/members", { preHandler: [auth, scope] }, async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    return ok(reply, { members: await listMembers(deps.db, teamId) });
  });

  app.post(
    "/teams/:teamId/members",
    { preHandler: [auth, scope, requirePermission("member.invite")] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(AddMemberBody, request.body);
      await addMember(deps.db, {
        teamId,
        userId: body.user_id,
        roleId: body.role_id,
        actorId: request.principal.userId as string,
        ...meta(request),
      });
      return ok(reply, {});
    },
  );

  app.delete(
    "/teams/:teamId/members/:userId",
    { preHandler: [auth, scope, requirePermission("member.remove")] },
    async (request, reply) => {
      const { teamId, userId } = request.params as { teamId: string; userId: string };
      await removeMember(deps.db, {
        teamId,
        userId,
        actorId: request.principal.userId as string,
        ...meta(request),
      });
      return ok(reply, {});
    },
  );

  app.patch(
    "/teams/:teamId/members/:userId",
    { preHandler: [auth, scope, requirePermission("team.manage")] },
    async (request, reply) => {
      const { teamId, userId } = request.params as { teamId: string; userId: string };
      const body = parseBody(UpdateMemberBody, request.body);
      await updateMemberRole(deps.db, {
        teamId,
        userId,
        roleId: body.role_id,
        actorId: request.principal.userId as string,
        ...meta(request),
      });
      return ok(reply, {});
    },
  );

  app.get("/teams/:teamId/permissions", { preHandler: [auth, scope] }, async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    const grant = request.principal.memberships.find((m) => m.teamId === teamId);
    return ok(reply, { permissions: grant ? grant.permissions : [] });
  });
}
