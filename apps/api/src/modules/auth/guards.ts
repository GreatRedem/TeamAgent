import type { FastifyReply, FastifyRequest } from "fastify";
import type { AnyDb } from "../../db/db.js";
import { forbidden, notFound, unauthorized } from "../../lib/http.js";
import { incrementMetric } from "../../observability/metrics.js";
import { resolvePrincipal, type Principal } from "./principal.js";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal;
  }
}

export interface GuardDeps {
  db: AnyDb;
  jwtSecret: string;
}

/** Resolves the principal per request. Nothing is cached, ever. */
export function authenticate(deps: GuardDeps) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const principal = await resolvePrincipal(
      deps.db,
      deps.jwtSecret,
      request.headers.authorization,
    );
    if (principal === null) {
      throw unauthorized();
    }
    request.principal = principal;
  };
}

function requestTeamId(request: FastifyRequest): string | null {
  const params = request.params as { teamId?: unknown } | undefined;
  return typeof params?.teamId === "string" ? params.teamId : null;
}

/**
 * Team membership (or the key's own team). A non-member gets NOT_FOUND, not
 * FORBIDDEN, so the API is not an existence oracle.
 */
export function teamScope() {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const teamId = requestTeamId(request);
    if (teamId === null) throw notFound("Team");
    const principal = request.principal;
    const inScope =
      principal.memberships.some((m) => m.teamId === teamId) || principal.keyTeamId === teamId;
    if (!inScope) {
      // docs/22: should be zero — any non-zero value is a bug or a probe.
      incrementMetric("cross_team_access_denied_total");
      throw notFound("Team");
    }
  };
}

/** Permission resolved now, against this team's grant. Must run after teamScope. */
export function requirePermission(name: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const teamId = requestTeamId(request);
    const grant =
      teamId === null ? undefined : request.principal.memberships.find((m) => m.teamId === teamId);
    if (grant === undefined || !grant.permissions.includes(name)) {
      throw forbidden();
    }
  };
}

/** Human-only endpoints (team creation): machine keys have no user. */
export function requireUser() {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.principal.userId === null) {
      throw forbidden("Only a signed-in user can perform this action.");
    }
  };
}
