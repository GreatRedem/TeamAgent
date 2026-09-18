import type { FastifyInstance } from "fastify";

/**
 * Health checks, three of them, deliberately (docs/22-observability.md).
 *
 * A liveness probe that fails on a database blip restarts healthy processes
 * during an incident and turns a degradation into an outage. So liveness
 * checks nothing but the process.
 *
 * Dependencies are injected: the production entrypoint passes the real pool
 * check and the configured service name; the e2e suite passes its own, so
 * this module stays importable outside a booted environment.
 */
export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: {
    checkDatabase: () => Promise<void>;
    checkMigrations: () => Promise<void>;
    serviceName: string;
  },
): Promise<void> {
  // Liveness: the process is running. No dependency checks. Ever.
  app.get("/health/live", async () => ({ status: "ok" }));

  // Readiness: dependencies reachable, migrations applied, configuration valid.
  // Fails a rolling deploy before it takes traffic.
  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, "ok" | "failed"> = {
      config: "ok",
      database: "failed",
      migrations: "failed",
    };

    try {
      await deps.checkDatabase();
      checks.database = "ok";
    } catch (error) {
      app.log.warn({ err: error }, "database readiness check failed");
    }

    try {
      await deps.checkMigrations();
      checks.migrations = "ok";
    } catch (error) {
      app.log.warn({ err: error }, "migration readiness check failed");
    }

    const ready = Object.values(checks).every((c) => c === "ok");
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
  });

  // Startup: the environment contract parsed and the process got this far.
  // src/config.ts exits before this is reachable if it did not.
  app.get("/health/startup", async () => ({
    status: "started",
    service: deps.serviceName,
  }));
}
