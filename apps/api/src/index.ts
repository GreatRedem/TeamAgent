import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/db.js";
import { seedPermissions, seedRolePermissions, seedSystemRoles } from "./db/seed.js";

// config.ts has already validated the environment and exited if it was wrong,
// so by this point every value below is known good.

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

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (error) => {
        app.log.error({ err: error }, "error during shutdown");
        process.exit(1);
      },
    );
  });
}

void main();
