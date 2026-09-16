import { check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { teams } from "./tenancy.js";
import { users } from "./identity.js";

/**
 * A channel registered in a team (Telegram, email, webhook, ...).
 * webhook_secret_ref supports signature verification at ingress (T7).
 * Secrets are referenced, never stored.
 */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>(),
  webhookSecretRef: text("webhook_secret_ref"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * A concrete endpoint on a source. Ownership is explicit: team scope, or
 * user scope with the owning user required (CHECK).
 */
export const sourceConnections = pgTable(
  "source_connections",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ownerScope: text("owner_scope").notNull().default("team"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    credentialRef: text("credential_ref"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "source_connections_owner_scope_valid",
      sql`(${table.ownerScope} = 'team' AND ${table.userId} IS NULL) OR (${table.ownerScope} = 'user' AND ${table.userId} IS NOT NULL)`,
    ),
  ],
);
