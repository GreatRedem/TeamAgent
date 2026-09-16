import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../db/harness.js";
import { jobs } from "../../db/schema/index.js";
import { enqueueJob } from "./queue.js";
import { processOne } from "./worker.js";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
}, 60000);

afterAll(async () => {
  await t.close();
});

describe("job worker", () => {
  it("dispatches a job and completes it", async () => {
    const job = await enqueueJob(t.db, {
      queue: "agent_run",
      payload: { runId: "run-worker-1" },
      idempotencyKey: "worker-success",
    });
    const handled: string[] = [];

    const result = await processOne({
      database: t.db,
      workerId: "worker-success",
      pollIntervalMs: 10,
      leaseMs: 1_000,
      handlers: {
        agent_run: async (claimed) => {
          handled.push(String(claimed.payload.runId));
        },
      },
    });

    const rows = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(result).toBe("succeeded");
    expect(handled).toEqual(["run-worker-1"]);
    expect(rows[0]?.status).toBe("succeeded");
  });

  it("records handler failures for retry and dead-lettering", async () => {
    const job = await enqueueJob(t.db, {
      queue: "workflow_step",
      payload: { stepId: "step-worker-1" },
      maxAttempts: 1,
      idempotencyKey: "worker-failure",
    });

    const result = await processOne({
      database: t.db,
      workerId: "worker-failure",
      pollIntervalMs: 10,
      leaseMs: 1_000,
      random: () => 0.5,
      handlers: {
        workflow_step: async () => {
          throw new Error("provider timeout");
        },
      },
    });

    const rows = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(result).toBe("failed");
    expect(rows[0]?.status).toBe("dead");
    expect(rows[0]?.lastError).toBe("provider timeout");
  });
});
