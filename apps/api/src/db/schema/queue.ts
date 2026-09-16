import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { teams } from "./tenancy.js";

/**
 * No broker: async work is queued in this same database so an enqueue can
 * participate in the transaction that created the work (docs/23-job-queue.md).
 *
 * Claiming is a single atomic conditional update with FOR UPDATE SKIP
 * LOCKED. locked_at doubles as the lease heartbeat; handlers must be
 * idempotent because a reclaimed job reruns.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey(),
    queue: text("queue").notNull(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    runAt: timestamp("run_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key"),
    traceId: text("trace_id"),
    contextTrustLevel: text("context_trust_level"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("jobs_queue_idempotency_unique").on(table.queue, table.idempotencyKey),
    index("jobs_claim_idx").on(table.status, table.runAt, table.priority),
    index("jobs_reaper_idx").on(table.status, table.lockedAt),
    index("jobs_queue_status_idx").on(table.queue, table.status),
  ],
);

/**
 * Cron triggers. Only one scheduler ticks at a time (pg_try_advisory_lock);
 * the tick enqueues a job and advances next_run_at.
 */
export const jobSchedules = pgTable("job_schedules", {
  id: uuid("id").primaryKey(),
  queue: text("queue").notNull(),
  cron: text("cron").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
  enabled: boolean("enabled").notNull().default(true),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
