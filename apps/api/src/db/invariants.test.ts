import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agentPermissions,
  agentRuns,
  agentSources,
  agents,
  apiKeys,
  knowledgeBases,
  knowledgeItems,
  permissions,
  roles,
  sourceConnections,
  sources,
  teams,
  tools,
  users,
  workflowRuns,
  workflowVersions,
  workflows,
} from "./schema/index.js";
import { createTestDb, type TestDb } from "./harness.js";
import { PERMISSION_CATALOGUE, seedPermissions, seedSystemRoles } from "./seed.js";
import {
  setWorkflowCurrentVersion,
  WorkflowVersionMismatchError,
} from "../modules/workflows/versions.js";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await seedPermissions(t.db);
  await seedSystemRoles(t.db);
}, 60000);

afterAll(async () => {
  await t.close();
});

async function makeTeam(suffix: string): Promise<{ ownerId: string; teamId: string }> {
  const ownerId = randomUUID();
  await t.db.insert(users).values({ id: ownerId });
  const teamId = randomUUID();
  await t.db.insert(teams).values({ id: teamId, name: `team-${suffix}`, ownerId });
  return { ownerId, teamId };
}

async function makeAgent(teamId: string, name: string): Promise<string> {
  const id = randomUUID();
  await t.db.insert(agents).values({ id, teamId, name });
  return id;
}

async function permissionId(name: string): Promise<string> {
  const rows = await t.db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.name, name));
  const row = rows[0];
  if (row === undefined) throw new Error(`permission ${name} not seeded`);
  return row.id;
}

async function makeSourceConnection(teamId: string): Promise<string> {
  const sourceId = randomUUID();
  await t.db
    .insert(sources)
    .values({ id: sourceId, teamId, kind: "webhook", name: `src-${sourceId}` });
  const connectionId = randomUUID();
  await t.db.insert(sourceConnections).values({
    id: connectionId,
    teamId,
    sourceId,
    name: `conn-${connectionId}`,
  });
  return connectionId;
}

describe("permission catalogue seed", () => {
  it("seeds all 48 permissions from docs/07 with valid tiers", async () => {
    const rows = await t.db.select().from(permissions);
    expect(rows).toHaveLength(48);
    expect(PERMISSION_CATALOGUE).toHaveLength(48);
    const tiers = new Set(rows.map((r) => r.riskTier));
    expect([...tiers].sort()).toEqual(["admin", "read_only", "reply", "write"]);
  });

  it("is idempotent: reseeding changes nothing", async () => {
    await seedPermissions(t.db);
    await seedSystemRoles(t.db);
    const rows = await t.db.select().from(permissions);
    expect(rows).toHaveLength(48);
  });
});

describe("R1 — system role names are unique", () => {
  it("rejects two system roles with the same name", async () => {
    const name = `role-${randomUUID()}`;
    await t.db.insert(roles).values({ id: randomUUID(), teamId: null, name });
    await expect(
      t.db.insert(roles).values({ id: randomUUID(), teamId: null, name }),
    ).rejects.toThrow();
  });

  it("allows the same name in different teams and alongside a system role", async () => {
    const name = `role-${randomUUID()}`;
    const a = await makeTeam(`r1a-${name}`);
    const b = await makeTeam(`r1b-${name}`);
    await t.db.insert(roles).values({ id: randomUUID(), teamId: a.teamId, name });
    await t.db.insert(roles).values({ id: randomUUID(), teamId: b.teamId, name });
    await t.db.insert(roles).values({ id: randomUUID(), teamId: null, name });
  });
});

describe("R2 — system tool names are unique", () => {
  it("rejects two system tools with the same name", async () => {
    const name = `tool-${randomUUID()}`;
    await t.db
      .insert(tools)
      .values({ id: randomUUID(), teamId: null, name, riskTier: "read_only" });
    await expect(
      t.db.insert(tools).values({ id: randomUUID(), teamId: null, name, riskTier: "read_only" }),
    ).rejects.toThrow();
  });

  it("allows a team tool to share a system tool name", async () => {
    const name = `tool-${randomUUID()}`;
    const { teamId } = await makeTeam(`r2-${name}`);
    await t.db
      .insert(tools)
      .values({ id: randomUUID(), teamId: null, name, riskTier: "read_only" });
    await t.db.insert(tools).values({ id: randomUUID(), teamId, name, riskTier: "read_only" });
  });
});

/**
 * Drizzle wraps driver errors, so the R3 trigger text lives in the cause
 * chain rather than the top-level message. Asserting the chain proves the
 * trigger fired — not just that some error occurred.
 */
async function expectR3Rejection(promise: Promise<unknown>): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(Error);
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && messages.length < 5) {
    messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  expect(messages.join("\n")).toMatch(/R3/);
}

