import Fastify from "fastify";
import { config } from "./config.js";

export const app = Fastify({
  // The proxy address, never `true`. Without this, request.ip is nginx on
  // every request: audit attribution records the proxy, rate limiting buckets
  // every client together, and any IP rule matches the proxy.
  trustProxy: config.TRUST_PROXY,

  logger: {
    level: config.LOG_LEVEL,

    // Redaction is a control, not a preference (docs/22-observability.md,
    // docs/17-threat-model.md T9). A denylist of key names is the weak form of
    // this and is kept only as a backstop -- the structural rule is that
    // secrets are referenced, never carried, so they should never reach a log
    // line in the first place. The sentinel-scan test in docs/21-testing.md is
    // what actually verifies that.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        "*.accessToken",
        "*.refreshToken",
        "*.signature",
        "*.key",
        "*.secret",
        "*.password",
      ],
      censor: "[redacted]",
    },

    // Constant message, variable data in fields, so lines stay groupable.
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          ip: request.ip,
        };
      },
    },
  },

  // Smaller than nginx's client_max_body_size, so the application's own error
  // shape is what clients see rather than a proxy error page.
  bodyLimit: 1_048_576,
});

/**
 * Health checks, three of them, deliberately.
 *
 * docs/22-observability.md: a liveness probe that fails on a database blip
 * restarts healthy processes during an incident and turns a degradation into
 * an outage. So liveness checks nothing but the process.
 */

// Liveness: the process is running. No dependency checks. Ever.
app.get("/health/live", async () => ({ status: "ok" }));

// Readiness: dependencies reachable, migrations applied, configuration valid.
// Fails a rolling deploy before it takes traffic.
app.get("/health/ready", async (_request, reply) => {
  const checks: Record<string, "ok" | "failed"> = {};

  // TODO(phase 1): real checks once the database module exists --
  // SELECT 1, and assert the migration head matches the committed migrations.
  checks.config = "ok";

  const ready = Object.values(checks).every((c) => c === "ok");
  return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
});

// Startup: the environment contract parsed and the process got this far.
// src/config.ts exits before this is reachable if it did not.
app.get("/health/startup", async () => ({
  status: "started",
  service: config.OTEL_SERVICE_NAME,
}));
