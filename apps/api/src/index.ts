import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/db.js";
import { seedPermissions, seedRolePermissions, seedSystemRoles } from "./db/seed.js";
import { startTracing, shutdownTracing } from "./observability/tracing.js";

// config.ts has already validated the environment and exited if it was wrong,
// so by this point every value below is known good.

// Optional span export (docs/22): no OTEL_EXPORTER_OTLP_ENDPOINT, no SDK.
// The return value says whether the collector is wired; log it so an
// operator can see at startup which mode they are in.
const tracingEnabled = startTracing({
  endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  serviceName: config.OTEL_SERVICE_NAME,
  sampleRatio: config.TRACE_SAMPLE_RATIO,
});

async function main(): Promise<void> {
  try {
    // Idempotent catalogue seed: the permission vocabulary and system roles
    // come from the real seed path, never a test-only copy (docs/21).
    await seedPermissions(db);
    await seedSystemRoles(db);
    await seedRolePermissions(db);
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (error) {
    // app.log rather than console: structured, and it carries the same fields
    // as every other line (docs/22-observability.md).
    app.log.fatal({ err: error }, "failed to start");
    process.exit(1);
  }
}

app.log.info({ tracingEnabled }, "tracing configuration");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    // Flush pending spans before exit, then close the app. A dropped final
    // batch is the exporter's loss window; ordering it first keeps the
    // shutdown spans in the collector.
    shutdownTracing()
      .catch((error) => app.log.warn({ err: error }, "tracing shutdown failed"))
      .then(() => app.close())
      .then(
        () => process.exit(0),
        (error) => {
          app.log.error({ err: error }, "error during shutdown");
          process.exit(1);
        },
      );
  });
}

void main();
