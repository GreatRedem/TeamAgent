import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  apiKeys,
  permissions,
  rolePermissions,
  roles,
  teamMembers,
  teams,
  userIdentities,
  userPermissionGrants,
  users,
} from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { hashToken, verifyAccessToken } from "./tokens.js";

export interface TeamGrant {
  teamId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface Principal {
  kind: "user" | "api_key";
  /** Set for sessions and user_input-bound keys; null for default keys. */
  userId: string | null;
  apiKeyId: string | null;
  /** Team scope for default (untrusted) machine keys. */
  keyTeamId: string | null;
  /** The ingress trust label for anything this principal submits (T16). */
  ingressTrust: "user_input" | "untrusted";
  memberships: TeamGrant[];
}

export interface UserContext {
  user: { id: string; email: string | null; displayName: string | null; tokenVersion: number };
  identities: { provider: string; providerUserId: string; chainId: number | null }[];
  teams: { id: string; name: string; role: string }[];
}

/**
 * Identity only in, permissions resolved now. A removed member keeps no
 * access past this call — nothing is cached and nothing rides in the token.
 */
export async function resolvePrincipal(
  database: AnyDb,
  jwtSecret: string,
  authorization: string | undefined,
  now: Date = new Date(),
): Promise<Principal | null> {
  if (authorization === undefined || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (token.length === 0) return null;

  const session = await resolveSession(database, jwtSecret, token, now).catch(() => null);
  if (session !== null) return session;
  return resolveApiKey(database, token, now).catch(() => null);
}

async function resolveSession(
  database: AnyDb,
  jwtSecret: string,
  token: string,
  now: Date,
): Promise<Principal | null> {
  let claims;
  try {
    claims = verifyAccessToken(jwtSecret, token);
  } catch {
    return null;
  }
  const userRows = await database.select().from(users).where(eq(users.id, claims.sub));
  const user = userRows[0];
  // token_version makes global revocation immediate (docs/20).
  if (user === undefined || user.tokenVersion !== claims.ver) return null;
  return {
    kind: "user",
    userId: user.id,
    apiKeyId: null,
    keyTeamId: null,
    ingressTrust: "user_input",
    memberships: await loadMemberships(database, user.id, now),
  };
}

async function resolveApiKey(database: AnyDb, token: string, now: Date): Promise<Principal | null> {
  if (!token.startsWith("nk_")) return null;
  const rows = await database
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashToken(token)));
  const key = rows[0];
  if (key === undefined) return null;
  if (key.revokedAt !== null) return null;
  if (key.expiresAt !== null && key.expiresAt.getTime() <= now.getTime()) return null;

  if (key.trustCeiling === "user_input") {
    // Bounded by the bound user's own grants; an unbound or non-member key
    // resolves to nothing rather than to ambient authority (T16).
    if (key.boundUserId === null) return null;
    const memberships = await loadMemberships(database, key.boundUserId, now);
    if (!memberships.some((m) => m.teamId === key.teamId)) return null;
    return {
      kind: "api_key",
      userId: key.boundUserId,
      apiKeyId: key.id,
      keyTeamId: key.teamId,
      ingressTrust: "user_input",
      memberships,
    };
  }
  return {
    kind: "api_key",
    userId: null,
    apiKeyId: key.id,
    keyTeamId: key.teamId,
    ingressTrust: "untrusted",
    memberships: [],
  };
}

async function loadMemberships(database: AnyDb, userId: string, now: Date): Promise<TeamGrant[]> {
  const memberships = await database
    .select({
      teamId: teamMembers.teamId,
      roleId: teamMembers.roleId,
      roleName: roles.name,
    })
    .from(teamMembers)
    .innerJoin(roles, eq(teamMembers.roleId, roles.id))
    .where(eq(teamMembers.userId, userId));

  const grants: TeamGrant[] = [];
  for (const m of memberships) {
    const permissionNames = new Set<string>();

    const roleRows = await database
      .select({ name: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, m.roleId));
    for (const r of roleRows) permissionNames.add(r.name);

    // Direct grants: unexpired, unscoped (team-wide) or scoped to this team.
    const directRows = await database
      .select({
        name: permissions.name,
        scopeType: userPermissionGrants.scopeType,
        scopeId: userPermissionGrants.scopeId,
      })
      .from(userPermissionGrants)
      .innerJoin(permissions, eq(userPermissionGrants.permissionId, permissions.id))
      .where(
        and(
          eq(userPermissionGrants.userId, userId),
          eq(userPermissionGrants.teamId, m.teamId),
          or(isNull(userPermissionGrants.expiresAt), gt(userPermissionGrants.expiresAt, now)),
        ),
      );
    for (const r of directRows) {
      if (r.scopeType === null || (r.scopeType === "team" && r.scopeId === m.teamId)) {
        permissionNames.add(r.name);
      }
    }

    grants.push({
      teamId: m.teamId,
      roleId: m.roleId,
      roleName: m.roleName,
      permissions: [...permissionNames].sort(),
    });
  }
  return grants;
}

export async function loadUserContext(
  database: AnyDb,
  userId: string,
): Promise<UserContext | null> {
  const userRows = await database.select().from(users).where(eq(users.id, userId));
  const user = userRows[0];
  if (user === undefined) return null;
  const identityRows = await database
    .select({
      provider: userIdentities.provider,
      providerUserId: userIdentities.providerUserId,
      chainId: userIdentities.chainId,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId));
  const memberships = await loadMemberships(database, userId, new Date());
  const teamNames = new Map<string, string>();
  if (memberships.length > 0) {
    const teamRows = await database.select().from(teams);
    for (const t of teamRows) teamNames.set(t.id, t.name);
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      tokenVersion: user.tokenVersion,
    },
    identities: identityRows,
    teams: memberships.map((m) => ({
      id: m.teamId,
      name: teamNames.get(m.teamId) ?? "",
      role: m.roleName,
    })),
  };
}
