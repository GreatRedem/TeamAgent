import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../../lib/http.js";

export type SecretResolver = (ref: string) => string | null;

export interface SeenSignatures {
  has(key: string): boolean;
  add(key: string): void;
}

/**
 * Bounded in-process replay cache. Correct per instance; with N instances
 * the timestamp window below is the cross-instance backstop. A shared
 * store is a production hardening item, not a correctness one — replays
 * outside the freshness window are rejected regardless of instance.
 */
export function createSeenCache(maxSize: number, ttlMs: number): SeenSignatures {
  const seen = new Map<string, number>();
  return {
    has(key: string): boolean {
      const expires = seen.get(key);
      if (expires === undefined) return false;
      if (expires <= Date.now()) {
        seen.delete(key);
        return false;
      }
      return true;
    },
    add(key: string): void {
      if (seen.size >= maxSize) {
        const oldest = seen.keys().next();
        if (!oldest.done) seen.delete(oldest.value);
      }
      seen.set(key, Date.now() + ttlMs);
    },
  };
}

const REPLAY_WINDOW_SECONDS = 300;

export interface WebhookSource {
  id: string;
  teamId: string;
  webhookSecretRef: string | null;
}

/**
 * Webhook ingress verification (docs/17 T7): HMAC over the RAW body,
 * freshness window, and replay rejection. Header:
 * `X-Webhook-Signature: t=<unix_seconds>,v1=<hmac_hex>` where the MAC
 * covers `${timestamp}.${rawBody}` with the referenced secret.
 *
 * Secrets are resolved by reference — production maps refs to environment
 * (and later a secret manager). Values never live in the database.
 */
export function verifyWebhookIngress(input: {
  source: WebhookSource;
  rawBody: string;
  signatureHeader: string | undefined;
  resolveSecret: SecretResolver;
  seen: SeenSignatures;
  nowSeconds?: number;
}): { timestamp: number } {
  if (input.source.webhookSecretRef === null) {
    throw new AppError("WEBHOOK_NOT_CONFIGURED", 400, "This source has no webhook configured.");
  }
  if (input.signatureHeader === undefined || input.signatureHeader === "") {
    throw new AppError("WEBHOOK_BAD_SIGNATURE", 401, "Missing webhook signature.");
  }
  const match = /^t=(\d+),v1=([0-9a-fA-F]+)$/.exec(input.signatureHeader.trim());
  if (!match) {
    throw new AppError("WEBHOOK_BAD_SIGNATURE", 401, "Malformed webhook signature.");
  }
  const timestamp = Number(match[1]);
  const presented = match[2] as string;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > REPLAY_WINDOW_SECONDS) {
    throw new AppError(
      "WEBHOOK_STALE",
      401,
      "The webhook delivery is outside the freshness window.",
    );
  }
  const secret = input.resolveSecret(input.source.webhookSecretRef);
  if (secret === null) {
    throw new AppError("WEBHOOK_MISCONFIGURED", 500, "The webhook secret is not configured.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${input.rawBody}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(presented, "hex");
  } catch {
    throw new AppError("WEBHOOK_BAD_SIGNATURE", 401, "Malformed webhook signature.");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError("WEBHOOK_BAD_SIGNATURE", 401, "Invalid webhook signature.");
  }
  const replayKey = `${input.source.id}:${presented}`;
  if (input.seen.has(replayKey)) {
    throw new AppError("WEBHOOK_REPLAY", 401, "This webhook delivery was already processed.");
  }
  input.seen.add(replayKey);
  return { timestamp };
}

/** Production resolver: refs name environment variables (secret-manager injected). */
export function envSecretResolver(ref: string): string | null {
  return process.env[ref] ?? null;
}
