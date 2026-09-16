import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../db/harness.js";
import { jobSchedules, jobs } from "../../db/schema/index.js";
import { processOne } from "./worker.js";
import { schedulerTick } from "./scheduler.js";
import {
  CLEANUP_QUEUE,
  CLEANUP_SCHEDULE_ID,
  ensureCleanupSchedule,
  pruneTerminalJobs,
} from "./cleanup.js";
import { jobHandlers } from "./handlers.js";

/**
 * Jobs-table retention (docs/23 Cleanup): terminal rows are pruned on two
 * retention classes, the cleanup schedule is idempotent, and the whole
 * chain works end to end — scheduler fires the job, the handler deletes
 * exactly the rows past retention.
 */

async function insertJob(
  t: TestDb,
  input: { status: string; completedAt: Date | null },
): Promise<string> {
  const id = randomUUID();
  await t.db.insert(jobs).values({
    id,
    queue: "retention_test",
    payload: {},
    status: input.status,
    completedAt: input.completedAt,
    runAt: new Date(Date.now() - 60_000),
  });
  return id;
}

describe("pruneTerminalJobs", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  }, 60000);

  afterAll(async () => {
    await t.close();
  });

  it("deletes succeeded rows past retention and keeps young and live rows", async () => {
    const old = await insertJob(t, {
      status: "succeeded",
      completedAt: new Date(Date.now() - 2 * 60_000),
    });
    const young = await insertJob(t, { status: "succeeded", completedAt: new Date() });
    const running = await insertJob(t, { status: "running", completedAt: null });
    const queued = await insertJob(t, { status: "queued", completedAt: null });

    const pruned = await pruneTerminalJobs(t.db, {
      succeededRetentionMs: 60_000,
      failedRetentionMs: 60_000,
      now: new Date(),
    });
    expect(pruned.succeeded).toBe(1);

    const remaining = await t.db.select().from(jobs).where(eq(jobs.queue, "retention_test"));
    const ids = new Set(remaining.map((r) => r.id));
    expect(ids.has(old)).toBe(false);
    expect(ids.has(young)).toBe(true);
    expect(ids.has(running)).toBe(true);
    expect(ids.has(queued)).toBe(true);
  });

  it("keeps dead rows until the longer diagnostic retention passes", async () => {
    // A succeeded row and a dead row with the SAME age: only the retention
    // class separates them.
    const age = 10 * 60_000;
    const succeededSameAge = await insertJob(t, {
      status: "succeeded",
      completedAt: new Date(Date.now() - age),
    });
    const deadSameAge = await insertJob(t, {
      status: "dead",
      completedAt: new Date(Date.now() - age),
    });
    const deadAncient = await insertJob(t, {
      status: "dead",
      completedAt: new Date(Date.now() - 60 * 60_000),
    });

    // Succeeded retention (2 min) is far shorter than failed retention
    // (30 min): the same-age succeeded row goes, the same-age dead row
    // stays — diagnostics outlive successes.
    await pruneTerminalJobs(t.db, {
      succeededRetentionMs: 2 * 60_000,
      failedRetentionMs: 30 * 60_000,
    });
    let ids = new Set(
      (await t.db.select().from(jobs).where(eq(jobs.queue, "retention_test"))).map((r) => r.id),
    );
    expect(ids.has(succeededSameAge)).toBe(false);
    expect(ids.has(deadSameAge)).toBe(true);
    expect(ids.has(deadAncient)).toBe(false);

    // Once the failed retention passes, the dead row goes too.
    await pruneTerminalJobs(t.db, {
      succeededRetentionMs: 2 * 60_000,
      failedRetentionMs: 5 * 60_000,
    });
    ids = new Set(
      (await t.db.select().from(jobs).where(eq(jobs.queue, "retention_test"))).map((r) => r.id),
    );
    expect(ids.has(deadSameAge)).toBe(false);
  });

  it("never touches rows it cannot date", async () => {
    // Terminal status with null completed_at should not happen; a row we
    // cannot date is a row we keep.
    const undated = await insertJob(t, { status: "succeeded", completedAt: null });
    await pruneTerminalJobs(t.db, { succeededRetentionMs: 1 });
    const ids = new Set(
      (await t.db.select().from(jobs).where(eq(jobs.queue, "retention_test"))).map((r) => r.id),
    );
    expect(ids.has(undated)).toBe(true);
  });

  it("observes the batch cap per pass", async () => {
    for (let i = 0; i < 3; i += 1) {
      await insertJob(t, { status: "succeeded", completedAt: new Date(Date.now() - 60_000) });
    }
    const pruned = await pruneTerminalJobs(t.db, {
      succeededRetentionMs: 30_000,
      maxDelete: 2,
    });
    expect(pruned.succeeded).toBe(2);
    // A second pass takes the rest: the job is per-pass bounded, and the
    // schedule fires again tomorrow.
    const again = await pruneTerminalJobs(t.db, {
      succeededRetentionMs: 30_000,
      maxDelete: 2,
    });
    expect(again.succeeded).toBe(1);
  });
});

