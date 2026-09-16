import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLogs } from "../../db/schema/index.js";
import {
  authHeader,
  buildTestApp,
  fetchNonce,
  newAccount,
  signInFresh,
  siweMessage,
  type TestApp,
} from "../test-app.js";
import { RateLimiter } from "./rate-limit.js";

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
}, 60000);

afterAll(async () => {
  await t.t.close();
});

function decodePayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("wallet sign-in flow", () => {
  it("signs in with a real EOA signature and serves /auth/me", async () => {
    const user = await signInFresh(t.app);
    const me = await t.app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(user.accessToken),
    });
    expect(me.statusCode).toBe(200);
    const body = me.json() as {
      data: { user: { id: string }; identities: unknown[]; teams: unknown[] };
    };
    expect(body.data.user.id).toBe(user.userId);
    expect(body.data.identities).toHaveLength(1);
    expect(body.data.teams).toHaveLength(0);
  });

  it("rejects unknown tokens and/issues identity-only access tokens", async () => {
    const me = await t.app.inject({ method: "GET", url: "/auth/me", headers: authHeader("bogus") });
    expect(me.statusCode).toBe(401);

    const user = await signInFresh(t.app);
    const claims = decodePayload(user.accessToken);
    expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "jti", "sub", "ver"]);
  });

  it("rejects a replayed signature: the nonce is single-use (W1)", async () => {
    const account = newAccount();
    const nonce = await fetchNonce(t.app, account.address);
    const message = siweMessage({ address: account.address, nonce });
    const signature = await account.signMessage({ message });
    const first = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message, signature },
    });
    expect(first.statusCode).toBe(200);
    const second = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message, signature },
    });
    expect(second.statusCode).toBe(401);
  });

  it("allows exactly one of two concurrent verifies on one nonce (W1 race)", async () => {
    const account = newAccount();
    const nonce = await fetchNonce(t.app, account.address);
    const message = siweMessage({ address: account.address, nonce });
    const signature = await account.signMessage({ message });
    const payload = { message, signature };
    const [a, b] = await Promise.all([
      t.app.inject({ method: "POST", url: "/auth/wallet/verify", payload }),
      t.app.inject({ method: "POST", url: "/auth/wallet/verify", payload }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 401]);
  });

  it("rejects a nonce bound to a different address (W1)", async () => {
    const a = newAccount();
    const b = newAccount();
    const nonce = await fetchNonce(t.app, a.address);
    const message = siweMessage({ address: b.address, nonce });
    const signature = await b.signMessage({ message });
    const res = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message, signature },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects expired nonces, wrong signers, and wrong chains", async () => {
    const account = newAccount();
    const nonce = await fetchNonce(t.app, account.address);
    // Expire the row directly: no clock injection needed.
    await t.t.db.execute(
      sql`UPDATE auth_nonces SET expires_at = now() - interval '1 minute' WHERE nonce = ${nonce}`,
    );
    const expiredMessage = siweMessage({ address: account.address, nonce });
    const expiredSig = await account.signMessage({ message: expiredMessage });
    const expired = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message: expiredMessage, signature: expiredSig },
    });
    expect(expired.statusCode).toBe(401);

    const other = newAccount();
    const nonce2 = await fetchNonce(t.app, account.address);
    const message2 = siweMessage({ address: account.address, nonce: nonce2 });
    const wrongSig = await other.signMessage({ message: message2 });
    const wrongSigner = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message: message2, signature: wrongSig },
    });
    expect(wrongSigner.statusCode).toBe(401);

    const nonce3 = await fetchNonce(t.app, account.address);
    const wrongChain = siweMessage({ address: account.address, nonce: nonce3, chainId: 137 });
    const chainSig = await account.signMessage({ message: wrongChain });
    const chain = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message: wrongChain, signature: chainSig },
    });
    expect(chain.statusCode).toBe(401);
  });

  it("treats addresses differing only in case as one identity", async () => {
    const account = newAccount();
    const first = await (async () => {
      const nonce = await fetchNonce(t.app, account.address);
      const message = siweMessage({ address: account.address, nonce });
      const signature = await account.signMessage({ message });
      return t.app.inject({
        method: "POST",
        url: "/auth/wallet/verify",
        payload: { message, signature },
      });
    })();
    const second = await (async () => {
      const nonce = await fetchNonce(t.app, account.address.toLowerCase());
      const message = siweMessage({ address: account.address.toLowerCase(), nonce });
      const signature = await account.signMessage({ message });
      return t.app.inject({
        method: "POST",
        url: "/auth/wallet/verify",
        payload: { message, signature },
      });
    })();
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const a = (first.json() as { data: { user: { id: string } } }).data.user.id;
    const b = (second.json() as { data: { user: { id: string } } }).data.user.id;
    expect(a).toBe(b);
  });

  it("rejects malformed addresses and signatures at the boundary", async () => {
    const badAddress = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/nonce",
      payload: { address: "not-an-address" },
    });
    expect(badAddress.statusCode).toBe(400);

    const account = newAccount();
    const nonce = await fetchNonce(t.app, account.address);
    const message = siweMessage({ address: account.address, nonce });
    const badSig = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message, signature: "definitely-not-hex" },
    });
    expect(badSig.statusCode).toBe(401);
  });

  it("audits sign-in failures without recording signatures", async () => {
    const account = newAccount();
    const nonce = await fetchNonce(t.app, account.address);
    const message = siweMessage({ address: account.address, nonce });
    await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message, signature: "0xdeadbeef" },
    });
    const rows = await t.t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.wallet.verify"));
    const denied = rows.filter((r) => r.outcome === "denied");
    expect(denied.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(denied);
    expect(serialized).not.toContain("deadbeef");
  });
});