describe("R3 — agents never hold admin or user-only permissions", () => {
  it("rejects granting an admin-tier permission", async () => {
    const { teamId } = await makeTeam(`r3a-${randomUUID()}`);
    const agentId = await makeAgent(teamId, "r3-agent");
    await expectR3Rejection(
      t.db.insert(agentPermissions).values({
        id: randomUUID(),
        teamId,
        agentId,
        permissionId: await permissionId("team.manage"),
      }),
    );
  });

  it("rejects granting an applies_to=user permission even at read_only tier", async () => {
    const { teamId } = await makeTeam(`r3b-${randomUUID()}`);
    const agentId = await makeAgent(teamId, "r3-agent");
    await expectR3Rejection(
      t.db.insert(agentPermissions).values({
        id: randomUUID(),
        teamId,
        agentId,
        permissionId: await permissionId("settings.view"),
      }),
    );
  });

  it("allows a both/applies grant and rejects upgrading it to admin on update", async () => {
    const { teamId } = await makeTeam(`r3c-${randomUUID()}`);
    const agentId = await makeAgent(teamId, "r3-agent");
    const grantId = randomUUID();
    await t.db.insert(agentPermissions).values({
      id: grantId,
      teamId,
      agentId,
      permissionId: await permissionId("knowledge.read"),
    });
    await expectR3Rejection(
      t.db
        .update(agentPermissions)
        .set({ permissionId: await permissionId("agent.create") })
        .where(eq(agentPermissions.id, grantId)),
    );
  });
});

describe("R4 — can_initiate requires a non-empty allowlist", () => {
  it("rejects initiating egress with an empty allowlist", async () => {
    const { teamId } = await makeTeam(`r4a-${randomUUID()}`);
    const agentId = await makeAgent(teamId, "r4-agent");
    const connectionId = await makeSourceConnection(teamId);
    await expect(
      t.db.insert(agentSources).values({
        id: randomUUID(),
        teamId,
        agentId,
        sourceConnectionId: connectionId,
        canInitiate: true,
        allowedDestinations: [],
      }),
    ).rejects.toThrow();
  });

  it("rejects emptying the allowlist on update, allows a populated one", async () => {
    const { teamId } = await makeTeam(`r4b-${randomUUID()}`);
    const agentId = await makeAgent(teamId, "r4-agent");
    const connectionId = await makeSourceConnection(teamId);
    const rowId = randomUUID();
    await t.db.insert(agentSources).values({
      id: rowId,
      teamId,
      agentId,
      sourceConnectionId: connectionId,
      canInitiate: true,
      allowedDestinations: ["@ops-channel"],
    });
    await expect(
      t.db.update(agentSources).set({ allowedDestinations: [] }).where(eq(agentSources.id, rowId)),
    ).rejects.toThrow();
  });

  it("allows reply-only egress with an empty allowlist", async () => {
    const { teamId } = await makeTeam(`r4c-${randomUUID()}`);
    const agentId = await makeAgent(teamId, "r4-agent");
    const connectionId = await makeSourceConnection(teamId);
    await t.db.insert(agentSources).values({
      id: randomUUID(),
      teamId,
      agentId,
      sourceConnectionId: connectionId,
      canInitiate: false,
    });
  });
});

describe("R5 — current_version_id stays within its workflow", () => {
  it("sets the pointer for an own version, rejects a foreign one", async () => {
    const a = await makeTeam(`r5a-${randomUUID()}`);
    const b = await makeTeam(`r5b-${randomUUID()}`);
    const w1 = randomUUID();
    const w2 = randomUUID();
    await t.db.insert(workflows).values({ id: w1, teamId: a.teamId, name: "w1" });
    await t.db.insert(workflows).values({ id: w2, teamId: b.teamId, name: "w2" });
    const v1 = randomUUID();
    await t.db
      .insert(workflowVersions)
      .values({ id: v1, teamId: a.teamId, workflowId: w1, version: 1 });

    await setWorkflowCurrentVersion(t.db, w1, v1);
    const current = await t.db
      .select({ currentVersionId: workflows.currentVersionId })
      .from(workflows)
      .where(eq(workflows.id, w1));
    expect(current[0]?.currentVersionId).toBe(v1);

    await expect(setWorkflowCurrentVersion(t.db, w2, v1)).rejects.toThrow(
      WorkflowVersionMismatchError,
    );
    await expect(setWorkflowCurrentVersion(t.db, w1, randomUUID())).rejects.toThrow(
      WorkflowVersionMismatchError,
    );
  });
});

