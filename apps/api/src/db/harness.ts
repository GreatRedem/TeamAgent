import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export type TestDatabase = PgliteDatabase<typeof schema> & { $client: PGlite };

export interface TestDb {
  db: TestDatabase;
  close: () => Promise<void>;
}

/**
 * Fresh in-process PostgreSQL per test file, migrated from the COMMITTED
 * migrations — not from a schema push — so CI exercises the migration path
 * production runs (docs/21-testing.md).
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  await client.waitReady;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error(`no migrations found in ${migrationsDir}`);
  }
  for (const file of files) {
    const text = readFileSync(join(migrationsDir, file), "utf8");
    const statements = text
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await client.exec(statement);
    }
  }

  const db = drizzle(client, { schema });
  return { db, close: () => client.close() };
}
