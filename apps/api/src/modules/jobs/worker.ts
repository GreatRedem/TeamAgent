import { claimJob, completeJob, failJob, heartbeatJob, type QueueJob } from "./queue.js";
import type { AnyDb } from "../../db/db.js";
import { incrementMetric, observeHistogram } from "../../observability/metrics.js";
import { runWithJobTrace } from "../../observability/trace.js";

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
  const startedAtMs = Date.now();
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
    // Queue boundary (docs/22): restore the enqueuer's trace so everything
    // the handler does lands in the trace that caused the job. The job row
    // is where the context crossed; AsyncLocalStorage re-scopes it here.
    await runWithJobTrace(job, async () => {
      await handler(job);
    });
    incrementMetric("jobs_total", { queue: job.queue, status: "succeeded" });
    observeHistogram(
      "job_duration_seconds",
      { queue: job.queue },
      (Date.now() - startedAtMs) / 1000,
    );
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
    const outcome = await failJob(options.database, {
      jobId: job.id,
      workerId: options.workerId,
      error: message,
      retryAt,
    });
    observeHistogram(
      "job_duration_seconds",
      { queue: job.queue },
      (Date.now() - startedAtMs) / 1000,
    );
    if (outcome === "queued") {
      // Returned for retry: the job comes back, so "failed" is not terminal
      // and the retry rate is the signal a poison job shows first.
      incrementMetric("job_retries_total", { queue: job.queue });
      return "failed";
    }
    if (outcome === "dead") {
      // Terminal: max_attempts exhausted. Pages the queue alert.
      incrementMetric("jobs_total", { queue: job.queue, status: "dead" });
      incrementMetric("jobs_dead_total", { queue: job.queue });
      return "failed";
    }
    return "lost";
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
