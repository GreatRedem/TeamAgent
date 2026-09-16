import type { FastifyInstance } from "fastify";
import { fail } from "../lib/http.js";
import { apiKeyRoutes } from "./api-keys/routes.js";
import { authRoutes } from "./auth/routes.js";
import type { ApiDeps } from "./deps.js";
import { teamRoutes } from "./teams/routes.js";
import { userRoutes } from "./users/routes.js";

export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  app.setErrorHandler((error, _request, reply) => fail(reply, error));
  await authRoutes(app, deps);
  await teamRoutes(app, deps);
  await apiKeyRoutes(app, deps);
  await userRoutes(app, deps);
}