describe("column-level guarantees", () => {
  it("rejects a trusted trust_ceiling and an unbound user_input key", async () => {
    const { teamId } = await makeTeam(`keys-${randomUUID()}`);
    const base = {
      id: randomUUID(),
      teamId,
      keyHash: `h-${randomUUID()}`,
      prefix: "nk_test",
      name: "k",
    };
    await expect(
      t.db.$client.query(
        `INSERT INTO api_keys (id, team_id, key_hash, prefix, name, trust_ceiling) VALUES ($1,$2,$3,$4,$5,'trusted')`,
        [base.id, base.teamId, base.keyHash, base.prefix, base.name],
      ),
    ).rejects.toThrow();
    await expect(
      t.db.insert(apiKeys).values({ ...base, id: randomUUID(), trustCeiling: "user_input" }),
    ).rejects.toThrow();
  });

  it("defaults new keys to untrusted and accepts a bound user_input key", async () => {
    const { ownerId, teamId } = await makeTeam(`keys2-${randomUUID()}`);
    const id = randomUUID();
    await t.db.insert(apiKeys).values({
      id,
      teamId,
      keyHash: `h-${randomUUID()}`,
      prefix: "nk_test",
      name: "default",
    });
    const rows = await t.db.select().from(apiKeys).where(eq(apiKeys.id, id));
    expect(rows[0]?.trustCeiling).toBe("untrusted");
    await t.db.insert(apiKeys).values({
      id: randomUUID(),
      teamId,
      keyHash: `h-${randomUUID()}`,
      prefix: "nk_test",
      name: "bound",
      trustCeiling: "user_input",
      boundUserId: ownerId,
    });
  });

  it("defaults knowledge items to untrusted", async () => {
    const { teamId } = await makeTeam(`kb-${randomUUID()}`);
    const kbId = randomUUID();
    await t.db.insert(knowledgeBases).values({ id: kbId, teamId, name: "kb" });
    const itemId = randomUUID();
    await t.db
      .insert(knowledgeItems)
      .values({ id: itemId, teamId, knowledgeBaseId: kbId, content: "hello" });
    const rows = await t.db.select().from(knowledgeItems).where(eq(knowledgeItems.id, itemId));
    expect(rows[0]?.trustLevel).toBe("untrusted");
  });

  it("rejects a tool with no risk_tier at the database level", async () => {
    await expect(
      t.db.$client.query(`INSERT INTO tools (id, name) VALUES ($1, $2)`, [
        randomUUID(),
        `tool-${randomUUID()}`,
      ]),
    ).rejects.toThrow();
  });

  it("rejects runs referencing unknown agents (foreign keys)", async () => {
    const { teamId } = await makeTeam(`fk-${randomUUID()}`);
    await expect(
      t.db.insert(agentRuns).values({ id: randomUUID(), teamId, agentId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      t.db.insert(workflowRuns).values({
        id: randomUUID(),
        teamId,
        workflowId: randomUUID(),
        workflowVersionId: randomUUID(),
      }),
    ).rejects.toThrow();
  });
});

describe("cascades and ownership", () => {
  it("deleting a team removes its agents; deleting an owner is restricted", async () => {
    const { ownerId, teamId } = await makeTeam(`del-${randomUUID()}`);
    const agentId = await makeAgent(teamId, "doomed");
    await expect(t.db.delete(users).where(eq(users.id, ownerId))).rejects.toThrow();
    await t.db.delete(teams).where(eq(teams.id, teamId));
    const remaining = await t.db.select().from(agents).where(eq(agents.id, agentId));
    expect(remaining).toHaveLength(0);
  });
});

describe("tenant isolation smoke", () => {
  it("team-scoped queries never cross teams", async () => {
    const a = await makeTeam(`iso-a-${randomUUID()}`);
    const b = await makeTeam(`iso-b-${randomUUID()}`);
    await makeAgent(a.teamId, "agent-a");
    await makeAgent(b.teamId, "agent-b");
    const rowsA = await t.db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.teamId, a.teamId));
    expect(rowsA.map((r) => r.name)).toEqual(["agent-a"]);
    const cross = await t.db
      .select()
      .from(agents)
      .where(and(eq(agents.teamId, a.teamId), eq(agents.name, "agent-b")));
    expect(cross).toHaveLength(0);
    void b;
  });
});

describe("migration structure (drift guard)", () => {
  const expectedTables = [
    "users",
    "user_identities",
    "auth_nonces",
    "refresh_tokens",
    "teams",
    "api_keys",
    "permissions",
    "roles",
    "role_permissions",
    "team_members",
    "user_permission_grants",
    "models",
    "sources",
    "source_connections",
    "tools",
    "knowledge_bases",
    "knowledge_items",
    "knowledge_chunks",
    "agents",
    "agent_permissions",
    "agent_tools",
    "agent_knowledge_bases",
    "agent_sources",
    "workflows",
    "workflow_versions",
    "workflow_steps",
    "workflow_runs",
    "workflow_step_runs",
    "agent_runs",
    "tool_calls",
    "jobs",
    "job_schedules",
    "approval_requests",
    "audit_logs",
  ];

  it("migrates all 34 domain tables", async () => {
    const res = await t.db.$client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const rows = res.rows as Array<{ table_name: string }>;
    const names = new Set(rows.map((r) => r.table_name));
    expect(expectedTables).toHaveLength(34);
    for (const table of expectedTables) {
      expect(names.has(table)).toBe(true);
    }
  });

  it("ships the R3 trigger, the R4 check, and the R1/R2 partial indexes", async () => {
    const trigger = await t.db.$client.query(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_agent_permissions_r3' AND NOT tgisinternal`,
    );
    expect(trigger.rows).toHaveLength(1);
    const checkConstraint = await t.db.$client.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'agent_sources_r4_initiate_requires_destinations'`,
    );
    expect(checkConstraint.rows).toHaveLength(1);
    const indexes = await t.db.$client.query(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('roles_system_name_unique','tools_system_name_unique')`,
    );
    expect(indexes.rows).toHaveLength(2);
  });
});
