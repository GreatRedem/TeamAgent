import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agentRuns,
  auditLogs,
  knowledgeBases,
  models,
  permissions,
  roles,
  tools,
} from "../../db/schema/index.js";
import {
  authHeader,
  buildTestApp,
  signInFresh,
  type SignedInUser,
  type TestApp,
} from "../test-app.js";

let t: TestApp;
let owner: SignedInUser;
let managerUser: SignedInUser;
let memberUser: SignedInUser;
let outsider: SignedInUser;
let teamId: string;
let memberRoleId: string;
let managerRoleId: string;

async function permissionId(name: string): Promise<string> {
  const rows = await t.t.db.select().from(permissions).where(eq(permissions.name, name));
  const row = rows[0];
  if (row === undefined) throw new Error(`permission ${name} not seeded`);
  return row.id;
}

beforeAll(async () => {
  t = await buildTestApp();
  owner = await signInFresh(t.app);
  managerUser = await signInFresh(t.app);
  memberUser = await signInFresh(t.app);
  outsider = await signInFresh(t.app);
  const created = await t.app.inject({
    method: "POST",
    url: "/teams",
    headers: authHeader(owner.accessToken),
    payload: { name: "Agent Team" },
  });
  teamId = (created.json() as { data: { id: string } }).data.id;
  const roleRows = await t.t.db.select().from(roles);
  memberRoleId = roleRows.find((r) => r.name === "member" && r.teamId === null)?.id ?? "";
  managerRoleId = roleRows.find((r) => r.name === "manager" && r.teamId === null)?.id ?? "";
  await t.app.inject({
    method: "POST",
    url: `/teams/${teamId}/members`,
    headers: authHeader(owner.accessToken),
    payload: { user_id: memberUser.userId, role_id: memberRoleId },
  });
  await t.app.inject({
    method: "POST",
    url: `/teams/${teamId}/members`,
    headers: authHeader(owner.accessToken),
    payload: { user_id: managerUser.userId, role_id: managerRoleId },
  });
}, 60000);

afterAll(async () => {
  await t.t.close();
});

