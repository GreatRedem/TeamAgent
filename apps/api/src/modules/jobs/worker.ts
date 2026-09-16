import { claimJob, completeJob, failJob, heartbeatJob, type QueueJob } from "./queue.js";
import type { AnyDb } from "../../db/db.js";

export type JobHandler = (job: QueueJob) => Promise<void>;

export interface WorkerOptions {
  database: AnyDb;
  workerId: string;
  queue?: string;
  pollIntervalMs: number;
  leaseMs: number;
  handlers: Record<string, JobHandler>;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type ProcessResult = "idle" | "succeeded" | "failed" | "lost";

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function retryDelayMs(attempt: number, random: () => number): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return Math.floor(base * (0.5 + random()));
}

/** Process one job; the caller controls polling and shutdown. */
export async function processOne(options: WorkerOptions): Promise<ProcessResult> {
  const now = new Date();
  const job = await claimJob(options.database, {
    workerId: options.workerId,
    queue: options.queue,
    now,
  });
  if (job === null) return "idle";

  const handler = options.handlers[job.queue];
  const heartbeatMs = Math.max(250, Math.floor(options.leaseMs / 3));
  const heartbeat = setInterval(() => {
    void heartbeatJob(options.database, {
      jobId: job.id,
      workerId: options.workerId,
    });
  }, heartbeatMs);

  try {
    if (handler === undefined) {
      throw new Error(`no handler registered for queue ${job.queue}`);
    }
    await handler(job);
    return (await completeJob(options.database, {
      jobId: job.id,
      workerId: options.workerId,
    }))
      ? "succeeded"
      : "lost";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryAt = new Date(
      Date.now() + retryDelayMs(job.attempts, options.random ?? Math.random),
    );
    return (await failJob(options.database, {
      jobId: job.id,
      workerId: options.workerId,
      error: message,
      retryAt,
    }))
      ? "failed"
      : "lost";
  } finally {
    clearInterval(heartbeat);
  }
}

/** Poll until the signal is aborted. Notifications can be added later without changing this loop. */
export async function runWorker(options: WorkerOptions, signal: AbortSignal): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  while (!signal.aborted) {
    const result = await processOne(options);
    if (result === "idle") await sleep(options.pollIntervalMs);
  }
}
