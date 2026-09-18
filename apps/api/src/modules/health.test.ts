import Fastify, { type FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import type { AnyDb } from "../db/db.js";
import * as schema from "../db/schema/index.js";
import { checkMigrations } from "../db/check-migrations.js";
import { createTestDb } from "../db/harness.js";
import { registerHealthRoutes } from "./health.js";

async function buildHealthApp(database: AnyDb): Promise<FastifyInstance> {
  const app = Fastify();
  await registerHealthRoutes(app, {
    checkDatabase: async () => {
      await database.execute(sql.raw("SELECT 1"));
    },
    checkMigrations: () => checkMigrations(database),
    serviceName: "nuraai-api-test",
  });
  return app;
}

describe("migration-aware readiness", () => {
  it("returns 503 with migrations=failed on an unmigrated database", async () => {
    const client = new PGlite();
    await client.waitReady;
    const database = drizzle(client, { schema });
    const app = await buildHealthApp(database);
    try {
      const ready = await app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(503);
      const body = ready.json() as { status: string; checks: Record<string, string> };
      expect(body.status).toBe("not_ready");
      expect(body.checks.database).toBe("ok");
      expect(body.checks.migrations).toBe("failed");
    } finally {
      await app.close();
      await client.close();
    }
  }, 60000);

  it("returns 503 with migrations=failed on a partially migrated database", async () => {
    const t = await createTestDb();
    // Drop the most recent migration row: the schema is current but the
    // history is behind, the rolling-deploy case readiness must catch.
    await t.db.execute(
      sql.raw(
        "DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT MAX(id) FROM drizzle.__drizzle_migrations)",
      ),
    );
    const app = await buildHealthApp(t.db);
    try {
      const ready = await app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(503);
      const body = ready.json() as { status: string; checks: Record<string, string> };
      expect(body.checks.migrations).toBe("failed");
    } finally {
      await app.close();
      await t.close();
    }
  }, 60000);

  it("returns 503 with migrations=failed on a diverged hash", async () => {
    const t = await createTestDb();
    await t.db.execute(
      sql.raw("UPDATE drizzle.__drizzle_migrations SET hash = 'diverged' WHERE id = 1"),
    );
    const app = await buildHealthApp(t.db);
    try {
      const ready = await app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(503);
      expect((ready.json() as { checks: Record<string, string> }).checks.migrations).toBe("failed");
    } finally {
      await app.close();
      await t.close();
    }
  }, 60000);

  it("returns 503 with migrations=failed on extra history rows", async () => {
    const t = await createTestDb();
    await t.db.execute(
      sql.raw(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 0)",
      ),
    );
    const app = await buildHealthApp(t.db);
    try {
      const ready = await app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(503);
      expect((ready.json() as { checks: Record<string, string> }).checks.migrations).toBe("failed");
    } finally {
      await app.close();
      await t.close();
    }
  }, 60000);

  it("returns 200 with migrations=ok on a fully migrated database", async () => {
    const t = await createTestDb();
    const app = await buildHealthApp(t.db);
    try {
      const ready = await app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(200);
      const body = ready.json() as { status: string; checks: Record<string, string> };
      expect(body.status).toBe("ready");
      expect(body.checks).toEqual({ config: "ok", database: "ok", migrations: "ok" });
    } finally {
      await app.close();
      await t.close();
    }
  }, 60000);
});