describe("EIP-1271 smart-contract wallets (W4)", () => {
  it("accepts a contract wallet when the verifier returns the magic value", async () => {
    const contractAddress = "0x000000000000000000000000000000000000c0de";
    let seen: { address: string } | null = null;
    t.deps.contractVerifier = async (input) => {
      seen = { address: input.address };
      return true;
    };
    const nonce = await fetchNonce(t.app, contractAddress);
    const message = siweMessage({ address: contractAddress, nonce });
    const res = await t.app.inject({
      method: "POST",
      url: "/auth/wallet/verify",
      payload: { message, signature: `0x${"ab".repeat(65)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(seen).toEqual({ address: contractAddress.toLowerCase() });
    t.deps.contractVerifier = undefined;
  });

  it("fails closed on non-magic returns, verifier errors, and timeouts", async () => {
    const contractAddress = "0x000000000000000000000000000000000000c0de";
    async function attempt(verifier: NonNullable<typeof t.deps.contractVerifier>): Promise<number> {
      t.deps.contractVerifier = verifier;
      try {
        const nonce = await fetchNonce(t.app, contractAddress);
        const message = siweMessage({ address: contractAddress, nonce });
        const res = await t.app.inject({
          method: "POST",
          url: "/auth/wallet/verify",
          payload: { message, signature: `0x${"ab".repeat(65)}` },
        });
        return res.statusCode;
      } finally {
        t.deps.contractVerifier = undefined;
      }
    }
    expect(await attempt(async () => false)).toBe(401);
    expect(
      await attempt(async () => {
        throw new Error("rpc down");
      }),
    ).toBe(401);
    expect(await attempt(async () => new Promise<boolean>(() => {}))).toBe(401);
  });
});

describe("nonce rate limiting (W8)", () => {
  it("rejects issuance past the per-address limit", async () => {
    const limited = await buildTestApp({ nonceLimiter: new RateLimiter(2, 60_000) });
    try {
      const account = newAccount();
      const payload = { address: account.address };
      const first = await limited.app.inject({
        method: "POST",
        url: "/auth/wallet/nonce",
        payload,
      });
      const second = await limited.app.inject({
        method: "POST",
        url: "/auth/wallet/nonce",
        payload,
      });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      const third = await limited.app.inject({
        method: "POST",
        url: "/auth/wallet/nonce",
        payload,
      });
      expect(third.statusCode).toBe(429);
      expect((third.json() as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    } finally {
      await limited.t.close();
    }
  });
});
