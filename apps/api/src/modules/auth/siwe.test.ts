import { describe, expect, it } from "vitest";
import { createSiweMessage } from "viem/siwe";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { AppError } from "../../lib/http.js";
import { parseAndValidateSiweMessage, type SiweConfig } from "./siwe.js";

const CONFIG: SiweConfig = {
  domain: "test.example.com",
  uri: "https://test.example.com",
  chainId: 1,
};

const account = privateKeyToAccount(generatePrivateKey());

function buildMessage(overrides: Record<string, unknown> = {}): string {
  return createSiweMessage({
    domain: "test.example.com",
    address: account.address,
    statement: "Sign in to NuraAI. This request will not trigger a transaction or cost any gas.",
    uri: "https://test.example.com",
    version: "1",
    chainId: 1,
    nonce: "abc12345",
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 5 * 60 * 1000),
    ...overrides,
  } as Parameters<typeof createSiweMessage>[0]);
}

/** Asserts the stable error code — toThrow matches message text, not codes. */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error("expected function to throw");
}

describe("parseAndValidateSiweMessage", () => {
  it("accepts a well-formed message and lowercases the address", () => {
    const result = parseAndValidateSiweMessage(buildMessage(), CONFIG);
    expect(result.address).toBe(account.address.toLowerCase());
    expect(result.nonce).toBe("abc12345");
  });

  it("rejects a subdomain suffix match (W2)", () => {
    const evil = buildMessage({ domain: "evil-test.example.com" });
    expect(codeOf(() => parseAndValidateSiweMessage(evil, CONFIG))).toBe("SIWE_DOMAIN_MISMATCH");
  });

  it("rejects a wrong domain and a wrong URI", () => {
    expect(
      codeOf(() => parseAndValidateSiweMessage(buildMessage({ domain: "other.com" }), CONFIG)),
    ).toBe("SIWE_DOMAIN_MISMATCH");
    expect(
      codeOf(() => parseAndValidateSiweMessage(buildMessage({ uri: "https://other.com" }), CONFIG)),
    ).toBe("SIWE_URI_MISMATCH");
  });

  it("rejects a wrong chain id (W3)", () => {
    expect(codeOf(() => parseAndValidateSiweMessage(buildMessage({ chainId: 137 }), CONFIG))).toBe(
      "SIWE_CHAIN_MISMATCH",
    );
  });

  it("rejects expired and not-yet-valid messages", () => {
    const expired = buildMessage({ expirationTime: new Date(Date.now() - 1000) });
    expect(codeOf(() => parseAndValidateSiweMessage(expired, CONFIG))).toBe("SIWE_MESSAGE_EXPIRED");
    const future = buildMessage({ issuedAt: new Date(Date.now() + 10 * 60 * 1000) });
    expect(codeOf(() => parseAndValidateSiweMessage(future, CONFIG))).toBe("SIWE_NOT_YET_VALID");
  });

  it("rejects malformed messages and missing fields", () => {
    // A garbage string parses to empty fields and fails the domain check;
    // either way it is rejected before any cryptography happens.
    expect(codeOf(() => parseAndValidateSiweMessage("not a siwe message", CONFIG))).toBe(
      "SIWE_DOMAIN_MISMATCH",
    );
    const noExpiry = buildMessage({ expirationTime: undefined });
    expect(codeOf(() => parseAndValidateSiweMessage(noExpiry, CONFIG))).toBe(
      "INVALID_SIWE_MESSAGE",
    );
  });
});
