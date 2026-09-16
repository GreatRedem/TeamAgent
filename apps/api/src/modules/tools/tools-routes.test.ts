import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roles } from "../../db/schema/index.js";
import {
  authHeader,
  buildTestApp,
  signInFresh,
  type SignedInUser,
  type TestApp,
} from "../test-app.js";
import type { HttpGet } from "./registry.js";

const fakeGet: HttpGet = async () => ({
  status: 200,
  headers: {},
  body: "fetched",
  truncated: false,
});
const publicDns = async (host: string): Promise<string[]> => {
  if (host === "example.com") return ["93.184.216.34"];
  throw new Error("NXDOMAIN");
};

let t: TestApp;
let owner: SignedInUser;
let memberUser: SignedInUser;
let teamId: string;
let memberRoleId: string;

beforeAll(async () => {
  t = await buildTestApp({ toolHandlerDeps: { httpGet: fakeGet, resolveDns: publicDns } });
  owner = await signInFresh(t.app);
  memberUser = await signInFresh(t.app);
  const created = await t.app.inject({
    method: "POST",
    url: "/teams",
    headers: authHeader(owner.accessToken),
    payload: { name: "Tool Team" },
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

describe("tool registry routes", () => {
  it("requires an explicit risk_tier and a known handler, and blocks member registration", async () => {
    const memberAttempt = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools`,
      headers: authHeader(memberUser.accessToken),
      payload: { name: "http.fetch", risk_tier: "read_only" },
    });
    expect(memberAttempt.statusCode).toBe(403);

    const unknown = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools`,
      headers: authHeader(owner.accessToken),
      payload: { name: "teleport.deliver", risk_tier: "write" },
    });
    expect(unknown.statusCode).toBe(400);

    const missingTier = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools`,
      headers: authHeader(owner.accessToken),
      payload: { name: "http.fetch" },
    });
    expect(missingTier.statusCode).toBe(400);
  });

  it("registers, lists, executes, rejects bad args, and removes", async () => {
    const registered = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools`,
      headers: authHeader(owner.accessToken),
      payload: { name: "http.fetch", risk_tier: "read_only" },
    });
    expect(registered.statusCode).toBe(200);
    const toolId = (registered.json() as { data: { id: string } }).data.id;

    const duplicate = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools`,
      headers: authHeader(owner.accessToken),
      payload: { name: "http.fetch", risk_tier: "read_only" },
    });
    expect(duplicate.statusCode).toBe(409);

    const list = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/tools`,
      headers: authHeader(owner.accessToken),
    });
    expect(list.statusCode).toBe(200);

    const executed = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools/${toolId}/execute`,
      headers: authHeader(owner.accessToken),
      payload: { arguments: { url: "https://example.com/" } },
    });
    expect(executed.statusCode).toBe(200);
    const output = (executed.json() as { data: { output: { body: string } } }).data.output;
    expect(output.body).toBe("fetched");

    const badArgs = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools/${toolId}/execute`,
      headers: authHeader(owner.accessToken),
      payload: { arguments: { url: "https://example.com/", extra: true } },
    });
    expect(badArgs.statusCode).toBe(403);

    const memberExecute = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools/${toolId}/execute`,
      headers: authHeader(memberUser.accessToken),
      payload: { arguments: { url: "https://example.com/" } },
    });
    // Members hold tool.execute but not browser.read: the gate holds.
    expect(memberExecute.statusCode).toBe(403);

    const removed = await t.app.inject({
      method: "DELETE",
      url: `/teams/${teamId}/tools/${toolId}`,
      headers: authHeader(owner.accessToken),
    });
    expect(removed.statusCode).toBe(200);

    const gone = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/tools/${toolId}/execute`,
      headers: authHeader(owner.accessToken),
      payload: { arguments: { url: "https://example.com/" } },
    });
    expect(gone.statusCode).toBe(404);
  });
});
