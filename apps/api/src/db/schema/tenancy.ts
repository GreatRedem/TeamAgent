import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./identity.js";

/**
 * Collaboration boundary. owner_id is RESTRICT: deleting a user must never
 * cascade into destroying their teams and everything inside them.
 */
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  /** Quotas and limits; enforced against real usage, not counters. */
  limits: text("limits"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * Team-scoped machine credentials. Stored as hash + display prefix; the
 * full value is returned exactly once at issuance.
 *
 * trust_ceiling caps the trust of anything submitted through the key
 * (docs/17 T16): default `untrusted`, optionally `user_input` bound to one
 * named user, never `trusted`.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    name: text("name").notNull(),
    trustCeiling: text("trust_ceiling").notNull().default("untrusted"),
    boundUserId: uuid("bound_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    // No `trusted` ceiling exists; a key raised to `user_input` must act
    // for exactly one named human (the C2 matrix resolves against them).
    check(
      "api_keys_trust_ceiling_valid",
      sql`${table.trustCeiling} IN ('untrusted', 'user_input')`,
    ),
    check(
      "api_keys_user_input_requires_bound_user",
      sql`(${table.trustCeiling} = 'untrusted') OR (${table.boundUserId} IS NOT NULL)`,
    ),
  ],
);
