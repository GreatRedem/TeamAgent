import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { db } from "./db/db.js";
import { modelProviderFromConfig } from "./runtime/model/provider.js";
import { schedulerTick } from "./modules/jobs/scheduler.js";
import { jobHandlers } from "./modules/jobs/handlers.js";
import { runWorker } from "./modules/jobs/worker.js";

/**
 * The background-work process (docs/23-job-queue.md): the scheduler tick and
 * the job worker loop, deliberately separate from the API process so a
 * long-running job competes for a worker's attention, not a request path.
 *
 * The model gateway is constructed from the same configuration the API
 * reads, so both processes agree on which provider is live.
 */

const pollIntervalMs = config.QUEUE_POLL_INTERVAL_MS;
const leaseMs = config.QUEUE_LEASE_SECONDS * 1000;
const workerId = `worker_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

const runtime = {
  provider: modelProviderFromConfig(),
  toolHandlerDeps: undefined,
  approvalTtlSeconds: config.APPROVAL_TTL_SECONDS,
};

async function main(): Promise<void> {
  const controller = new AbortController();

  // The scheduler cadence is one to two seconds per docs/23. `setInterval`
  // is enough: ticks that overlap are safe (the advisory lock skips the
  // loser), and a tick that throws is logged rather than killing the timer.
  const scheduler = setInterval(() => {
    // One to two seconds per docs/23; ticks that overlap are safe because
    // the advisory lock skips the loser.
    void schedulerTick(db, {}).catch((error) => {
      console.error({ err: error }, "scheduler tick failed");
    });
  }, pollIntervalMs);

  const worker = runWorker(
    {
      database: db,
      workerId,
      pollIntervalMs,
      leaseMs,
      handlers: jobHandlers(db, runtime),
    },
    controller.signal,
  );

  console.log({ workerId, pollIntervalMs, leaseMs }, "background worker started");

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      console.log({ signal }, "background worker shutting down");
      clearInterval(scheduler);
      controller.abort();
    });
  }

  await worker;
  await pool.end();
}

main().catch((error) => {
  console.error({ err: error }, "background worker failed to start");
  process.exit(1);
});
