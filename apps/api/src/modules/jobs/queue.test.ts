import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../db/harness.js";
import {
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  heartbeatJob,
  reapExpiredJobs,
} from "./queue.js";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
}, 60000);

afterAll(async () => {
  await t.close();
});

describe("database-backed queue", () => {
  it("claims one due job and enforces lease ownership", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const job = await enqueueJob(t.db, {
      queue: "test",
      payload: { runId: "run-1" },
      runAt: now,
      idempotencyKey: "claim-once",
      traceId: "trace-1",
      contextTrustLevel: "untrusted",
    });

    const claimed = await claimJob(t.db, { workerId: "worker-a", now });
    expect(claimed).toMatchObject({ id: job.id, status: "running", attempts: 1 });
    expect(await claimJob(t.db, { workerId: "worker-b", now })).toBeNull();
    expect(await heartbeatJob(t.db, { jobId: job.id, workerId: "worker-b", now })).toBe(false);
    expect(await heartbeatJob(t.db, { jobId: job.id, workerId: "worker-a", now })).toBe(true);
    expect(await completeJob(t.db, { jobId: job.id, workerId: "worker-a", now })).toBe(true);
    expect(await completeJob(t.db, { jobId: job.id, workerId: "worker-a", now })).toBe(false);
  });

  it("requeues expired leases and dead-letters exhausted jobs", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const job = await enqueueJob(t.db, {
      queue: "reap",
      payload: { runId: "run-2" },
      runAt: now,
      maxAttempts: 1,
    });
    await claimJob(t.db, { workerId: "worker-dead", now });
    expect(
      await reapExpiredJobs(t.db, { leaseMs: 1_000, now: new Date(now.getTime() + 2_000) }),
    ).toBe(1);

    const reclaimed = await claimJob(t.db, {
      workerId: "worker-final",
      queue: "reap",
      now: new Date(now.getTime() + 2_000),
    });
    expect(reclaimed?.id).toBe(job.id);
    expect(
      await failJob(t.db, {
        jobId: job.id,
        workerId: "worker-final",
        error: "permanent failure",
        retryAt: new Date(now.getTime() + 3_000),
      }),
    ).toBe("dead");
  });
});
