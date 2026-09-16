import { app } from "./app.js";
import { config } from "./config.js";

// config.ts has already validated the environment and exited if it was wrong,
// so by this point every value below is known good.

async function main(): Promise<void> {
  try {
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
