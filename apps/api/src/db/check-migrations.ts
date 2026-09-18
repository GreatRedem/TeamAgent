import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { AnyDb } from "./db.js";
import { migrationsFolder } from "./migration-assets.js";

/**
 * Migration-aware readiness (docs/22-observability.md Health checks).
 *
 * `GET /health/ready` claims "migrations applied" — this is the check that
 * makes the claim true. It compares the applied hashes in
 * `drizzle.__drizzle_migrations` against the packaged journal, using the
 * same technique as the release smoke (`smoke-release.mjs`):
 * `readMigrationFiles` from `drizzle-orm/migrator` plus `meta/_journal.json`,
 * comparing `hash` arrays in order. Missing, extra, or diverged entries all
 * fail: a database that is behind, ahead, or forked must not take traffic.
 *
 * The handle is `AnyDb`, so the same function covers the pg-backed
 * production database and the PGlite-backed test databases.
 */
export function getExpectedMigrationHashes(): string[] {
  return readMigrationFiles({ migrationsFolder }).map((migration) => migration.hash);
}

export async function getAppliedMigrationHashes(database: AnyDb): Promise<string[]> {
  const result = (await database.execute(
    sql.raw("SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id"),
  )) as unknown as { rows: Array<{ hash: string }> };
  return result.rows.map((row) => row.hash);
}

export async function checkMigrations(database: AnyDb): Promise<void> {
  const expected = getExpectedMigrationHashes();
  const applied = await getAppliedMigrationHashes(database);
  if (applied.length !== expected.length) {
    throw new Error(
      `migration check failed: expected ${expected.length} migrations, applied ${applied.length}`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (applied[i] !== expected[i]) {
      throw new Error(`migration check failed: hash mismatch at index ${i}`);
    }
  }
}
