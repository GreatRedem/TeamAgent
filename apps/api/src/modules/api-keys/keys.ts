import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { apiKeys, teamMembers } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { badRequest, notFound } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";
import { hashToken } from "../auth/tokens.js";
import { incrementMetric } from "../../observability/metrics.js";

export type KeyCeiling = "untrusted" | "user_input";

export interface IssueKeyInput {
  teamId: string;
  name: string;
  trustCeiling?: KeyCeiling;
  boundUserId?: string | null;
  expiresAt?: Date | null;
  keyPrefix: string;
  actorUserId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedKey {
  id: string;
  name: string;
  /** Returned in full exactly once. Only a hash is stored. */
  key: string;
  prefix: string;
  trust_ceiling: KeyCeiling;
  bound_user_id: string | null;
  expires_at: string | null;
}

/**
 * One key per integration. trust_ceiling defaults to untrusted; raising it
 * requires a bound member, and there is no trusted value (T16).
 */
export async function issueApiKey(database: AnyDb, input: IssueKeyInput): Promise<IssuedKey> {
  const ceiling = input.trustCeiling ?? "untrusted";
  if (ceiling !== "untrusted" && ceiling !== "user_input") {
    throw badRequest("INVALID_TRUST_CEILING", "trust_ceiling must be untrusted or user_input.");
  }
  if (input.name.trim().length === 0) {
    throw badRequest("INVALID_INPUT", "Key name must not be empty.");
  }
  let boundUserId: string | null = null;
  if (ceiling === "user_input") {
    if (input.boundUserId === undefined || input.boundUserId === null) {
      throw badRequest(
        "BOUND_USER_REQUIRED",
        "A user_input key must be bound to a named team member.",
      );
    }
    const membership = await database
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.boundUserId)));
    if (membership.length === 0) {
      throw badRequest("BOUND_USER_NOT_MEMBER", "The bound user is not a member of this team.");
    }
    boundUserId = input.boundUserId;
  }

  const key = `${input.keyPrefix}_${randomBytes(24).toString("hex")}`;
  const id = randomUUID();
  await database.insert(apiKeys).values({
    id,
    teamId: input.teamId,
    keyHash: hashToken(key),
    prefix: key.slice(0, 12),
    name: input.name,
    trustCeiling: ceiling,
    boundUserId,
    expiresAt: input.expiresAt ?? null,
  });
  if (ceiling === "user_input") {
    // T16: the one lever that moves work out of the untrusted row of the
    // capability matrix. Every occurrence deserves a human look (docs/22).
    incrementMetric("apikey_trust_ceiling_raised_total");
  }

  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actorUserId === null ? "api_key" : "user",
    actorId: input.actorUserId,
    action: "apikey.issue",
    resourceType: "api_key",
    resourceId: id,
    outcome: "allowed",
    metadata: { name: input.name, trust_ceiling: ceiling },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  return {
    id,
    name: input.name,
    key,
    prefix: key.slice(0, 12),
    trust_ceiling: ceiling,
    bound_user_id: boundUserId,
    expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
  };
}

export async function listApiKeys(database: AnyDb, teamId: string): Promise<unknown[]> {
  const rows = await database.select().from(apiKeys).where(eq(apiKeys.teamId, teamId));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    trust_ceiling: r.trustCeiling,
    bound_user_id: r.boundUserId,
    expires_at: r.expiresAt ? r.expiresAt.toISOString() : null,
    revoked_at: r.revokedAt ? r.revokedAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
  }));
}

/** Revocation takes effect immediately, not at expiry. */
export async function revokeApiKey(
  database: AnyDb,
  input: {
    teamId: string;
    keyId: string;
    actorUserId: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const rows = await database
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.teamId, input.teamId)));
  const key = rows[0];
  if (key === undefined || key.revokedAt !== null) {
    if (key === undefined) throw notFound("API key");
    return;
  }
  await database.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, input.keyId));
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actorUserId === null ? "api_key" : "user",
    actorId: input.actorUserId,
    action: "apikey.revoke",
    resourceType: "api_key",
    resourceId: input.keyId,
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
