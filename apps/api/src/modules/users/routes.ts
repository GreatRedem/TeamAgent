import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { users } from "../../db/schema/index.js";
import { AppError, badRequest, ok } from "../../lib/http.js";
import { authenticate } from "../auth/guards.js";
import { loadUserContext } from "../auth/principal.js";
import type { ApiDeps } from "../deps.js";

const UpdateUserBody = z.object({ displayName: z.string().min(1).max(100) });

export async function userRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });

  /** Users are readable only by themselves: no cross-user enumeration. */
  function selfOnly(request: { principal: { userId: string | null }; params: unknown }): string {
    const { id } = request.params as { id: string };
    if (request.principal.userId === null || request.principal.userId !== id) {
      throw new AppError("NOT_FOUND", 404, "User not found.");
    }
    return id;
  }

  app.get("/users/:id", { preHandler: [auth] }, async (request, reply) => {
    const id = selfOnly(request);
    const context = await loadUserContext(deps.db, id);
    if (context === null) throw new AppError("NOT_FOUND", 404, "User not found.");
    return ok(reply, context);
  });

  app.patch("/users/:id", { preHandler: [auth] }, async (request, reply) => {
    const id = selfOnly(request);
    let body: z.infer<typeof UpdateUserBody>;
    try {
      body = UpdateUserBody.parse(request.body);
    } catch (error) {
      if (error instanceof z.ZodError)
        throw badRequest("INVALID_INPUT", "The request body is invalid.");
      throw error;
    }
    await deps.db.update(users).set({ displayName: body.displayName }).where(eq(users.id, id));
    return ok(reply, await loadUserContext(deps.db, id));
  });

  app.get("/users/:id/teams", { preHandler: [auth] }, async (request, reply) => {
    const id = selfOnly(request);
    const context = await loadUserContext(deps.db, id);
    if (context === null) throw new AppError("NOT_FOUND", 404, "User not found.");
    return ok(reply, { teams: context.teams });
  });
}
