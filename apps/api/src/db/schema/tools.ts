import { jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { teams } from "./tenancy.js";

/**
 * Executable capabilities. team_id NULL marks a system tool for every team.
 *
 * risk_tier is NOT NULL with no default (docs/17 C2): a tool that silently
 * defaults to the safest tier is the failure mode tiering exists to prevent.
 * R2: system tool names are unique via partial unique index.
 */
export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    riskTier: text("risk_tier").notNull(),
    /** Narrowest usable types; validated before execution (docs/17 C7). */
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
    /** Credential reference resolved inside the runtime, never in context. */
    credentialRef: text("credential_ref"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("tools_team_name_unique").on(table.teamId, table.name),
    uniqueIndex("tools_system_name_unique")
      .on(table.name)
      .where(sql`${table.teamId} IS NULL`),
  ],
);
