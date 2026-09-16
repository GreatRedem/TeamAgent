import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../db/harness.js";
import { agentRuns, agents, jobSchedules, teams, users } from "../../db/schema/index.js";
import { processOne } from "./worker.js";
import { schedulerTick } from "./scheduler.js";
import {
  COST_ROLLUP_QUEUE,
  COST_ROLLUP_SCHEDULE_ID,
  ensureCostRollupSchedule,
  rollupCosts,
} from "./cost-rollup.js";
import { jobHandlers } from "./handlers.js";

/**
 * Cost rollup (docs/22 Cost + Cardinality): terminal agent_runs are
 * aggregated into cost_rollups per (team, agent, provider, model, hour
 * bucket); non-terminal runs are structurally excluded; a re-run of the
 * same bucket repairs instead of duplicating; and the whole chain runs
 * end to end through the scheduler like any other scheduled job.
 */

let teamId: string;
let agentId: string;

async function insertRun(
  t: TestDb,
  input: {
    status: string;
    completedAt: Date | null;
    inputTokens?: number;
    outputTokens?: number;
    modelProvider?: string;
    modelName?: string;
    agent?: string;
    team?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await t.db.insert(agentRuns).values({
    id,
    teamId: input.team ?? teamId,
    agentId: input.agent ?? agentId,
    status: input.status,
    tokenUsage:
      input.inputTokens === undefined && input.outputTokens === undefined
        ? null
        : { input_tokens: input.inputTokens ?? 0, output_tokens: input.outputTokens ?? 0 },
    agentSnapshot: {
      model: {
        id: randomUUID(),
        provider: input.modelProvider ?? "test-provider",
        name: input.modelName ?? "test-model",
        version: "1",
      },
    },
    completedAt: input.completedAt,
  });
  return id;
}

async function readRollups(t: TestDb) {
  return t.db.execute(sql`SELECT * FROM cost_rollups ORDER BY input_tokens DESC`);
}

describe("rollupCosts", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
    const ownerId = randomUUID();
    await t.db.insert(users).values({ id: ownerId });
    teamId = randomUUID();
    await t.db.insert(teams).values({ id: teamId, name: "rollup-team", ownerId });
    agentId = randomUUID();
    await t.db.insert(agents).values({ id: agentId, teamId, name: "rollup-agent" });
  }, 60000);

  afterAll(async () => {
    await t.close();
  });

  it("aggregates terminal runs into per-dimension buckets", async () => {
    // Same team/agent/model, one hour bucket: three rows collapse to one.
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    await insertRun(t, {
      status: "succeeded",
      completedAt: hourAgo,
      inputTokens: 100,
      outputTokens: 10,
    });
    await insertRun(t, {
      status: "failed",
      completedAt: hourAgo,
      inputTokens: 50,
      outputTokens: 5,
    });
    await insertRun(t, {
      status: "budget_exceeded",
      completedAt: hourAgo,
      inputTokens: 25,
      outputTokens: 2,
    });

    const result = await rollupCosts(t.db, { now: new Date() });
    expect(result.rows).toBe(1);

    const { rows } = (await readRollups(t)) as unknown as {
      rows: Array<Record<string, unknown>>;
    };
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // Failed and budget_exceeded runs consumed tokens too — all terminal
    // statuses count, which is the point of a cost signal.
    expect(Number(row.run_count)).toBe(3);
    expect(Number(row.input_tokens)).toBe(175);
    expect(Number(row.output_tokens)).toBe(17);
    expect(row.model_provider).toBe("test-provider");
    expect(row.model_name).toBe("test-model");
    expect(Number(row.bucket_seconds)).toBe(3600);
  });

  it("separates dimensions: different agents and models get their own rows", async () => {
    const otherAgent = randomUUID();
    await t.db.insert(agents).values({ id: otherAgent, teamId, name: "other-agent" });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    await insertRun(t, {
      status: "succeeded",
      completedAt: twoHoursAgo,
      inputTokens: 40,
      agent: otherAgent,
    });
    await insertRun(t, {
      status: "succeeded",
      completedAt: twoHoursAgo,
      inputTokens: 70,
      modelName: "big-model",
    });

    await rollupCosts(t.db, { now: new Date() });

    const { rows } = (await readRollups(t)) as unknown as {
      rows: Array<Record<string, unknown>>;
    };
    const otherAgentRow = rows.find((r) => Number(r.input_tokens) === 40);
    const bigModelRow = rows.find((r) => Number(r.input_tokens) === 70);
    expect(otherAgentRow).toBeDefined();
    expect(bigModelRow).toBeDefined();
    expect(String(bigModelRow!.model_name)).toBe("big-model");
  });

  it("excludes non-terminal runs and runs with no usage", async () => {
    // waiting_for_approval has partial usage but no completion — excluded,
    // so the resumed completion is never counted twice.
    await insertRun(t, {
      status: "waiting_for_approval",
      completedAt: null,
      inputTokens: 999,
      outputTokens: 999,
    });
    await insertRun(t, { status: "queued", completedAt: null });
    await insertRun(t, { status: "running", completedAt: null });
    // Terminal but never populated token_usage: counts as a run, zero tokens.
    await insertRun(t, { status: "failed", completedAt: new Date(Date.now() - 30_000) });

    const before = await readRollups(t);
    await rollupCosts(t.db, { now: new Date() });

    const { rows } = (await readRollups(t)) as unknown as {
      rows: Array<Record<string, unknown>>;
    };
    // No row may carry the excluded run's 999s.
    for (const row of rows) {
      expect(Number(row.input_tokens)).not.toBe(999);
      expect(Number(row.output_tokens)).not.toBe(999);
    }
    // The usage-less failed run lands as run_count increment, zero tokens.
    const zeroTokenRow = rows.find((r) => Number(r.input_tokens) === 0);
    expect(zeroTokenRow).toBeDefined();
    expect(Number(zeroTokenRow!.run_count)).toBe(1);
    void before;
  });

  it("re-rolling the same bucket repairs instead of duplicating", async () => {
    // A dedicated agent + unique model: no earlier test's runs share this
    // dimension tuple's bucket, so run_count is exactly assertable.
    const now = new Date();
    const ownerId = randomUUID();
    await t.db.insert(users).values({ id: ownerId });
    const repairTeam = randomUUID();
    await t.db.insert(teams).values({ id: repairTeam, name: `repair-${randomUUID()}`, ownerId });
    const repairAgent = randomUUID();
    await t.db.insert(agents).values({ id: repairAgent, teamId: repairTeam, name: "repair-agent" });
    const uniqueModel = `repair-model-${randomUUID()}`;
    await insertRun(t, {
      status: "succeeded",
      completedAt: new Date(now.getTime() - 90_000),
      inputTokens: 10,
      outputTokens: 1,
      team: repairTeam,
      agent: repairAgent,
      modelName: uniqueModel,
    });

    // The DB is shared across tests in this describe, so the window's
    // rowCount includes earlier tests' dimensions; the invariant here is
    // that a re-run does not GROW it and the tuple stays singular.
    const first = await rollupCosts(t.db, { now });
    const second = await rollupCosts(t.db, { now });
    expect(second.rows).toBe(first.rows);

    const { rows } = (await t.db.execute(
      sql`SELECT * FROM cost_rollups WHERE agent_id = ${repairAgent}`,
    )) as unknown as { rows: Array<Record<string, unknown>> };
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.input_tokens)).toBe(10);
    expect(Number(rows[0]!.output_tokens)).toBe(1);
    expect(Number(rows[0]!.run_count)).toBe(1);
  });
});

