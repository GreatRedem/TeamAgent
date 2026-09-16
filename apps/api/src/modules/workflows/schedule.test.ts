import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../db/harness.js";
import { jobSchedules, jobs, teams, users, workflowRuns } from "../../db/schema/index.js";
import { UnconfiguredProvider } from "../../runtime/model/gateway.js";
import { schedulerTick } from "../jobs/scheduler.js";
import { jobHandlers } from "../jobs/handlers.js";
import { processOne } from "../jobs/worker.js";
import { createWorkflow, publishVersion, updateWorkflow } from "./service.js";
import { syncWorkflowSchedule, WORKFLOW_TRIGGER_QUEUE } from "./schedule.js";

let t: TestDb;
let teamId: string;

const TRANSFORM_STEP = [{ stepKey: "make", kind: "transform", config: { data: { ok: true } } }];

async function createTeamWorkflow(): Promise<string> {
  const created = await createWorkflow(t.db, {
    teamId,
    name: `scheduled-${randomUUID().slice(0, 8)}`,
    actorId: null,
  });
  return created.id;
}

/** Publish a schedule-trigger version and return the workflow id. */
async function publishScheduleVersion(
  workflowId: string,
  cron: string,
  setCurrent = true,
): Promise<void> {
  await publishVersion(t.db, {
    teamId,
    workflowId,
    triggerType: "schedule",
    triggerConfig: { cron },
    steps: TRANSFORM_STEP,
    setCurrent,
    actorId: null,
  });
}

beforeAll(async () => {
  t = await createTestDb();
  const userId = randomUUID();
  await t.db.insert(users).values({ id: userId, displayName: "Schedule Test" });
  teamId = randomUUID();
  await t.db.insert(teams).values({ id: teamId, name: "Schedule Team", ownerId: userId });
}, 60000);

afterAll(async () => {
  await t.close();
});

async function scheduleRowsFor(workflowId: string) {
  const rows = await t.db
    .select()
    .from(jobSchedules)
    .where(eq(jobSchedules.queue, WORKFLOW_TRIGGER_QUEUE));
  return rows.filter(
    (r) => (r.payload as Record<string, unknown> | null)?.["workflow_id"] === workflowId,
  );
}