describe("ensureCleanupSchedule", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  }, 60000);

  afterAll(async () => {
    await t.close();
  });

  it("creates one enabled row on the given cron and is idempotent", async () => {
    await ensureCleanupSchedule(t.db, { cron: "17 3 * * *" });
    await ensureCleanupSchedule(t.db, { cron: "17 3 * * *" });

    const rows = await t.db
      .select()
      .from(jobSchedules)
      .where(eq(jobSchedules.id, CLEANUP_SCHEDULE_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ queue: CLEANUP_QUEUE, cron: "17 3 * * *", enabled: true });
    expect(rows[0]?.nextRunAt.getTime()).toBeGreaterThan(Date.now());

    // An operator-tuned cron is not clobbered by a restart with different
    // defaults: the fixed-id insert does nothing on conflict.
    await t.db
      .update(jobSchedules)
      .set({ cron: "0 4 * * *" })
      .where(eq(jobSchedules.id, CLEANUP_SCHEDULE_ID));
    await ensureCleanupSchedule(t.db, { cron: "17 3 * * *" });
    const after = await t.db
      .select()
      .from(jobSchedules)
      .where(eq(jobSchedules.id, CLEANUP_SCHEDULE_ID));
    expect(after[0]?.cron).toBe("0 4 * * *");
  });

  it("rejects a malformed cron before touching the table", async () => {
    await expect(ensureCleanupSchedule(t.db, { cron: "not a cron" })).rejects.toThrow();
    const rows = await t.db
      .select()
      .from(jobSchedules)
      .where(sql`${jobSchedules.cron} = 'not a cron'`);
    expect(rows).toHaveLength(0);
  });
});

describe("cleanup end to end through scheduler and worker", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  }, 60000);

  afterAll(async () => {
    await t.close();
  });

  it("scheduler fires the cleanup job and the handler prunes past-retention rows", async () => {
    await ensureCleanupSchedule(t.db, { cron: "* * * * *" });

    // Force the schedule due.
    await t.db
      .update(jobSchedules)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(jobSchedules.id, CLEANUP_SCHEDULE_ID));

    // A succeeded row well past any sane retention.
    const old = await insertJob(t, {
      status: "succeeded",
      completedAt: new Date(Date.now() - 365 * 24 * 60 * 60_000),
    });

    // Tick: the cleanup job is enqueued and next_run_at advances.
    const tick = await schedulerTick(t.db, {});
    expect(tick.ran).toBe(true);
    expect(tick.fired.some((f) => f.queue === CLEANUP_QUEUE)).toBe(true);

    // Worker processes it with tiny retention — the old row goes.
    const result = await processOne({
      database: t.db,
      workerId: "cleanup-worker",
      pollIntervalMs: 10,
      leaseMs: 5000,
      handlers: jobHandlers(t.db, {} as never, {
        cleanup: { succeededRetentionMs: 60_000, failedRetentionMs: 60_000 },
      }),
    });
    expect(result).toBe("succeeded");

    const ids = new Set((await t.db.select().from(jobs)).map((r) => r.id));
    expect(ids.has(old)).toBe(false);
  });
});
