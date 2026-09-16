import type { FastifyInstance } from "fastify";
import { fail } from "../lib/http.js";
import { apiKeyRoutes } from "./api-keys/routes.js";
import { authRoutes } from "./auth/routes.js";
import type { ApiDeps } from "./deps.js";
import { sourceRoutes } from "./sources/routes.js";
import { teamRoutes } from "./teams/routes.js";
import { toolRoutes } from "./tools/routes.js";
import { userRoutes } from "./users/routes.js";

export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  app.setErrorHandler((error, _request, reply) => fail(reply, error));

  // Preserve the default JSON semantics and additionally stash the raw body:
  // webhook HMAC verification (T7) must cover the exact received bytes.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    (request as unknown as { rawBody: string }).rawBody = body as string;
    try {
      done(null, JSON.parse(body as string));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await authRoutes(app, deps);
  await teamRoutes(app, deps);
  await apiKeyRoutes(app, deps);
  await sourceRoutes(app, deps);
  await toolRoutes(app, deps);
  await userRoutes(app, deps);
}
