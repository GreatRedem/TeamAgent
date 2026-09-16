import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { authNonces } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";

export interface IssuedNonce {
  nonce: string;
  expiresAt: Date;
}

/** Single-use challenges, five-minute TTL (docs/20 W1, W8). */
export async function issueNonce(
  database: AnyDb,
  input: { address: string; domain: string; ttlSeconds?: number; now?: Date },
): Promise<IssuedNonce> {
  const now = input.now ?? new Date();
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(now.getTime() + (input.ttlSeconds ?? 300) * 1000);
  await database.insert(authNonces).values({
    id: randomBytes(16).toString("hex"),
    nonce,
    address: input.address.toLowerCase(),
    domain: input.domain,
    expiresAt,
  });
  return { nonce, expiresAt };
}

/**
 * Atomic consume-before-verify. Returns true only if exactly one row was
 * affected — a check-then-update pair would let one signature sign in twice
 * under concurrency (W1).
 */
export async function consumeNonce(
  database: AnyDb,
  input: { nonce: string; address: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const result = (await database.execute(sql`
    UPDATE auth_nonces SET consumed_at = ${now}
    WHERE nonce = ${input.nonce}
      AND address = ${input.address.toLowerCase()}
      AND consumed_at IS NULL
      AND expires_at > ${now}
  `)) as unknown as { rowCount?: number | null };
  return (result.rowCount ?? 0) === 1;
}