describe("schedule trigger reconciliation", () => {
  it("publishing a schedule version arms one job_schedules row with a future next_run_at", async () => {
    const workflowId = await createTeamWorkflow();
    await publishScheduleVersion(workflowId, "0 9 * * *");

    const rows = await scheduleRowsFor(workflowId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cron).toBe("0 9 * * *");
    expect(rows[0]?.enabled).toBe(true);
    expect(rows[0]?.teamId).toBe(teamId);
    expect(rows[0]?.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a publish whose cron is malformed or can never fire", async () => {
    const workflowId = await createTeamWorkflow();
    await expect(publishScheduleVersion(workflowId, "* * * *")).rejects.toMatchObject({
      code: "INVALID_CRON",
    });
    // February 30th: parses, never fires.
    await expect(publishScheduleVersion(workflowId, "0 0 30 2 *")).rejects.toMatchObject({
      code: "INVALID_CRON",
    });
    await expect(scheduleRowsFor(workflowId)).resolves.toHaveLength(0);
  });

  it("switching the current version to a manual trigger disarms the schedule", async () => {
    const workflowId = await createTeamWorkflow();
    await publishScheduleVersion(workflowId, "*/5 * * * *");
    expect(await scheduleRowsFor(workflowId)).toHaveLength(1);

    await publishVersion(t.db, {
      teamId,
      workflowId,
      triggerType: "manual",
      steps: TRANSFORM_STEP,
      actorId: null,
    });
    expect(await scheduleRowsFor(workflowId)).toHaveLength(0);
  });

  it("pausing disarms and reactivating re-arms without a republish", async () => {
    const workflowId = await createTeamWorkflow();
    await publishScheduleVersion(workflowId, "0 12 * * *");
    expect(await scheduleRowsFor(workflowId)).toHaveLength(1);

    await updateWorkflow(t.db, { teamId, workflowId, status: "paused", actorId: null });
    expect(await scheduleRowsFor(workflowId)).toHaveLength(0);

    await updateWorkflow(t.db, { teamId, workflowId, status: "active", actorId: null });
    const rows = await scheduleRowsFor(workflowId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cron).toBe("0 12 * * *");
  });

  it("republishing an unchanged cron keeps the next fire time; a new cron recomputes it", async () => {
    const workflowId = await createTeamWorkflow();
    await publishScheduleVersion(workflowId, "30 8 * * *");
    const first = (await scheduleRowsFor(workflowId))[0];
    expect(first).toBeDefined();

    // A new version, same cadence: the row must not be pushed out.
    await publishScheduleVersion(workflowId, "30 8 * * *");
    const rows = await scheduleRowsFor(workflowId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nextRunAt.getTime()).toBe(first?.nextRunAt.getTime());

    await publishScheduleVersion(workflowId, "0 22 * * *");
    const changed = (await scheduleRowsFor(workflowId))[0];
    expect(changed?.cron).toBe("0 22 * * *");
    expect(changed?.nextRunAt.getTime()).not.toBe(first?.nextRunAt.getTime());
  });

  it("a hand-written schedule row with a broken cron is repaired on the next sync", async () => {
    const workflowId = await createTeamWorkflow();
    await publishScheduleVersion(workflowId, "0 6 * * *");
    const row = (await scheduleRowsFor(workflowId))[0];
    expect(row).toBeDefined();

    await t.db
      .update(jobSchedules)
      .set({ cron: "not a cron" })
      .where(eq(jobSchedules.id, row?.id ?? ""));

    await syncWorkflowSchedule(t.db, workflowId);
    const repaired = (await scheduleRowsFor(workflowId))[0];
    expect(repaired?.cron).toBe("0 6 * * *");
    expect(repaired?.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("scheduler tick firing workflow_trigger", () => {
  it("fires a due schedule once, stamps the job untrusted, and advances next_run_at", async () => {
    const workflowId = await createTeamWorkflow();
    await publishScheduleVersion(workflowId, "* * * * *");
    const row = (await scheduleRowsFor(workflowId))[0];
    expect(row).toBeDefined();

    const now = new Date(Date.now() + 60_000);
    const result = await schedulerTick(t.db, { now });
    expect(result.ran).toBe(true);
    expect(result.fired).toHaveLength(1);
    expect(result.fired[0]?.queue).toBe(WORKFLOW_TRIGGER_QUEUE);

    const dueAt = row?.nextRunAt as Date;
    const jobRows = await t.db.select().from(jobs).where(eq(jobs.queue, WORKFLOW_TRIGGER_QUEUE));
    expect(jobRows).toHaveLength(1);
    expect(jobRows[0]?.id).toBe(result.fired[0]?.jobId);
    expect(jobRows[0]?.contextTrustLevel).toBe("untrusted");
    expect(jobRows[0]?.idempotencyKey).toBe(`schedule:${row?.id}:${dueAt.getTime()}`);
    expect(jobRows[0]?.payload).toMatchObject({ workflow_id: workflowId });

    const advanced = (await scheduleRowsFor(workflowId))[0];
    expect(advanced?.lastRunAt).not.toBeNull();
    expect(advanced?.nextRunAt.getTime()).toBeGreaterThan(dueAt.getTime());

    // The schedule is no longer due: an immediate second tick fires nothing.
    const again = await schedulerTick(t.db, { now });
    expect(again.fired).toHaveLength(0);
  });

  it("collapses a refire onto the existing job when the fire time was already enqueued", async () => {
    // Earlier tests in this file left armed schedules behind; remove them so
    // this tick sees exactly the schedule under test.
    await t.db.delete(jobSchedules);
    const workflowId = await createTeamWorkflow();
    await publishScheduleVersion(workflowId, "15 * * * *");
    const row = (await scheduleRowsFor(workflowId))[0];
    const dueAt = row?.nextRunAt as Date;
    const key = `schedule:${row?.id}:${dueAt.getTime()}`;

    // Simulate a tick that enqueued and died before advancing next_run_at:
    // the schedule row is still due.
    await t.db.insert(jobs).values({
      id: randomUUID(),
      queue: WORKFLOW_TRIGGER_QUEUE,
      teamId,
      payload: { schedule_id: row?.id, workflow_id: workflowId },
      idempotencyKey: key,
    });

    const result = await schedulerTick(t.db, { now: new Date(dueAt.getTime() + 30_000) });
    expect(result.fired).toHaveLength(1);
    const jobRows = await t.db.select().from(jobs).where(eq(jobs.idempotencyKey, key));
    expect(jobRows).toHaveLength(1);
  });

  it("skips a broken cron without rescheduling it, and skips disabled rows", async () => {
    const brokenId = randomUUID();
    await t.db.insert(jobSchedules).values({
      id: brokenId,
      queue: WORKFLOW_TRIGGER_QUEUE,
      cron: "weekly-ish",
      nextRunAt: new Date(Date.now() - 1000),
      teamId,
    });
    const disabledId = randomUUID();
    await t.db.insert(jobSchedules).values({
      id: disabledId,
      queue: WORKFLOW_TRIGGER_QUEUE,
      cron: "* * * * *",
      nextRunAt: new Date(Date.now() - 1000),
      enabled: false,
      teamId,
    });

    const result = await schedulerTick(t.db, { now: new Date() });
    expect(result.skipped.map((s) => s.scheduleId)).toContain(brokenId);
    expect(result.skipped.map((s) => s.scheduleId)).not.toContain(disabledId);

    // The broken row stays due so the failure is visible on every tick.
    const still = await t.db.select().from(jobSchedules).where(eq(jobSchedules.id, brokenId));
    expect(still[0]?.nextRunAt.getTime()).toBeLessThan(Date.now());
  });
});

describe("workflow_trigger handler", () => {
  it("starts an unattended run of the current version via the shared handler map", async () => {
    // Earlier tests left armed schedules and jobs behind; clear them so this
    // tick and worker pass see exactly the workflow under test.
    await t.db.delete(jobSchedules);
    await t.db.delete(jobs);
    const workflowId = await createTeamWorkflow();
    // Every minute: the first fire is at most a minute after publish, so the
    // tick below can reach it without waiting.
    await publishScheduleVersion(workflowId, "* * * * *");

    const handlers = jobHandlers(t.db, {
      provider: new UnconfiguredProvider(),
      approvalTtlSeconds: 3600,
    });
    expect(Object.keys(handlers)).toContain(WORKFLOW_TRIGGER_QUEUE);

    const enqueued = await schedulerTick(t.db, { now: new Date(Date.now() + 120_000) });
    expect(enqueued.fired).toHaveLength(1);

    // The fired job's run_at is the schedule's due time (in the past by the
    // time the worker would see it in this fast test); make it claimable now,
    // as the reaper-less real queue effectively does after the next poll.
    const firedJobId = enqueued.fired[0]?.jobId as string;
    await t.db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, firedJobId));

    const result = await processOne({
      database: t.db,
      workerId: "worker-schedule-test",
      pollIntervalMs: 10,
      leaseMs: 5_000,
      handlers,
    });
    expect(result).toBe("succeeded");

    const runsRes = await t.db.select().from(jobs).where(eq(jobs.queue, WORKFLOW_TRIGGER_QUEUE));
    expect(runsRes[0]?.status).toBe("succeeded");

    // The run exists, succeeded, and is unattended-untrusted: no user, no
    // key, no memberships, and the trust the scheduler stamped on the job.
    const runRows = await t.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId));
    expect(runRows).toHaveLength(1);
    expect(runRows[0]?.status).toBe("succeeded");
    expect(runRows[0]?.contextTrustLevel).toBe("untrusted");
    expect(runRows[0]?.idempotencyKey).toMatch(/^workflow_trigger:/);
    expect(runRows[0]?.input).toMatchObject({ trigger: "schedule" });
  });

  it("is a no-op for a workflow that no longer exists", async () => {
    const handlers = jobHandlers(t.db, {
      provider: new UnconfiguredProvider(),
      approvalTtlSeconds: 3600,
    });
    await t.db.insert(jobs).values({
      id: randomUUID(),
      queue: WORKFLOW_TRIGGER_QUEUE,
      teamId,
      payload: { workflow_id: randomUUID() },
    });
    const result = await processOne({
      database: t.db,
      workerId: "worker-schedule-test",
      pollIntervalMs: 10,
      leaseMs: 5_000,
      handlers,
    });
    expect(result).toBe("succeeded");
  });
});
