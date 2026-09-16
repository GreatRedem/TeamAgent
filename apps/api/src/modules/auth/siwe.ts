import { parseSiweMessage } from "viem/siwe";
import { isAddress } from "viem";
import { AppError } from "../../lib/http.js";

export interface SiweConfig {
  /** MUST equal the browser origin exactly; compared with === (W2). */
  domain: string;
  uri: string;
  chainId: number;
}

export interface ValidatedSiweMessage {
  address: string;
  nonce: string;
  issuedAt: Date;
  expirationTime: Date;
}

/** Clock skew allowance for issued-at / expiry comparisons. */
const CLOCK_SKEW_MS = 60_000;

/**
 * Parse with a real EIP-4361 parser and validate every field. Never regex
 * fields out of the message — a permissive parser is how field-injection
 * bugs happen (docs/20-authentication.md).
 */
export function parseAndValidateSiweMessage(
  message: string,
  config: SiweConfig,
  now: Date = new Date(),
): ValidatedSiweMessage {
  let parsed;
  try {
    parsed = parseSiweMessage(message);
  } catch {
    throw new AppError("INVALID_SIWE_MESSAGE", 400, "The sign-in message is malformed.");
  }

  if (parsed.domain !== config.domain) {
    throw new AppError("SIWE_DOMAIN_MISMATCH", 401, "The sign-in message domain is invalid.");
  }
  if (parsed.uri !== config.uri) {
    throw new AppError("SIWE_URI_MISMATCH", 401, "The sign-in message URI is invalid.");
  }
  if (parsed.chainId !== config.chainId) {
    throw new AppError("SIWE_CHAIN_MISMATCH", 401, "The sign-in message chain is invalid.");
  }
  if (typeof parsed.address !== "string" || !isAddress(parsed.address)) {
    throw new AppError("INVALID_SIWE_MESSAGE", 400, "The sign-in message address is invalid.");
  }
  if (typeof parsed.nonce !== "string" || parsed.nonce.length === 0) {
    throw new AppError("INVALID_SIWE_MESSAGE", 400, "The sign-in message has no nonce.");
  }

  const issuedAt = parsed.issuedAt ? new Date(parsed.issuedAt) : null;
  if (issuedAt === null || Number.isNaN(issuedAt.getTime())) {
    throw new AppError(
      "INVALID_SIWE_MESSAGE",
      400,
      "The sign-in message has no valid issued-at time.",
    );
  }
  if (issuedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw new AppError("SIWE_NOT_YET_VALID", 401, "The sign-in message is not yet valid.");
  }

  if (!parsed.expirationTime) {
    throw new AppError("INVALID_SIWE_MESSAGE", 400, "The sign-in message has no expiration time.");
  }
  const expirationTime = new Date(parsed.expirationTime);
  if (Number.isNaN(expirationTime.getTime()) || expirationTime.getTime() <= now.getTime()) {
    throw new AppError("SIWE_MESSAGE_EXPIRED", 401, "The sign-in message has expired.");
  }

  return {
    address: parsed.address.toLowerCase(),
    nonce: parsed.nonce,
    issuedAt,
    expirationTime,
  };
}