async function createAgent(token: string, payload: Record<string, unknown>): Promise<string> {
  const res = await t.app.inject({
    method: "POST",
    url: `/teams/${teamId}/agents`,
    headers: authHeader(token),
    payload,
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { data: { id: string } }).data.id;
}

describe("agent catalogs", () => {
  it("returns active model metadata in the standard envelope", async () => {
    const activeId = randomUUID();
    await t.t.db.insert(models).values([
      {
        id: activeId,
        provider: "catalog-provider",
        name: "catalog-active",
        version: "1",
        capabilities: { chat: true },
      },
      {
        id: randomUUID(),
        provider: "catalog-provider",
        name: "catalog-disabled",
        version: "1",
        status: "disabled",
      },
      {
        id: randomUUID(),
        provider: "catalog-provider",
        name: "catalog-deprecated",
        version: "1",
        status: "deprecated",
      },
    ]);
    const res = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/catalogs`,
      headers: authHeader(managerUser.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        models: [
          { id: activeId, name: "catalog-active", provider: "catalog-provider", status: "active" },
        ],
        permissions: expect.any(Array),
      },
      error: null,
      request_id: expect.any(String),
    });
  });

  it("returns permission metadata including null descriptions and excludes unsafe permissions", async () => {
    const agentOnlyId = randomUUID();
    const adminBothId = randomUUID();
    const adminAgentId = randomUUID();
    await t.t.db.insert(permissions).values([
      {
        id: agentOnlyId,
        name: "catalog.read",
        resource: "catalog",
        action: "read",
        riskTier: "read_only",
        appliesTo: "agent",
        description: null,
      },
      {
        id: adminBothId,
        name: "catalog.manage",
        resource: "catalog",
        action: "manage",
        riskTier: "admin",
        appliesTo: "both",
      },
      {
        id: adminAgentId,
        name: "catalog.admin",
        resource: "catalog",
        action: "admin",
        riskTier: "admin",
        appliesTo: "agent",
      },
    ]);
    const res = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/catalogs`,
      headers: authHeader(managerUser.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as {
      data: {
        permissions: Array<{
          id: string;
          name: string;
          description: string | null;
          risk_tier: string;
        }>;
      };
    };
    const rows = await t.t.db.select().from(permissions).orderBy(permissions.name, permissions.id);
    expect(data.data.permissions).toEqual(
      rows
        .filter((p) => p.riskTier !== "admin" && ["agent", "both"].includes(p.appliesTo))
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          risk_tier: p.riskTier,
        })),
    );
    expect(data.data.permissions).toEqual(
      expect.arrayContaining([
        { id: agentOnlyId, name: "catalog.read", description: null, risk_tier: "read_only" },
        {
          id: await permissionId("message.reply"),
          name: "message.reply",
          description: "Reply on the conversation the request arrived on",
          risk_tier: "reply",
        },
        {
          id: await permissionId("message.send"),
          name: "message.send",
          description: "Send to a destination other than the origin",
          risk_tier: "write",
        },
      ]),
    );
    const ids = data.data.permissions.map((p) => p.id);
    for (const id of [
      adminBothId,
      adminAgentId,
      await permissionId("team.manage"),
      await permissionId("settings.view"),
    ]) {
      expect(ids).not.toContain(id);
    }
  });

  it("requires authentication", async () => {
    const res = await t.app.inject({ method: "GET", url: `/teams/${teamId}/agents/catalogs` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("denies members with agent.use but without agent.edit", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/catalogs`,
      headers: authHeader(memberUser.accessToken),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, data: null, error: { code: "FORBIDDEN" } });
  });

  it("hides foreign teams even when the caller can edit agents in another team", async () => {
    const created = await t.app.inject({
      method: "POST",
      url: "/teams",
      headers: authHeader(outsider.accessToken),
      payload: { name: "Foreign Catalog Team" },
    });
    expect(created.statusCode).toBe(200);
    const foreignTeamId = (created.json() as { data: { id: string } }).data.id;
    for (const requestedTeamId of [foreignTeamId, randomUUID()]) {
      const res = await t.app.inject({
        method: "GET",
        url: `/teams/${requestedTeamId}/agents/catalogs`,
        headers: authHeader(managerUser.accessToken),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Team not found.", details: {} },
      });
    }
  });
});

describe("agent CRUD", () => {
  it("gates creation on agent.create and validates the name", async () => {
    const denied = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/agents`,
      headers: authHeader(memberUser.accessToken),
      payload: { name: "Support Agent" },
    });
    expect(denied.statusCode).toBe(403);

    const blank = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/agents`,
      headers: authHeader(managerUser.accessToken),
      payload: { name: "   " },
    });
    expect(blank.statusCode).toBe(400);

    const agentId = await createAgent(managerUser.accessToken, { name: "Support Agent" });
    const fetched = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(memberUser.accessToken),
    });
    expect(fetched.statusCode).toBe(200);
    expect((fetched.json() as { data: { name: string } }).data.name).toBe("Support Agent");
  });

  it("rejects unknown models and accepts a registered one", async () => {
    const unknown = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/agents`,
      headers: authHeader(managerUser.accessToken),
      payload: { name: "Bad Model", model_id: randomUUID() },
    });
    expect(unknown.statusCode).toBe(400);

    const modelId = randomUUID();
    await t.t.db
      .insert(models)
      .values({ id: modelId, provider: "test", name: "mini", version: "1" });
    const agentId = await createAgent(managerUser.accessToken, {
      name: "Modelled",
      model_id: modelId,
    });
    const fetched = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(memberUser.accessToken),
    });
    expect((fetched.json() as { data: { model_id: string } }).data.model_id).toBe(modelId);
  });

  it("updates, archives by status, deletes, and hides cross-team reads", async () => {
    const agentId = await createAgent(managerUser.accessToken, { name: "Ephemeral" });
    const patched = await t.app.inject({
      method: "PATCH",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(managerUser.accessToken),
      payload: { system_prompt: "Be helpful.", status: "disabled" },
    });
    expect(patched.statusCode).toBe(200);

    const badStatus = await t.app.inject({
      method: "PATCH",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(managerUser.accessToken),
      payload: { status: "exploding" },
    });
    expect(badStatus.statusCode).toBe(400);

    const crossTeam = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(outsider.accessToken),
    });
    expect(crossTeam.statusCode).toBe(404);

    const removed = await t.app.inject({
      method: "DELETE",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(managerUser.accessToken),
    });
    expect(removed.statusCode).toBe(200);

    const gone = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(managerUser.accessToken),
    });
    expect(gone.statusCode).toBe(404);

    const audits = await t.t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "agent.create"));
    expect(audits.some((a) => a.outcome === "allowed" && a.teamId === teamId)).toBe(true);
  });

  it("refuses to delete an agent with runs", async () => {
    const agentId = await createAgent(managerUser.accessToken, { name: "Busy" });
    await t.t.db.insert(agentRuns).values({ id: randomUUID(), teamId, agentId });
    const removed = await t.app.inject({
      method: "DELETE",
      url: `/teams/${teamId}/agents/${agentId}`,
      headers: authHeader(managerUser.accessToken),
    });
    expect(removed.statusCode).toBe(409);
  });
});

