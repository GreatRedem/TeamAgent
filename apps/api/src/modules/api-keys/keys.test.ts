import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { apiKeys, roles } from "../../db/schema/index.js";
import { hashToken } from "../auth/tokens.js";
import {
  authHeader,
  buildTestApp,
  signInFresh,
  type SignedInUser,
  type TestApp,
} from "../test-app.js";

let t: TestApp;
let owner: SignedInUser;
let memberUser: SignedInUser;
let teamId: string;
let memberRoleId: string;

beforeAll(async () => {
  t = await buildTestApp();
  owner = await signInFresh(t.app);
  memberUser = await signInFresh(t.app);

  const created = await t.app.inject({
    method: "POST",
    url: "/teams",
    headers: authHeader(owner.accessToken),
    payload: { name: "Key Team" },
  });
  teamId = (created.json() as { data: { id: string } }).data.id;

  const roleRows = await t.t.db.select().from(roles);
  memberRoleId = roleRows.find((r) => r.name === "member" && r.teamId === null)?.id ?? "";
  await t.app.inject({
    method: "POST",
    url: `/teams/${teamId}/members`,
    headers: authHeader(owner.accessToken),
    payload: { user_id: memberUser.userId, role_id: memberRoleId },
  });
}, 60000);

afterAll(async () => {
  await t.t.close();
});

async function issueKey(
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await t.app.inject({
    method: "POST",
    url: `/teams/${teamId}/api-keys`,
    headers: authHeader(token),
    payload: body,
  });
  return { status: res.statusCode, data: (res.json() as { data: Record<string, unknown> }).data };
}

describe("API keys and machine trust (T16)", () => {
  it("issues a default-untrusted key, returned in full exactly once", async () => {
    const { status, data } = await issueKey(owner.accessToken, { name: "relay" });
    expect(status).toBe(200);
    expect(data.trust_ceiling).toBe("untrusted");
    expect(typeof data.key).toBe("string");
    expect((data.key as string).startsWith("nk_test_")).toBe(true);

    const list = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/api-keys`,
      headers: authHeader(owner.accessToken),
    });
    expect(list.statusCode).toBe(200);
    const serialized = list.body;
    expect(serialized).not.toContain(data.key as string);
    expect(serialized).not.toContain("key_hash");
  });

  it("rejects trusted ceilings and unbound user_input keys at issue time", async () => {
    const trusted = await issueKey(owner.accessToken, { name: "x", trust_ceiling: "trusted" });
    expect(trusted.status).toBe(400);

    const unbound = await issueKey(owner.accessToken, { name: "y", trust_ceiling: "user_input" });
    expect(unbound.status).toBe(400);

    const outsider = await signInFresh(t.app);
    const nonMember = await issueKey(owner.accessToken, {
      name: "z",
      trust_ceiling: "user_input",
      bound_user_id: outsider.userId,
    });
    expect(nonMember.status).toBe(400);
  });

  it("a default key is authenticated but unprivileged: scope reads pass, grants fail", async () => {
    const { data } = await issueKey(owner.accessToken, { name: "default-caller" });
    const key = data.key as string;

    const read = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}`,
      headers: authHeader(key),
    });
    expect(read.statusCode).toBe(200);

    const write = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/members`,
      headers: authHeader(key),
      payload: { user_id: owner.userId, role_id: memberRoleId },
    });
    expect(write.statusCode).toBe(403);

    const me = await t.app.inject({ method: "GET", url: "/auth/me", headers: authHeader(key) });
    expect(me.statusCode).toBe(403);
  });

  it("a user_input-bound key acts with its user's grants, and only those", async () => {
    const boundToOwner = await issueKey(owner.accessToken, {
      name: "owner-script",
      trust_ceiling: "user_input",
      bound_user_id: owner.userId,
    });
    expect(boundToOwner.status).toBe(200);

    const newcomer = await signInFresh(t.app);
    const add = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/members`,
      headers: authHeader(boundToOwner.data.key as string),
      payload: { user_id: newcomer.userId, role_id: memberRoleId },
    });
    expect(add.statusCode).toBe(200);

    const boundToMember = await issueKey(owner.accessToken, {
      name: "member-script",
      trust_ceiling: "user_input",
      bound_user_id: memberUser.userId,
    });
    const denied = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/members`,
      headers: authHeader(boundToMember.data.key as string),
      payload: { user_id: newcomer.userId, role_id: memberRoleId },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("revocation and expiry take effect immediately", async () => {
    const { data } = await issueKey(owner.accessToken, { name: "doomed" });
    const key = data.key as string;
    const before = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}`,
      headers: authHeader(key),
    });
    expect(before.statusCode).toBe(200);

    const revoke = await t.app.inject({
      method: "DELETE",
      url: `/teams/${teamId}/api-keys/${data.id as string}`,
      headers: authHeader(owner.accessToken),
    });
    expect(revoke.statusCode).toBe(200);

    const after = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}`,
      headers: authHeader(key),
    });
    expect(after.statusCode).toBe(401);

    const { data: expiring } = await issueKey(owner.accessToken, { name: "short-lived" });
    await t.t.db.execute(
      sql`UPDATE api_keys SET expires_at = now() - interval '1 minute' WHERE key_hash = ${hashToken(expiring.key as string)}`,
    );
    const expired = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}`,
      headers: authHeader(expiring.key as string),
    });
    expect(expired.statusCode).toBe(401);
  });

  it("never labels a key-authenticated principal trusted", async () => {
    const rows = await t.t.db.select().from(apiKeys);
    for (const row of rows) {
      expect(["untrusted", "user_input"]).toContain(row.trustCeiling);
    }
  });
});
