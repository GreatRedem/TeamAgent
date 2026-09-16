import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AnyDb } from "../../db/db.js";
import { jobs } from "../../db/schema/index.js";
import { observeHistogram } from "../../observability/metrics.js";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead";

export interface QueueJob {
  id: string;
  queue: string;
  teamId: string | null;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  idempotencyKey: string | null;
  traceId: string | null;
  contextTrustLevel: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

type JobRow = Omit<QueueJob, "status"> & {
  status: string;
};

const JOB_COLUMNS = sql`
  id,
  queue,
  team_id AS "teamId",
  payload,
  status,
  priority,
  run_at AS "runAt",
  attempts,
  max_attempts AS "maxAttempts",
  locked_at AS "lockedAt",
  locked_by AS "lockedBy",
  last_error AS "lastError",
  idempotency_key AS "idempotencyKey",
  trace_id AS "traceId",
  context_trust_level AS "contextTrustLevel",
  created_at AS "createdAt",
  completed_at AS "completedAt"
`;

function asJob(row: JobRow): QueueJob {
  return { ...row, status: row.status as JobStatus };
}

export async function enqueueJob(
  database: AnyDb,
  input: {
    queue: string;
    teamId?: string | null;
    payload: Record<string, unknown>;
    priority?: number;
    runAt?: Date;
    maxAttempts?: number;
    idempotencyKey?: string | null;
    traceId?: string | null;
    contextTrustLevel?: string | null;
  },
): Promise<QueueJob> {
  const id = randomUUID();
  await database.insert(jobs).values({
    id,
    queue: input.queue,
    teamId: input.teamId ?? null,
    payload: input.payload,
    priority: input.priority ?? 0,
    runAt: input.runAt,
    maxAttempts: input.maxAttempts ?? 5,
    idempotencyKey: input.idempotencyKey ?? null,
    traceId: input.traceId ?? null,
    contextTrustLevel: input.contextTrustLevel ?? null,
  });

  const rows = await database.execute(sql`
    SELECT ${JOB_COLUMNS}
    FROM jobs
    WHERE id = ${id}
  `);
  const row = (rows as unknown as { rows: JobRow[] }).rows[0];
  if (row === undefined) throw new Error("queued job was not readable after insert");
  return asJob(row);
}

/** Claim exactly one due job using PostgreSQL row locking and SKIP LOCKED. */
export async function claimJob(
  database: AnyDb,
  input: { workerId: string; queue?: string; now?: Date },
): Promise<QueueJob | null> {
  const now = input.now ?? new Date();
  const queueFilter = input.queue === undefined ? sql`` : sql`AND queue = ${input.queue}`;
  const rows = await database.execute(sql`
    UPDATE jobs SET
      status = 'running',
      locked_at = ${now},
      locked_by = ${input.workerId},
      attempts = attempts + 1
    WHERE id = (
      SELECT id
      FROM jobs
      WHERE status = 'queued'
        AND run_at <= ${now}
        ${queueFilter}
      ORDER BY priority DESC, run_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING ${JOB_COLUMNS}
  `);
  const row = (rows as unknown as { rows: JobRow[] }).rows[0];
  if (row === undefined) return null;
  // Enqueue-to-claim wait (docs/22): run_at is the earliest moment the job
  // should run and the claim filter guarantees run_at <= now, so the
  // difference is the wait itself — including retry backoff, which is why
  // the label stays on the queue, not the failure. The reaper resets run_at
  // on reclaim, so a reaped job's wait measures its second attempt.
  // Raw SQL returns timestamps as strings under PGlite (dates parse as Date
  // under node-postgres), so normalize before arithmetic.
  const runAt = row.runAt instanceof Date ? row.runAt : new Date(row.runAt);
  observeHistogram(
    "queue_wait_seconds",
    { queue: row.queue },
    Math.max(0, (now.getTime() - runAt.getTime()) / 1000),
  );
  return asJob(row);
}

export async function heartbeatJob(
  database: AnyDb,
  input: { jobId: string; workerId: string; now?: Date },
): Promise<boolean> {
  const result = (await database.execute(sql`
    UPDATE jobs
    SET locked_at = ${input.now ?? new Date()}
    WHERE id = ${input.jobId}
      AND status = 'running'
      AND locked_by = ${input.workerId}
  `)) as unknown as { rowCount?: number | null };
  return (result.rowCount ?? 0) === 1;
}

export async function completeJob(
  database: AnyDb,
  input: { jobId: string; workerId: string; now?: Date },
): Promise<boolean> {
  const result = (await database.execute(sql`
    UPDATE jobs
    SET status = 'succeeded', completed_at = ${input.now ?? new Date()}, locked_at = NULL, locked_by = NULL
    WHERE id = ${input.jobId}
      AND status = 'running'
      AND locked_by = ${input.workerId}
  `)) as unknown as { rowCount?: number | null };
  return (result.rowCount ?? 0) === 1;
}

export async function failJob(
  database: AnyDb,
  input: { jobId: string; workerId: string; error: string; retryAt: Date },
): Promise<"queued" | "dead" | null> {
  const rows = await database.execute(sql`
    UPDATE jobs
    SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
        run_at = ${input.retryAt},
        last_error = ${input.error},
        locked_at = NULL,
        locked_by = NULL,
        completed_at = CASE WHEN attempts >= max_attempts THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ${input.jobId}
      AND status = 'running'
      AND locked_by = ${input.workerId}
    RETURNING status
  `);
  const row = (rows as unknown as { rows: Array<{ status: "queued" | "dead" }> }).rows[0];
  return row?.status ?? null;
}

export async function reapExpiredJobs(
  database: AnyDb,
  input: { leaseMs: number; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - input.leaseMs);
  const result = (await database.execute(sql`
    UPDATE jobs
    SET status = 'queued', locked_at = NULL, locked_by = NULL, run_at = ${now}
    WHERE status = 'running'
      AND locked_at < ${cutoff}
  `)) as unknown as { rowCount?: number | null };
  return result.rowCount ?? 0;
}
