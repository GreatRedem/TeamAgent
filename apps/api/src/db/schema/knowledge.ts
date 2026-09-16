import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { teams } from "./tenancy.js";
import { users } from "./identity.js";

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * Items default to untrusted. Trust is asserted by a named human
 * (trusted_by / trusted_at), never inferred by the ingestion pipeline.
 * ingested_from / ingested_by make a poisoned corpus traceable (T3).
 * Chunk/embedding tables are Phase 5 work (pgvector); deliberately absent.
 */
export const knowledgeItems = pgTable("knowledge_items", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  knowledgeBaseId: uuid("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),
  trustLevel: text("trust_level").notNull().default("untrusted"),
  trustedBy: uuid("trusted_by").references(() => users.id, { onDelete: "set null" }),
  trustedAt: timestamp("trusted_at", { withTimezone: true, mode: "date" }),
  ingestedFrom: text("ingested_from"),
  ingestedBy: uuid("ingested_by").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
