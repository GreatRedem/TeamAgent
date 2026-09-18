import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import * as schema from "./schema/index.js";
import { migrationsFolder } from "./migration-assets.js";

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

  // Record the packaged journal hashes so `checkMigrations` sees this
  // database as fully migrated. The statements above are the committed
  // migrations; the history rows are what drizzle's own migrator would have
  // written alongside them.
  const migrations = readMigrationFiles({ migrationsFolder });
  await client.exec(
    "CREATE SCHEMA IF NOT EXISTS drizzle; CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);",
  );
  for (const migration of migrations) {
    await client.query(
      'INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)',
      [migration.hash, migration.folderMillis],
    );
  }

  const db = drizzle(client, { schema });
  return { db, close: () => client.close() };
}
