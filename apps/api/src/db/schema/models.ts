import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Provider-agnostic model capability metadata.
 */
export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey(),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    capabilities: jsonb("capabilities").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("models_provider_name_version_unique").on(
      table.provider,
      table.name,
      table.version,
    ),
  ],
);
