import Fastify from "fastify";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { db } from "./db/db.js";
import { modelProviderFromConfig } from "./runtime/model/provider.js";
import { schedulerTick } from "./modules/jobs/scheduler.js";
import { jobHandlers } from "./modules/jobs/handlers.js";
import { runWorker } from "./modules/jobs/worker.js";
import { reapExpiredJobs } from "./modules/jobs/queue.js";
import { ensureCleanupSchedule } from "./modules/jobs/cleanup.js";
import { ensureCostRollupSchedule } from "./modules/jobs/cost-rollup.js";
import { incrementMetric, renderMetrics } from "./observability/metrics.js";
import { collectQueueMetrics } from "./observability/queue.js";

/**
 * The background-work process (docs/23-job-queue.md): the scheduler tick,
 * the job worker loop, and the lease reaper — deliberately separate from the
 * API process so a long-running job competes for a worker's attention, not a
 * request path.
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

  // Jobs-table retention (docs/23 Cleanup): the schedule row is created
  // idempotently at startup and fires the jobs_cleanup handler through the
  // normal scheduler -> queue -> worker path.
  await ensureCleanupSchedule(db, { cron: config.JOBS_CLEANUP_CRON });

  // Cost rollup (docs/22 Cost): same pattern — an idempotent schedule row
  // firing the jobs_cost_rollup handler; token totals per team/agent/model
  // land in cost_rollups, never in metric labels.
  await ensureCostRollupSchedule(db, { cron: config.JOBS_COST_ROLLUP_CRON });

  // The scheduler cadence is one to two seconds per docs/23. `setInterval`
  // is enough: ticks that overlap are safe (the advisory lock skips the
  // loser), and a tick that throws is logged rather than killing the timer.
  const scheduler = setInterval(() => {
    void schedulerTick(db, {}).catch((error) => {
      console.error({ err: error }, "scheduler tick failed");
    });
  }, pollIntervalMs);

  // Lease reaper (docs/23): a worker that dies mid-job leaves the row
  // `running` past its lease. Requeueing keeps the job from being lost;
  // counting it turns "workers are dying" from a support ticket into a
  // series (docs/22 `jobs_reclaimed_total`).
  const reaper = setInterval(() => {
    void reapExpiredJobs(db, { leaseMs })
      .then((reclaimed) => {
        if (reclaimed > 0) incrementMetric("jobs_reclaimed_total", {}, reclaimed);
      })
      .catch((error) => {
        console.error({ err: error }, "lease reaper failed");
      });
  }, leaseMs / 2);

  const worker = runWorker(
    {
      database: db,
      workerId,
      pollIntervalMs,
      leaseMs,
      handlers: jobHandlers(db, runtime, {
        cleanup: {
          succeededRetentionMs: config.JOBS_SUCCEEDED_RETENTION_HOURS * 3_600_000,
          failedRetentionMs: config.JOBS_FAILED_RETENTION_DAYS * 86_400_000,
        },
      }),
    },
    controller.signal,
  );

  // The worker's own scrape port (docs/22): same registry, same exposition,
  // separate process. Queue depth is read at scrape time, not cached.
  const metricsApp = Fastify({ logger: { level: config.LOG_LEVEL } });
  metricsApp.get("/metrics", async (_request, reply) => {
    try {
      await collectQueueMetrics(db);
    } catch (error) {
      _request.log.warn({ err: error }, "metrics collector failed");
    }
    return reply.type("text/plain; version=0.0.4; charset=utf-8").send(renderMetrics());
  });
  const metricsServer = await metricsApp.listen({ port: 9100, host: "127.0.0.1" });

  console.log({ workerId, pollIntervalMs, leaseMs, metricsServer }, "background worker started");

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      console.log({ signal }, "background worker shutting down");
      clearInterval(scheduler);
      clearInterval(reaper);
      controller.abort();
      void metricsApp.close();
    });
  }

  await worker;
  await metricsApp.close();
  await pool.end();
}

main().catch((error) => {
  console.error({ err: error }, "background worker failed to start");
  process.exit(1);
});
