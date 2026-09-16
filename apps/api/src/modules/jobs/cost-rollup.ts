import { sql } from "drizzle-orm";
import type { AnyDb } from "../../db/db.js";
import { nextCronRun, parseCron } from "./cron.js";

/**
 * Periodic cost rollup (docs/22, Cost + Cardinality).
 *
 * `agent_runs.token_usage` is the transactional record; this job aggregates
 * it into `cost_rollups` — one row per (team, agent, provider, model, hour
 * bucket) — so per-team and per-agent spend is queryable without scanning
 * the run table, and without ever putting `team_id` on a metric label
 * (docs/22, Cardinality: per-team aggregates belong in a rollup written to
 * the database, not in the metrics system).
 *
 * Tokens rather than currency: provider pricing changes, and
 * `agent_runs.cost_estimate` stays the priced record (docs/22, T12). The
 * docs' rate-of-change alert — "a team's spend tripling in an hour" — is a
 * query over consecutive buckets of these rows.
 *
 * Scope: terminal runs only, keyed on `completed_at` (the same predicate
 * discipline as jobs retention — `waiting_for_approval` rows carry partial
 * usage without a completion time and are structurally excluded, so nothing
 * is counted twice when the run later resumes and completes). Buckets are
 * clock-aligned so consecutive buckets concatenate cleanly.
 *
 * Re-running a bucket OVERWRITES (upsert on the dimension tuple), so a
 * replayed job repairs rather than duplicates — same contract as the
 * cleanup schedule's idempotency.
 */

export const COST_ROLLUP_QUEUE = "jobs_cost_rollup";
export const COST_ROLLUP_SCHEDULE_ID = "018f0000-0000-7000-8000-000000000002";

export interface CostRollupOptions {
  /** Bucket width in seconds. Default 3600 (hourly, clock-aligned). */
  bucketSeconds?: number;
  /** How far back to (re)roll. Default 26h: the last full bucket plus slack for a missed tick. */
  lookbackMs?: number;
  now?: Date;
}

export interface RollupResult {
  bucketStart: Date;
  bucketSeconds: number;
  /** Dimension tuples written (inserted or refreshed). */
  rows: number;
}

/**
 * Aggregate terminal agent runs into `cost_rollups` for the bucket window
 * [bucketStart, bucketStart + bucketSeconds). One statement: GROUP BY the
 * dimension tuple, upsert on conflict. Model identity comes from the run's
 * `agent_snapshot.model` — the pinned configuration that produced the run
 * (docs/17 T13), not the agent's current settings, which may have changed
 * since.
 */
export async function rollupCosts(
  database: AnyDb,
  options: CostRollupOptions = {},
): Promise<RollupResult> {
  const now = options.now ?? new Date();
  const bucketSeconds = options.bucketSeconds ?? 3600;
  const lookbackMs = options.lookbackMs ?? 26 * 60 * 60 * 1000;
  const bucketMs = bucketSeconds * 1000;

  // Clock-align the newest bucket boundary at or before `now`; the window
  // covers the lookback. Buckets are computed per run from `completed_at`
  // (time_bucket below), so one statement rolls every bucket in the window
  // — and a later run self-heals a bucket whose job failed.
  const newestStart = Math.floor(now.getTime() / bucketMs) * bucketMs;
  const oldestStart = newestStart - (lookbackMs - bucketMs);
  const windowEnd = oldestStart + lookbackMs;

  const result = (await database.execute(sql`
    INSERT INTO cost_rollups
      (id, team_id, agent_id, model_provider, model_name, bucket_start, bucket_seconds,
       run_count, input_tokens, output_tokens, rolled_up_at)
    SELECT
      -- One id per GROUP BY row: a literal uuid would repeat across rows of
      -- the same INSERT and violate the primary key.
      gen_random_uuid(),
      team_id,
      agent_id,
      model_provider,
      model_name,
      bucket_start,
      ${bucketSeconds}::integer,
      COUNT(*)::integer,
      COALESCE(SUM(input_tokens), 0),
      COALESCE(SUM(output_tokens), 0),
      ${now}
    FROM (
      SELECT
        r.team_id,
        r.agent_id,
        COALESCE(r.agent_snapshot -> 'model' ->> 'provider', 'unknown') AS model_provider,
        COALESCE(r.agent_snapshot -> 'model' ->> 'name', 'unknown') AS model_name,
        -- Clock-aligned bucket containing the run's completion.
        to_timestamp(
          floor(extract(epoch FROM r.completed_at) / ${bucketSeconds}::bigint) * ${bucketSeconds}::bigint
        ) AS bucket_start,
        COALESCE(NULLIF(r.token_usage ->> 'input_tokens', '')::bigint, 0) AS input_tokens,
        COALESCE(NULLIF(r.token_usage ->> 'output_tokens', '')::bigint, 0) AS output_tokens
      FROM agent_runs r
      WHERE r.completed_at IS NOT NULL
        AND r.completed_at >= ${new Date(oldestStart)}::timestamptz
        AND r.completed_at < ${new Date(windowEnd)}::timestamptz
    ) runs
    GROUP BY team_id, agent_id, model_provider, model_name, bucket_start
    ON CONFLICT (team_id, agent_id, model_provider, model_name, bucket_start, bucket_seconds)
    DO UPDATE SET
      run_count = EXCLUDED.run_count,
      input_tokens = EXCLUDED.input_tokens,
      output_tokens = EXCLUDED.output_tokens,
      rolled_up_at = EXCLUDED.rolled_up_at
  `)) as unknown as { rowCount?: number | null };

  return {
    bucketStart: new Date(oldestStart),
    bucketSeconds,
    rows: result.rowCount ?? 0,
  };
}

/**
 * Ensure the rollup schedule row exists, enabled, on its cron. Idempotent
 * by fixed id, exactly like the cleanup schedule: an operator who tunes
 * the cron in the database is never clobbered by a redeploy.
 */
export async function ensureCostRollupSchedule(
  database: AnyDb,
  input: { cron: string },
): Promise<void> {
  parseCron(input.cron);
  await database.execute(sql`
    INSERT INTO job_schedules (id, queue, cron, payload, next_run_at, enabled, team_id)
    VALUES (
      ${COST_ROLLUP_SCHEDULE_ID},
      ${COST_ROLLUP_QUEUE},
      ${input.cron},
      ${JSON.stringify({ kind: "cost_rollup" })}::jsonb,
      -- First fire on the first cron slot after insert.
      ${nextCronRun(parseCron(input.cron), new Date())},
      TRUE,
      NULL
    )
    ON CONFLICT (id) DO NOTHING
  `);
}
