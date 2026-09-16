import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Hex } from "viem";
import { refreshTokens, userIdentities, users } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { AppError, unauthorized } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";
import { consumeNonce } from "./nonces.js";
import { parseAndValidateSiweMessage, type SiweConfig } from "./siwe.js";
import { hashToken, newOpaqueToken, signAccessToken } from "./tokens.js";
import { verifyWalletSignature, type ContractSignatureVerifier } from "./verify.js";

export interface AuthServiceConfig {
  siwe: SiweConfig;
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  rpcUrl: string;
  rpcTimeoutMs?: number;
  contractVerifier?: ContractSignatureVerifier;
}

export interface SignInResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; address: string };
  isNewUser: boolean;
}

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

function isHexSignature(value: string): value is Hex {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

async function denial(
  database: AnyDb,
  meta: RequestMeta,
  reason: string,
  statusCode: number,
): Promise<AppError> {
  await writeAudit(database, {
    actorType: "anonymous",
    action: "auth.wallet.verify",
    resourceType: "session",
    outcome: "denied",
    reason,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
  return new AppError("AUTH_FAILED", statusCode, "Sign-in failed.", { reason });
}

/**
 * Wallet sign-in, in the order docs/20-authentication.md requires: cheap
 * structural checks first, atomic nonce consume before signature
 * verification, cryptography last. Every failure is an audited denial, and
 * signatures are never written anywhere.
 */
export async function verifySignIn(
  database: AnyDb,
  config: AuthServiceConfig,
  input: { message: string; signature: string } & RequestMeta,
): Promise<SignInResult> {
  let validated;
  try {
    validated = parseAndValidateSiweMessage(input.message, config.siwe);
  } catch (error) {
    const reason = error instanceof AppError ? error.code : "INVALID_SIWE_MESSAGE";
    throw await denial(database, input, reason, 401);
  }

  const consumed = await consumeNonce(database, {
    nonce: validated.nonce,
    address: validated.address,
  });
  if (!consumed) {
    throw await denial(database, input, "NONCE_INVALID_OR_REUSED", 401);
  }

  if (!isHexSignature(input.signature)) {
    throw await denial(database, input, "BAD_SIGNATURE", 401);
  }
  const signatureOk = await verifyWalletSignature({
    address: validated.address,
    message: input.message,
    signature: input.signature,
    rpcUrl: config.rpcUrl,
    rpcTimeoutMs: config.rpcTimeoutMs,
    contractVerifier: config.contractVerifier,
  });
  if (!signatureOk) {
    throw await denial(database, input, "BAD_SIGNATURE", 401);
  }

  const { userId, isNewUser } = await upsertWalletIdentity(
    database,
    validated.address,
    config.siwe.chainId,
  );

  const userRows = await database.select().from(users).where(eq(users.id, userId));
  const user = userRows[0];
  if (user === undefined) {
    throw new AppError("INTERNAL_SERVER_ERROR", 500, "Sign-in failed.");
  }

  const accessToken = signAccessToken(
    config.jwtSecret,
    { sub: userId, ver: user.tokenVersion },
    config.accessTtlSeconds,
  );
  const refreshToken = newOpaqueToken();
  const now = new Date();
  await database.insert(refreshTokens).values({
    id: randomUUID(),
    tokenHash: hashToken(refreshToken),
    userId,
    familyId: randomUUID(),
    expiresAt: new Date(now.getTime() + config.refreshTtlSeconds * 1000),
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  await writeAudit(database, {
    actorType: "user",
    actorId: userId,
    action: "auth.wallet.verify",
    resourceType: "session",
    resourceId: userId,
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  return {
    accessToken,
    refreshToken,
    user: { id: userId, address: validated.address },
    isNewUser,
  };
}

async function upsertWalletIdentity(
  database: AnyDb,
  address: string,
  chainId: number,
): Promise<{ userId: string; isNewUser: boolean }> {
  const existing = await database
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(
      and(eq(userIdentities.provider, "evm_wallet"), eq(userIdentities.providerUserId, address)),
    );
  const found = existing[0];
  if (found !== undefined) {
    return { userId: found.userId, isNewUser: false };
  }
  const userId = randomUUID();
  await database.insert(users).values({ id: userId });
  await database.insert(userIdentities).values({
    id: randomUUID(),
    userId,
    provider: "evm_wallet",
    providerUserId: address,
    chainId,
  });
  return { userId, isNewUser: true };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Rotate on every use. A replayed (already-rotated) token is treated as
 * theft: the whole family is revoked and token_version is incremented,
 * which kills every access token immediately (W6).
 */
export async function refreshSession(
  database: AnyDb,
  config: AuthServiceConfig,
  input: { refreshToken: string } & RequestMeta,
): Promise<RefreshResult> {
  const now = new Date();
  const presentedHash = hashToken(input.refreshToken);
  const rows = await database
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, presentedHash));
  const row = rows[0];
  if (row === undefined) {
    throw unauthorized("The refresh token is invalid.");
  }
  if (row.replacedBy !== null) {
    // Replay of a rotated token: theft until proven otherwise. Revoke the
    // whole family and cut off every access token via token_version (W6).
    // A merely revoked row (logout) is different: plain invalid, no alarm.
    // Atomic increment: reuse is a compromise signal and must cut off every
    // access token now, not after a read-modify-write round trip.
    await database.execute(
      sql`UPDATE users SET token_version = token_version + 1 WHERE id = ${row.userId}`,
    );
    await revokeFamily(database, row.familyId, now);
    await writeAudit(database, {
      actorType: "user",
      actorId: row.userId,
      action: "auth.refresh",
      resourceType: "session",
      outcome: "denied",
      reason: "TOKEN_REUSE_FAMILY_REVOKED",
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    throw unauthorized("The refresh token was already used.");
  }
  if (row.revokedAt !== null) {
    // Retired without rotation (logout): invalid, but not a theft signal —
    // no family alarm, no version bump.
    throw unauthorized("The refresh token is invalid.");
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    await database
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.id, row.id));
    throw unauthorized("The refresh token has expired.");
  }

  const userRows = await database.select().from(users).where(eq(users.id, row.userId));
  const user = userRows[0];
  if (user === undefined) {
    throw unauthorized("The refresh token is invalid.");
  }

  const nextId = randomUUID();
  const nextToken = newOpaqueToken();
  await database
    .update(refreshTokens)
    .set({ revokedAt: now, replacedBy: nextId })
    .where(eq(refreshTokens.id, row.id));
  await database.insert(refreshTokens).values({
    id: nextId,
    tokenHash: hashToken(nextToken),
    userId: row.userId,
    familyId: row.familyId,
    expiresAt: new Date(now.getTime() + config.refreshTtlSeconds * 1000),
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  return {
    accessToken: signAccessToken(
      config.jwtSecret,
      { sub: row.userId, ver: user.tokenVersion },
      config.accessTtlSeconds,
    ),
    refreshToken: nextToken,
  };
}

async function revokeFamily(database: AnyDb, familyId: string, now: Date): Promise<void> {
  await database
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(eq(refreshTokens.familyId, familyId));
}

/** Revoking is idempotent: an unknown token still returns success. */
export async function logout(
  database: AnyDb,
  input: { refreshToken: string } & RequestMeta,
): Promise<void> {
  const rows = await database
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(input.refreshToken)));
  const row = rows[0];
  if (row === undefined) return;
  await revokeFamily(database, row.familyId, new Date());
  await writeAudit(database, {
    actorType: "user",
    actorId: row.userId,
    action: "auth.logout",
    resourceType: "session",
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