describe("ensureCostRollupSchedule", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  }, 60000);

  afterAll(async () => {
    await t.close();
  });

  it("creates the schedule once and never clobbers an operator-tuned cron", async () => {
    await ensureCostRollupSchedule(t.db, { cron: "23 * * * *" });
    const first = await t.db
      .select()
      .from(jobSchedules)
      .where(eq(jobSchedules.id, COST_ROLLUP_SCHEDULE_ID));
    expect(first).toHaveLength(1);
    expect(first[0]!.queue).toBe(COST_ROLLUP_QUEUE);

    // Operator tunes the cron in the database.
    await t.db
      .update(jobSchedules)
      .set({ cron: "7 2 * * *" })
      .where(eq(jobSchedules.id, COST_ROLLUP_SCHEDULE_ID));

    await ensureCostRollupSchedule(t.db, { cron: "23 * * * *" });
    const after = await t.db
      .select()
      .from(jobSchedules)
      .where(eq(jobSchedules.id, COST_ROLLUP_SCHEDULE_ID));
    expect(after).toHaveLength(1);
    expect(after[0]!.cron).toBe("7 2 * * *");
  });

  it("rejects a malformed cron before touching the table", async () => {
    await expect(ensureCostRollupSchedule(t.db, { cron: "not a cron" })).rejects.toThrow();
    const rows = await t.db
      .select()
      .from(jobSchedules)
      .where(eq(jobSchedules.queue, COST_ROLLUP_QUEUE));
    expect(rows).toHaveLength(1); // only the valid one from the earlier test
  });
});

describe("cost rollup end to end", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  }, 60000);

  afterAll(async () => {
    await t.close();
  });

  it("scheduler fires the job and the handler rolls up", async () => {
    await ensureCostRollupSchedule(t.db, { cron: "* * * * *" });

    const ownerId = randomUUID();
    await t.db.insert(users).values({ id: ownerId });
    const e2eTeam = randomUUID();
    await t.db.insert(teams).values({ id: e2eTeam, name: "rollup-e2e", ownerId });
    const e2eAgent = randomUUID();
    await t.db.insert(agents).values({ id: e2eAgent, teamId: e2eTeam, name: "e2e-agent" });
    await insertRun(t, {
      status: "succeeded",
      completedAt: new Date(Date.now() - 5 * 60_000),
      inputTokens: 33,
      outputTokens: 3,
      team: e2eTeam,
      agent: e2eAgent,
    });

    // Scheduler tick: force the schedule due, then the tick enqueues the
    // job and the worker claims and runs the handler.
    await t.db
      .update(jobSchedules)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(jobSchedules.id, COST_ROLLUP_SCHEDULE_ID));
    const tick = await schedulerTick(t.db, {});
    expect(tick.fired.some((f) => f.queue === COST_ROLLUP_QUEUE)).toBe(true);
    const processed = await processOne({
      database: t.db,
      workerId: "rollup-test-worker",
      pollIntervalMs: 10,
      leaseMs: 5000,
      handlers: jobHandlers(t.db, {} as never),
    });
    expect(processed).toBe("succeeded");

    const { rows } = (await t.db.execute(
      sql`SELECT * FROM cost_rollups WHERE team_id = ${e2eTeam}`,
    )) as unknown as { rows: Array<Record<string, unknown>> };
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.input_tokens)).toBe(33);
    expect(Number(rows[0]!.output_tokens)).toBe(3);
  });
});
