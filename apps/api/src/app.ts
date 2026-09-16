import Fastify from "fastify";
import { config } from "./config.js";
import { checkDatabase, pool } from "./db/pool.js";
import { db } from "./db/db.js";
import { RateLimiter } from "./modules/auth/rate-limit.js";
import { parseDurationSeconds } from "./modules/auth/tokens.js";
import { registerApi } from "./modules/api.js";
import { modelProviderFromConfig } from "./runtime/model/provider.js";

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

app.addHook("onClose", async () => {
  await pool.end();
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
  const checks: Record<string, "ok" | "failed"> = {
    config: "ok",
    database: "failed",
  };

  try {
    await checkDatabase();
    checks.database = "ok";
  } catch (error) {
    app.log.warn({ err: error }, "database readiness check failed");
  }

  const ready = Object.values(checks).every((c) => c === "ok");
  return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
});

// Startup: the environment contract parsed and the process got this far.
// src/config.ts exits before this is reachable if it did not.
app.get("/health/startup", async () => ({
  status: "started",
  service: config.OTEL_SERVICE_NAME,
}));

// Product routes. The API contract is docs/15-api.md; the trust model that
// constrains it is docs/17-threat-model.md.
await registerApi(app, {
  db,
  siwe: {
    domain: config.SIWE_DOMAIN,
    uri: config.SIWE_URI,
    chainId: config.SIWE_CHAIN_ID,
  },
  jwtSecret: config.JWT_SECRET,
  accessTtlSeconds: parseDurationSeconds(config.JWT_ACCESS_TTL),
  refreshTtlSeconds: parseDurationSeconds(config.REFRESH_TTL),
  rpcUrl: config.EVM_RPC_URL,
  rpcTimeoutMs: 5000,
  keyPrefix: "nk_live",
  nonceLimiter: new RateLimiter(10, 60_000),
  verifyLimiter: new RateLimiter(30, 60_000),
  // Single provider integration for the MVP. Selection lives in
  // runtime/model/provider.ts so the worker process cannot disagree with
  // the API about which provider is live.
  modelProvider: modelProviderFromConfig(),
  approvalTtlSeconds: config.APPROVAL_TTL_SECONDS,
});
