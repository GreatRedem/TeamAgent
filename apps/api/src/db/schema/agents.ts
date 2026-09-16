import { boolean, check, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { teams } from "./tenancy.js";
import { models } from "./models.js";
import { permissions } from "./authorization.js";
import { tools } from "./tools.js";
import { knowledgeBases } from "./knowledge.js";
import { sourceConnections } from "./sources.js";

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  modelId: uuid("model_id").references(() => models.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt"),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  /** Per-run token / tool-count / depth / wall-clock limits (docs/17 C10). */
  budgets: jsonb("budgets").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * Narrow, enumerated grants. R3 (no admin-tier / user-only permission) needs
 * a subquery, so it is enforced by a trigger shipped in the migration —
 * see the migration SQL, and the test that attempts the forbidden write.
 */
export const agentPermissions = pgTable(
  "agent_permissions",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "restrict" }),
    scopeType: text("scope_type"),
    scopeId: uuid("scope_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("agent_permissions_unique")
      .on(table.teamId, table.agentId, table.permissionId, table.scopeType, table.scopeId)
      .nullsNotDistinct(),
  ],
);

export const agentTools = pgTable(
  "agent_tools",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("agent_tools_unique").on(table.agentId, table.toolId)],
);

export const agentKnowledgeBases = pgTable(
  "agent_knowledge_bases",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("agent_knowledge_bases_unique").on(table.agentId, table.knowledgeBaseId)],
);

/**
 * Egress controls live here. can_reply is reply-to-origin (docs/17 C4);
 * can_initiate allows sending elsewhere and requires a non-empty
 * allowed_destinations — R4, enforced by CHECK (covers UPDATE too).
 * The runtime resolves destinations from this list after generation.
 */
export const agentSources = pgTable(
  "agent_sources",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sourceConnectionId: uuid("source_connection_id")
      .notNull()
      .references(() => sourceConnections.id, { onDelete: "restrict" }),
    canReply: boolean("can_reply").notNull().default(true),
    canInitiate: boolean("can_initiate").notNull().default(false),
    allowedDestinations: jsonb("allowed_destinations")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("agent_sources_unique").on(table.agentId, table.sourceConnectionId),
    check(
      "agent_sources_r4_initiate_requires_destinations",
      sql`(${table.canInitiate} = FALSE) OR (jsonb_array_length(${table.allowedDestinations}) > 0)`,
    ),
  ],
);
