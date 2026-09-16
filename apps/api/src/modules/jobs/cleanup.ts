import { sql } from "drizzle-orm";
import type { AnyDb } from "../../db/db.js";
import { nextCronRun, parseCron } from "./cron.js";

/**
 * Jobs-table retention (docs/23-job-queue.md, Cleanup).
 *
 * "A jobs table that is never pruned is the standard way this design
 * fails": completed rows accumulate, the claim index degrades, and the
 * churn creates sustained vacuum pressure. The policy follows the doc's
 * two retention classes — `succeeded` rows are deleted after a short
 * retention, `dead` rows (and `failed`, for adapters that park rows in
 * that state) are kept longer because they are the diagnostic record.
 *
 * Cleanup runs as a scheduled job in this same queue, on one
 * `job_schedules` row created idempotently at worker startup.
 */

export const CLEANUP_QUEUE = "jobs_cleanup";
export const CLEANUP_SCHEDULE_ID = "018f0000-0000-7000-8000-000000000001";

export interface CleanupOptions {
  /** Retention for `succeeded` rows. Default 24h ("hours to a few days"). */
  succeededRetentionMs?: number;
  /** Retention for diagnostic rows (`dead`, `failed`). Default 14 days. */
  failedRetentionMs?: number;
  /** Cap per pass: one DELETE of a bounded batch, not an unbounded one. */
  maxDelete?: number;
  now?: Date;
}

/**
 * Delete terminal rows past their retention. Returns how many rows of each
 * class went, for a log line and a testable return value.
 *
 * The predicate is keyed on `completed_at` — set exactly when a row reaches
 * `succeeded` or `dead` — so non-terminal rows (`queued`, `running`) are
 * structurally excluded without a status list drifting out of sync. Rows
 * whose status is terminal but `completed_at` is null (should not happen)
 * are also excluded: a row we cannot date is a row we keep.
 */
export async function pruneTerminalJobs(
  database: AnyDb,
  options: CleanupOptions = {},
): Promise<{ succeeded: number; failed: number }> {
  const now = options.now ?? new Date();
  const succeededRetentionMs = options.succeededRetentionMs ?? 24 * 60 * 60 * 1000;
  const failedRetentionMs = options.failedRetentionMs ?? 14 * 24 * 60 * 60 * 1000;
  const maxDelete = options.maxDelete ?? 10_000;

  const succeededCutoff = new Date(now.getTime() - succeededRetentionMs);
  const failedCutoff = new Date(now.getTime() - failedRetentionMs);

  const succeededResult = (await database.execute(sql`
    DELETE FROM jobs
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'succeeded'
        AND completed_at IS NOT NULL
        AND completed_at <= ${succeededCutoff}
      LIMIT ${maxDelete}
    )
  `)) as unknown as { rowCount?: number | null };

  const failedResult = (await database.execute(sql`
    DELETE FROM jobs
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status IN ('dead', 'failed')
        AND completed_at IS NOT NULL
        AND completed_at <= ${failedCutoff}
      LIMIT ${maxDelete}
    )
  `)) as unknown as { rowCount?: number | null };

  return {
    succeeded: succeededResult.rowCount ?? 0,
    failed: failedResult.rowCount ?? 0,
  };
}

/**
 * Ensure the cleanup schedule row exists, enabled, on its cron. Idempotent
 * by fixed id: an existing row is never modified, so a deploy that changes
 * the default cron here does not fight an operator who tuned it in the
 * database — update the row deliberately instead.
 */
export async function ensureCleanupSchedule(
  database: AnyDb,
  input: { cron: string },
): Promise<void> {
  parseCron(input.cron);
  await database.execute(sql`
    INSERT INTO job_schedules (id, queue, cron, payload, next_run_at, enabled, team_id)
    VALUES (
      ${CLEANUP_SCHEDULE_ID},
      ${CLEANUP_QUEUE},
      ${input.cron},
      ${JSON.stringify({ kind: "jobs_retention" })}::jsonb,
      -- First fire on the first cron slot after insert.
      ${nextCronRun(parseCron(input.cron), new Date())},
      TRUE,
      NULL
    )
    ON CONFLICT (id) DO NOTHING
  `);
}
