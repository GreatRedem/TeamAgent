import { sql } from "drizzle-orm";
import type { AnyDb } from "../../db/db.js";
import { newTraceId } from "../agents/runs.js";
import { nextCronRun, parseCron, type ParsedCron } from "./cron.js";
import { enqueueJob } from "./queue.js";

/**
 * The scheduler tick (docs/23-job-queue.md): claim schedules whose
 * `next_run_at` has passed, enqueue one job per schedule, and advance
 * `next_run_at`.
 *
 * **Only one scheduler may tick at a time**, or every scheduled workflow
 * fires once per running instance. The whole tick runs in one transaction
 * holding a `pg_try_advisory_xact_lock` — whichever instance acquires it
 * does the work, the others skip and try again next tick. A transaction lock
 * (not a session lock) matters on a pool: every statement in the tick shares
 * one connection, which the session-scoped `pg_try_advisory_lock` cannot
 * promise. The lock releases with the transaction, so a scheduler that dies
 * mid-tick never blocks the next one — no leader election, no extra
 * dependency.
 *
 * The enqueue rides the same transaction, so a job enqueued by a tick whose
 * transaction later rolls back never exists (docs/23, the dual-write
 * property this design exists for).
 */

/** Arbitrary fixed key in PostgreSQL's advisory-lock namespace. */
export const SCHEDULER_LOCK_ID = 742_113_942;

export interface TickResult {
  /** Whether this instance held the lock and did the work. */
  ran: boolean;
  /** Schedules whose job was enqueued this tick. */
  fired: Array<{ scheduleId: string; queue: string; jobId: string }>;
  /** Schedules not fired, with the reason (invalid cron, no future fire). */
  skipped: Array<{ scheduleId: string; reason: string }>;
}

interface ScheduleRow {
  id: string;
  queue: string;
  cron: string;
  payload: Record<string, unknown> | null;
  teamId: string | null;
  nextRunAt: Date;
}

export type SchedulerEnqueue = (job: {
  queue: string;
  teamId: string | null;
  payload: Record<string, unknown>;
  runAt: Date;
  idempotencyKey: string;
  traceId: string | null;
  /** Trust crossing the queue boundary on the row (docs/23). */
  contextTrustLevel: string | null;
}) => Promise<string>;

/**
 * Enqueue through the shared queue helper. Two ticks cannot race here — the
 * advisory lock and `FOR UPDATE SKIP LOCKED` already serialize the claim —
 * so if the fire time was already enqueued (a previous attempt that died
 * before advancing `next_run_at`), collapse onto the existing job rather
 * than double-firing.
 *
 * The check runs BEFORE the insert deliberately: a failed INSERT aborts the
 * surrounding transaction (25P02), so a catch-and-recover SELECT on the
 * same connection could never run. Reading first keeps the transaction
 * alive in the one case the recovery was written for.
 */
function defaultEnqueue(database: AnyDb): SchedulerEnqueue {
  return async (job) => {
    const existing = (await database.execute(sql`
      SELECT id FROM jobs WHERE queue = ${job.queue} AND idempotency_key = ${job.idempotencyKey}
    `)) as unknown as { rows: Array<{ id: string }> };
    const prior = existing.rows[0]?.id;
    if (prior !== undefined) return prior;
    return (await enqueueJob(database, job)).id;
  };
}

/**
 * One tick. Callers own the cadence (one to two seconds per docs/23); this
 * function is a single pass and returns what it did.
 *
 * Missed-tick policy, made explicit rather than emergent: fire **once** per
 * due schedule, at its stored due time, then realign `next_run_at` to the
 * first cron slot after now. A schedule left overdue by an hour of downtime
 * fires one job and resumes on cadence — never a catch-up storm, never a
 * silently skipped run. The due time anchors both the job's `run_at` and the
 * idempotency key, so a retried fire reuses the same key and collapses into
 * one job.
 */
export async function schedulerTick(
  database: AnyDb,
  input: { now?: Date; enqueue?: SchedulerEnqueue },
): Promise<TickResult> {
  const now = input.now ?? new Date();
  const result: TickResult = { ran: false, fired: [], skipped: [] };

  return database.transaction(async (tx) => {
    const lock = (await tx.execute(sql`
      SELECT pg_try_advisory_xact_lock(${SCHEDULER_LOCK_ID}) AS "acquired"
    `)) as unknown as { rows: Array<{ acquired: boolean }> };
    if (lock.rows[0]?.acquired !== true) return result;
    result.ran = true;

    const due = (await tx.execute(sql`
      SELECT id, queue, cron, payload, team_id AS "teamId", next_run_at AS "nextRunAt"
      FROM job_schedules
      WHERE enabled AND next_run_at <= ${now}
      ORDER BY next_run_at
      FOR UPDATE SKIP LOCKED
    `)) as unknown as { rows: ScheduleRow[] };
    // Raw execute bypasses the column parsers: PGlite hands back timestamptz
    // as text where node-postgres returns Date. Normalize so the rest of the
    // tick can rely on Date regardless of driver.
    const dueRows = due.rows.map((row) => ({
      ...row,
      nextRunAt: row.nextRunAt instanceof Date ? row.nextRunAt : new Date(row.nextRunAt),
    }));

    const enqueue = input.enqueue ?? defaultEnqueue(tx as unknown as AnyDb);
    for (const row of dueRows) {
      let parsed: ParsedCron;
      try {
        parsed = parseCron(row.cron);
      } catch (error) {
        // Leave the row due: a broken cron stays visible and fires again on
        // every tick until someone fixes it, rather than being silently
        // rescheduled into the future.
        result.skipped.push({
          scheduleId: row.id,
          reason: error instanceof Error ? error.message : "invalid cron",
        });
        continue;
      }
      const following = nextCronRun(parsed, now);
      if (following === null) {
        result.skipped.push({ scheduleId: row.id, reason: "cron has no future occurrence" });
        continue;
      }

      const dueAt = row.nextRunAt;
      const jobId = await enqueue({
        queue: row.queue,
        teamId: row.teamId,
        payload: { schedule_id: row.id, ...row.payload },
        runAt: dueAt,
        idempotencyKey: `schedule:${row.id}:${dueAt.getTime()}`,
        // Trust crosses the boundary on the job row (docs/23). A cron
        // schedule fires with nobody present and carries no ingress
        // evidence, so its jobs are untrusted — the same fail-closed default
        // the run executor applies to unattended steps.
        contextTrustLevel: "untrusted",
        traceId: newTraceId(),
      });

      await tx.execute(sql`
        UPDATE job_schedules
        SET last_run_at = ${now}, next_run_at = ${following}
        WHERE id = ${row.id}
      `);
      result.fired.push({ scheduleId: row.id, queue: row.queue, jobId });
    }
    return result;
  });
}
