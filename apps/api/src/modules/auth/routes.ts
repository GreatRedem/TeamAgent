import type { FastifyInstance } from "fastify";
import { isAddress } from "viem";
import { z } from "zod";
import { AppError, badRequest, ok, rateLimited } from "../../lib/http.js";
import { authenticate } from "./guards.js";
import { issueNonce } from "./nonces.js";
import { loadUserContext } from "./principal.js";
import { logout, refreshSession, verifySignIn } from "./service.js";
import type { ApiDeps } from "../deps.js";

const NonceBody = z.object({ address: z.string().min(1) });
const VerifyBody = z.object({ message: z.string().min(1), signature: z.string().min(1) });
const RefreshBody = z.object({ refreshToken: z.string().min(1) });

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

export async function authRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });

  app.post("/auth/wallet/nonce", async (request, reply) => {
    const body = parseBody(NonceBody, request.body);
    if (!isAddress(body.address)) {
      throw badRequest("INVALID_ADDRESS", "The wallet address is invalid.");
    }
    if (!deps.nonceLimiter.check(`${body.address.toLowerCase()}:${request.ip}`)) {
      throw rateLimited("Too many sign-in attempts. Try again shortly.");
    }
    const issued = await issueNonce(deps.db, {
      address: body.address,
      domain: deps.siwe.domain,
    });
    return ok(reply, { nonce: issued.nonce, expiresAt: issued.expiresAt.toISOString() });
  });

  app.post("/auth/wallet/verify", async (request, reply) => {
    const body = parseBody(VerifyBody, request.body);
    if (!deps.verifyLimiter.check(request.ip)) {
      throw rateLimited("Too many sign-in attempts. Try again shortly.");
    }
    const result = await verifySignIn(deps.db, deps, {
      message: body.message,
      signature: body.signature,
      ip: request.ip,
      userAgent: (request.headers["user-agent"] as string | undefined) ?? null,
    });
    return ok(reply, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = parseBody(RefreshBody, request.body);
    const result = await refreshSession(deps.db, deps, {
      refreshToken: body.refreshToken,
      ip: request.ip,
      userAgent: (request.headers["user-agent"] as string | undefined) ?? null,
    });
    return ok(reply, { accessToken: result.accessToken, refreshToken: result.refreshToken });
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = parseBody(RefreshBody, request.body);
    await logout(deps.db, { refreshToken: body.refreshToken, ip: request.ip });
    return ok(reply, {});
  });

  app.get("/auth/me", { preHandler: [auth] }, async (request, reply) => {
    const userId = request.principal.userId;
    if (userId === null) {
      throw new AppError("FORBIDDEN", 403, "Machine keys have no user profile.");
    }
    const context = await loadUserContext(deps.db, userId);
    if (context === null) {
      throw new AppError("NOT_FOUND", 404, "User not found.");
    }
    return ok(reply, context);
  });
}
