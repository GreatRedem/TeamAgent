import type { AnyDb } from "../db/db.js";
import type { ContractSignatureVerifier } from "./auth/verify.js";
import type { SiweConfig } from "./auth/siwe.js";
import { RateLimiter } from "./auth/rate-limit.js";
import type { ToolHandlerDeps } from "./tools/registry.js";

export interface ApiDeps {
  db: AnyDb;
  siwe: SiweConfig;
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  rpcUrl: string;
  rpcTimeoutMs: number;
  keyPrefix: string;
  nonceLimiter: RateLimiter;
  verifyLimiter: RateLimiter;
  contractVerifier?: ContractSignatureVerifier;
  /** Overridden in tests; production uses the real SSRF-pinned handlers. */
  toolHandlerDeps?: Partial<ToolHandlerDeps>;
}

export function testDeps(db: AnyDb, overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    db,
    siwe: { domain: "test.example.com", uri: "https://test.example.com", chainId: 1 },
    jwtSecret: "test-secret-with-at-least-32-bytes!!",
    accessTtlSeconds: 900,
    refreshTtlSeconds: 30 * 24 * 3600,
    rpcUrl: "http://127.0.0.1:1",
    rpcTimeoutMs: 50,
    keyPrefix: "nk_test",
    nonceLimiter: new RateLimiter(1000, 60_000),
    verifyLimiter: new RateLimiter(1000, 60_000),
    ...overrides,
  };
}
