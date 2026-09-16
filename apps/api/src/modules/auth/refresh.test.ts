import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { refreshTokens, users } from "../../db/schema/index.js";
import { hashToken } from "./tokens.js";
import { authHeader, buildTestApp, signInFresh, type TestApp } from "../test-app.js";

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
}, 60000);

afterAll(async () => {
  await t.t.close();
});

describe("refresh rotation and reuse detection (W6)", () => {
  it("rotates on every use: the new pair works, the old refresh does not", async () => {
    const user = await signInFresh(t.app);
    const res = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: user.refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: { accessToken: string; refreshToken: string } }).data;
    expect(data.refreshToken).not.toBe(user.refreshToken);

    const me = await t.app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(data.accessToken),
    });
    expect(me.statusCode).toBe(200);

    const replay = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: user.refreshToken },
    });
    // The old token was already rotated once above, so this is reuse.
    expect(replay.statusCode).toBe(401);
  });

  it("treats reuse as compromise: family revoked and token_version bumped", async () => {
    const user = await signInFresh(t.app);
    const before = await t.t.db.select().from(users).where(eq(users.id, user.userId));
    const verBefore = before[0]?.tokenVersion ?? 0;

    const first = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: user.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const rotated = (first.json() as { data: { accessToken: string; refreshToken: string } }).data;

    // Attacker replays the stolen original.
    const reuse = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: user.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);

    // The legitimate client's rotated token is dead too: whole family gone.
    const legitimate = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: rotated.refreshToken },
    });
    expect(legitimate.statusCode).toBe(401);

    const rows = await t.t.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(rotated.refreshToken)));
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);

    const after = await t.t.db.select().from(users).where(eq(users.id, user.userId));
    expect(after[0]?.tokenVersion ?? 0).toBeGreaterThan(verBefore);

    // The pre-reuse access token no longer verifies: stale ver.
    const me = await t.app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(rotated.accessToken),
    });
    expect(me.statusCode).toBe(401);
  });

  it("rejects expired and unknown refresh tokens", async () => {
    const user = await signInFresh(t.app);
    await t.t.db.execute(
      sql`UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = ${hashToken(user.refreshToken)}`,
    );
    const expired = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: user.refreshToken },
    });
    expect(expired.statusCode).toBe(401);

    const unknown = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "00".repeat(32) },
    });
    expect(unknown.statusCode).toBe(401);
  });

  it("logs out by revoking the family; unknown tokens still return success", async () => {
    const user = await signInFresh(t.app);
    const out = await t.app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: user.refreshToken },
    });
    expect(out.statusCode).toBe(200);
    const after = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: user.refreshToken },
    });
    // Revoked-then-presented is reuse-shaped: denied either way.
    expect(after.statusCode).toBe(401);

    const unknown = await t.app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: "00".repeat(32) },
    });
    expect(unknown.statusCode).toBe(200);
  });
});
