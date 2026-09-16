import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { teams } from "./tenancy.js";
import { users } from "./identity.js";

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** Collection kind from the API contract (`document`, `url`, ...). Display only. */
  kind: text("kind"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * Items default to untrusted. Trust is asserted by a named human
 * (trusted_by / trusted_at), never inferred by the ingestion pipeline.
 * ingested_from / ingested_by make a poisoned corpus traceable (T3).
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

/**
 * Retrieval unit. Items are chunked synchronously at ingestion so what the
 * runtime retrieves is exactly what was stored — no background pipeline to
 * lag behind the access check. Each chunk inherits its item's trust at
 * retrieval time (read live, never copied: a trust change takes effect on
 * the next retrieval).
 *
 * Deliberately no embedding column: similarity search needs pgvector, which
 * the PGlite test loop cannot load, so vectors would be untestable here.
 * Ranking is keyword overlap until the vector slice lands (server-side
 * pgvector + an embedding provider + a backfill); the chunk rows it will
 * attach to already exist.
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    charCount: integer("char_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("knowledge_chunks_item_ordinal_unique").on(table.knowledgeItemId, table.ordinal),
    index("knowledge_chunks_base_idx").on(table.knowledgeBaseId),
    index("knowledge_chunks_item_idx").on(table.knowledgeItemId),
  ],
);
