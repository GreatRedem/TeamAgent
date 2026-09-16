import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, roles } from "../../db/schema/index.js";
import {
  authHeader,
  buildTestApp,
  signInFresh,
  type SignedInUser,
  type TestApp,
} from "../test-app.js";

const WEBHOOK_REF = "WH_TEST_SOURCE";
const WEBHOOK_SECRET = "test-webhook-secret-value";

let t: TestApp;
let owner: SignedInUser;
let memberUser: SignedInUser;
let teamId: string;
let memberRoleId: string;

function signBody(rawBody: string, timestamp: number): string {
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

beforeAll(async () => {
  process.env[WEBHOOK_REF] = WEBHOOK_SECRET;
  t = await buildTestApp();
  owner = await signInFresh(t.app);
  memberUser = await signInFresh(t.app);
  const created = await t.app.inject({
    method: "POST",
    url: "/teams",
    headers: authHeader(owner.accessToken),
    payload: { name: "Source Team" },
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
  delete process.env[WEBHOOK_REF];
  await t.t.close();
});

describe("sources and connections", () => {
  it("gates registration on source.connect and reads on source.read", async () => {
    const denied = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources`,
      headers: authHeader(memberUser.accessToken),
      payload: { type: "telegram", name: "Support Bot" },
    });
    expect(denied.statusCode).toBe(403);

    const created = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources`,
      headers: authHeader(owner.accessToken),
      payload: { type: "telegram", name: "Support Bot", webhook_secret_ref: WEBHOOK_REF },
    });
    expect(created.statusCode).toBe(200);
    const sourceId = (created.json() as { data: { id: string } }).data.id;

    const list = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/sources`,
      headers: authHeader(memberUser.accessToken),
    });
    expect(list.statusCode).toBe(200);

    const crossTeam = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/sources/${sourceId}`,
      headers: authHeader((await signInFresh(t.app)).accessToken),
    });
    expect(crossTeam.statusCode).toBe(404);
  });

  it("manages connections with explicit ownership", async () => {
    const created = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources`,
      headers: authHeader(owner.accessToken),
      payload: { type: "email", name: "Inbox" },
    });
    const sourceId = (created.json() as { data: { id: string } }).data.id;

    const missingUser = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources/${sourceId}/connections`,
      headers: authHeader(owner.accessToken),
      payload: { name: "c1", owner_scope: "user" },
    });
    expect(missingUser.statusCode).toBe(400);

    const teamConn = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources/${sourceId}/connections`,
      headers: authHeader(owner.accessToken),
      payload: { name: "team-inbox" },
    });
    expect(teamConn.statusCode).toBe(200);
    const connectionId = (teamConn.json() as { data: { id: string } }).data.id;

    const userConn = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources/${sourceId}/connections`,
      headers: authHeader(owner.accessToken),
      payload: { name: "member-inbox", owner_scope: "user", user_id: memberUser.userId },
    });
    expect(userConn.statusCode).toBe(200);

    const removed = await t.app.inject({
      method: "DELETE",
      url: `/teams/${teamId}/sources/${sourceId}/connections/${connectionId}`,
      headers: authHeader(owner.accessToken),
    });
    expect(removed.statusCode).toBe(200);

    const audits = await t.t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "source.connect"));
    expect(audits.some((a) => a.outcome === "allowed" && a.teamId === teamId)).toBe(true);
  });
});

describe("webhook ingress (T7)", () => {
  async function createHookedSource(): Promise<string> {
    const created = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources`,
      headers: authHeader(owner.accessToken),
      payload: { type: "webhook", name: "Hook", webhook_secret_ref: WEBHOOK_REF },
    });
    return (created.json() as { data: { id: string } }).data.id;
  }

  it("accepts a valid signed delivery and audits it", async () => {
    const sourceId = await createHookedSource();
    const rawBody = JSON.stringify({ event: "message.received", text: "hello" });
    const res = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources/${sourceId}/webhook`,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": signBody(rawBody, Math.floor(Date.now() / 1000)),
      },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(200);
    const audits = await t.t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "source.webhook.ingress"));
    expect(audits.some((a) => a.outcome === "allowed")).toBe(true);
  });

  it("rejects bad signatures, stale timestamps, and replays", async () => {
    const sourceId = await createHookedSource();
    const rawBody = JSON.stringify({ event: "message.received" });
    const now = Math.floor(Date.now() / 1000);
    const post = (signature: string): Promise<{ statusCode: number }> =>
      t.app.inject({
        method: "POST",
        url: `/teams/${teamId}/sources/${sourceId}/webhook`,
        headers: { "content-type": "application/json", "x-webhook-signature": signature },
        payload: rawBody,
      }) as Promise<{ statusCode: number }>;

    expect((await post("t=123,v1=deadbeef")).statusCode).toBe(401);
    expect((await post(signBody(rawBody, now - 3600))).statusCode).toBe(401);

    const fresh = signBody(rawBody, now);
    expect((await post(fresh)).statusCode).toBe(200);
    expect((await post(fresh)).statusCode).toBe(401);
  });

  it("returns 404 for unknown sources and 400 for unconfigured ones", async () => {
    const missing = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources/00000000-0000-0000-0000-000000000000/webhook`,
      headers: { "content-type": "application/json", "x-webhook-signature": "t=1,v1=aa" },
      payload: JSON.stringify({}),
    });
    expect(missing.statusCode).toBe(404);

    const plain = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources`,
      headers: authHeader(owner.accessToken),
      payload: { type: "webhook", name: "NoHook" },
    });
    const plainId = (plain.json() as { data: { id: string } }).data.id;
    const unconfigured = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources/${plainId}/webhook`,
      headers: { "content-type": "application/json", "x-webhook-signature": "t=1,v1=aa" },
      payload: JSON.stringify({}),
    });
    expect(unconfigured.statusCode).toBe(400);
  });
});
