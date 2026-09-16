import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Canonical human identity. Profile data only — no password hash, no MFA
 * secret (wallet-only auth, docs/20-authentication.md).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  /**
   * Backs the `ver` claim for immediate global revocation. Incremented on
   * suspension, wallet unlink, or forced sign-out.
   */
  tokenVersion: integer("token_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * Linked-account model: one internal user, many provider identities.
 * For wallet sign-in, provider is `evm_wallet` and providerUserId is the
 * lowercased address (normalization is load-bearing, docs/14-database.md).
 */
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    /** Signing chain for audit / EIP-1271 re-verification; not identity. */
    chainId: integer("chain_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_identities_provider_identity_unique").on(
      table.provider,
      table.providerUserId,
    ),
  ],
);

/**
 * Single-use sign-in challenges. Written by an unauthenticated endpoint:
 * rate limited, short TTL, pruned by a cleanup job (docs/20 W8).
 */
export const authNonces = pgTable("auth_nonces", {
  id: uuid("id").primaryKey(),
  nonce: text("nonce").notNull().unique(),
  /** Lowercased address the challenge was issued to. */
  address: text("address").notNull(),
  domain: text("domain").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * Opaque refresh tokens stored by hash. Rotation with reuse detection:
 * presenting an already-rotated token revokes the whole family (W6).
 */
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull(),
  replacedBy: uuid("replaced_by"),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
