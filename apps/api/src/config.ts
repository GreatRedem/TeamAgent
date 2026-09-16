import { z } from "zod";

/**
 * The environment contract from docs/19-tech-stack.md.
 *
 * Parsed before the server binds a port. A missing JWT_SECRET must stop the
 * process, not surface as a 500 on the first login, and a SIWE_DOMAIN that
 * does not match the deployed origin must be loud rather than silently
 * breaking every sign-in.
 */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3000),

  // The proxy address or subnet. `true` is rejected: it would make the app
  // believe any X-Forwarded-For header, letting a client that can reach the
  // service directly spoof its own IP into audit_logs.ip_address.
  TRUST_PROXY: z
    .string()
    .min(1)
    .refine((v) => v !== "true", {
      message:
        'TRUST_PROXY must be the proxy address or subnet, never "true" — see docs/19-tech-stack.md',
    }),

  DATABASE_URL: z.string().url().startsWith("postgres"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 bytes"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL: z.string().default("30d"),

  SIWE_DOMAIN: z.string().min(1),
  SIWE_URI: z.string().url(),
  SIWE_CHAIN_ID: z.coerce.number().int().positive(),
  EVM_RPC_URL: z.string().url(),

  QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  QUEUE_LEASE_SECONDS: z.coerce.number().int().positive().default(600),
  QUEUE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Jobs-table retention (docs/23 Cleanup): succeeded rows are deleted
  // after a short retention, dead/failed rows kept longer as diagnostics.
  JOBS_SUCCEEDED_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  JOBS_FAILED_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  // When the cleanup job fires (server-local time, like every cron here).
  JOBS_CLEANUP_CRON: z.string().min(1).default("17 3 * * *"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal("")),
  OTEL_SERVICE_NAME: z.string().default("nuraai-api"),
  TRACE_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(0.1),

  APPROVAL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  APPROVAL_NOTIFY_CHANNEL: z.string().optional().or(z.literal("")),

  // Model gateway -- single OpenAI-compatible provider for the MVP
  // (docs/13-roadmap.md). Absent in environments that never start runs;
  // a run then fails with MODEL_MISCONFIGURED rather than hanging.
  MODEL_BASE_URL: z.string().url().optional().or(z.literal("")),
  MODEL_API_KEY: z.string().optional().or(z.literal("")),
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),

  DEFAULT_LOCALE: z.string().default("en"),
  SUPPORTED_LOCALES: z.string().default("en,fa"),
});

export type Config = z.infer<typeof Env> & {
  siweOrigin: string;
  supportedLocales: string[];
};

function load(): Config {
  const parsed = Env.safeParse(process.env);

  if (!parsed.success) {
    // Written to stderr directly: this runs before the logger exists, and a
    // configuration failure has to be legible in a container log.
    console.error("Invalid environment. The API will not start.\n");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error("\nSee docs/19-tech-stack.md and apps/api/.env.example.");
    process.exit(1);
  }

  const env = parsed.data;

  // SIWE_DOMAIN must equal the browser origin exactly. A mismatch with
  // SIWE_URI means one of the two is wrong, and a permissive domain check is
  // the whole of threat W2 in docs/20-authentication.md.
  const uriHost = new URL(env.SIWE_URI).host;
  if (uriHost !== env.SIWE_DOMAIN) {
    console.error(
      `SIWE_DOMAIN (${env.SIWE_DOMAIN}) does not match the host in SIWE_URI (${uriHost}).\n` +
        "These must agree, and both must equal the browser origin exactly.",
    );
    process.exit(1);
  }

  return {
    ...env,
    siweOrigin: new URL(env.SIWE_URI).origin,
    supportedLocales: env.SUPPORTED_LOCALES.split(",").map((s) => s.trim()),
  };
}

export const config = load();
