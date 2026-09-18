import { strict as assert } from "node:assert";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "./dist/db/schema/index.js";

const temporary = await mkdtemp(join(tmpdir(), "nuraai-release-"));
let client;
try {
  const packaged = join(temporary, "dist");
  await cp(new URL("./dist/", import.meta.url), packaged, { recursive: true });
  await writeFile(join(temporary, "package.json"), JSON.stringify({ type: "module" }));
  const files = await readdir(packaged, { recursive: true });
  assert.ok(files.includes("index.js") && files.includes("worker.js"));
  assert.ok(files.includes(join("db", "migrate.js")));
  assert.ok(
    !files.some((file) =>
      /(?:^|[\\/])(?:tests?|test-app|harness|corpus)(?:[.\\/]|$)|\.(?:test|spec)\./.test(file),
    ),
  );
  const { migrationsFolder } = await import(
    pathToFileURL(join(packaged, "db", "migration-assets.js")).href
  );
  assert.equal(resolve(migrationsFolder), join(packaged, "db", "migrations"));
  const migrations = readMigrationFiles({ migrationsFolder });
  assert.ok(migrations.length > 0);
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );
  assert.equal(migrations.length, journal.entries.length);
  assert.equal(
    (await readdir(migrationsFolder)).filter((file) => file.endsWith(".sql")).length,
    migrations.length,
  );
  client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  const history = () => client.query("SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id");
  const first = await history();
  assert.deepEqual(
    first.rows.map((row) => row.hash),
    migrations.map((migration) => migration.hash),
  );
  let tables = 0;
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable)) continue;
    await db.select().from(table).limit(1);
    tables += 1;
  }
  assert.ok(tables > 0);
  await migrate(db, { migrationsFolder });
  assert.deepEqual((await history()).rows, first.rows);
  process.stdout.write(
    `Packaged migration smoke passed: ${migrations.length} migrations, ${tables} tables, idempotent replay.\n`,
  );
} finally {
  try {
    await client?.close();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