describe("agent grants (docs/15-api.md section 6)", () => {
  it("rejects admin-tier and user-only permissions with FORBIDDEN", async () => {
    const agentId = await createAgent(managerUser.accessToken, { name: "Grant Guard" });

    const admin = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/permissions`,
      headers: authHeader(managerUser.accessToken),
      payload: { permission_ids: [await permissionId("team.manage")] },
    });
    expect(admin.statusCode).toBe(403);

    const userOnly = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/permissions`,
      headers: authHeader(managerUser.accessToken),
      payload: { permission_ids: [await permissionId("settings.view")] },
    });
    expect(userOnly.statusCode).toBe(403);

    const okGrants = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/permissions`,
      headers: authHeader(managerUser.accessToken),
      payload: {
        permission_ids: [await permissionId("knowledge.read"), await permissionId("message.reply")],
      },
    });
    expect(okGrants.statusCode).toBe(200);
    const data = okGrants.json() as { data: { permission_ids: string[] } };
    expect(data.data.permission_ids).toHaveLength(2);
  });

  it("scopes tool and knowledge grants to the team", async () => {
    const agentId = await createAgent(managerUser.accessToken, { name: "Scoped" });
    const toolId = randomUUID();
    await t.t.db
      .insert(tools)
      .values({ id: toolId, teamId: null, name: `sys-${toolId}`, riskTier: "read_only" });

    const granted = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/tools`,
      headers: authHeader(managerUser.accessToken),
      payload: { tool_ids: [toolId] },
    });
    expect(granted.statusCode).toBe(200);

    const unknown = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/tools`,
      headers: authHeader(managerUser.accessToken),
      payload: { tool_ids: [randomUUID()] },
    });
    expect(unknown.statusCode).toBe(400);

    const kbId = randomUUID();
    await t.t.db.insert(knowledgeBases).values({ id: kbId, teamId, name: "kb" });
    const kbGranted = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/knowledge-bases`,
      headers: authHeader(managerUser.accessToken),
      payload: { knowledge_base_ids: [kbId] },
    });
    expect(kbGranted.statusCode).toBe(200);

    const foreignKb = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/knowledge-bases`,
      headers: authHeader(managerUser.accessToken),
      payload: { knowledge_base_ids: [randomUUID()] },
    });
    expect(foreignKb.statusCode).toBe(400);
  });

  it("enforces R4 on source grants and exposes the full grant set", async () => {
    const agentId = await createAgent(managerUser.accessToken, { name: "Egress" });
    const source = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources`,
      headers: authHeader(owner.accessToken),
      payload: { type: "email", name: "Ops Mail" },
    });
    const sourceId = (source.json() as { data: { id: string } }).data.id;
    const connection = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/sources/${sourceId}/connections`,
      headers: authHeader(owner.accessToken),
      payload: { name: "ops-conn" },
    });
    const connectionId = (connection.json() as { data: { id: string } }).data.id;

    const emptyInitiate = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/sources`,
      headers: authHeader(managerUser.accessToken),
      payload: {
        sources: [{ source_connection_id: connectionId, can_initiate: true }],
      },
    });
    expect(emptyInitiate.statusCode).toBe(400);

    const valid = await t.app.inject({
      method: "PUT",
      url: `/teams/${teamId}/agents/${agentId}/sources`,
      headers: authHeader(managerUser.accessToken),
      payload: {
        sources: [
          {
            source_connection_id: connectionId,
            can_reply: true,
            can_initiate: true,
            allowed_destinations: ["ops@example.com"],
          },
        ],
      },
    });
    expect(valid.statusCode).toBe(200);

    const grants = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/${agentId}/grants`,
      headers: authHeader(managerUser.accessToken),
    });
    expect(grants.statusCode).toBe(200);
    const body = grants.json() as {
      data: { sources: Array<{ can_initiate: boolean; allowed_destinations: string[] }> };
    };
    expect(body.data.sources[0]?.can_initiate).toBe(true);
    expect(body.data.sources[0]?.allowed_destinations).toEqual(["ops@example.com"]);

    const memberGrants = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/agents/${agentId}/grants`,
      headers: authHeader(memberUser.accessToken),
    });
    expect(memberGrants.statusCode).toBe(403);
  });
});
