import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "../../lib/http.js";

export interface AccessTokenClaims {
  sub: string;
  ver: number;
  jti: string;
  iat: number;
  exp: number;
}

/** Identity only. Permissions and roles are never carried in any token. */
const CLAIM_KEYS = ["sub", "ver", "jti", "iat", "exp"] as const;

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

/**
 * HS256 JWT, self-contained so domain logic stays framework-free. The alg
 * header is pinned on verify: anything that is not exactly HS256 is
 * rejected, which closes algorithm-confusion by construction.
 */
export function signAccessToken(
  secret: string,
  input: { sub: string; ver: number },
  ttlSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (ttlSeconds > 15 * 60) {
    throw new AppError("INVALID_TOKEN_TTL", 500, "Access token TTL must not exceed 15 minutes.");
  }
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64urlEncode(
    JSON.stringify({
      sub: input.sub,
      ver: input.ver,
      jti: randomBytes(16).toString("hex"),
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
    } satisfies AccessTokenClaims),
  );
  const signature = base64urlEncode(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

export function verifyAccessToken(
  secret: string,
  token: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): AccessTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AppError("INVALID_TOKEN", 401, "The access token is invalid.");
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString("utf8"));
    claims = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new AppError("INVALID_TOKEN", 401, "The access token is invalid.");
  }
  if (
    typeof header !== "object" ||
    header === null ||
    (header as { alg?: unknown }).alg !== "HS256"
  ) {
    throw new AppError("INVALID_TOKEN", 401, "The access token is invalid.");
  }

  const expected = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest();
  let actual: Buffer;
  try {
    actual = base64urlDecode(signatureB64);
  } catch {
    throw new AppError("INVALID_TOKEN", 401, "The access token is invalid.");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError("INVALID_TOKEN", 401, "The access token is invalid.");
  }

  if (typeof claims !== "object" || claims === null) {
    throw new AppError("INVALID_TOKEN", 401, "The access token is invalid.");
  }
  const c = claims as Record<string, unknown>;
  for (const key of Object.keys(c)) {
    if (!(CLAIM_KEYS as readonly string[]).includes(key)) {
      throw new AppError("INVALID_TOKEN", 401, "The access token carries forbidden claims.");
    }
  }
  if (
    typeof c.sub !== "string" ||
    typeof c.ver !== "number" ||
    typeof c.jti !== "string" ||
    typeof c.iat !== "number" ||
    typeof c.exp !== "number"
  ) {
    throw new AppError("INVALID_TOKEN", 401, "The access token is invalid.");
  }
  if (c.exp <= nowSeconds) {
    throw new AppError("TOKEN_EXPIRED", 401, "The access token has expired.");
  }
  return { sub: c.sub, ver: c.ver, jti: c.jti, iat: c.iat, exp: c.exp };
}

/** Opaque refresh token: random bytes, stored only as a hash. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Accepts "15m", "30d", "3600s", "2h". Used for TTL configuration. */
export function parseDurationSeconds(input: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new AppError("INVALID_DURATION", 500, `Invalid duration: ${input}`);
  }
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const multiplier = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return value * multiplier;
}
