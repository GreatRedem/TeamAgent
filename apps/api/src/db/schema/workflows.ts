import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { teams } from "./tenancy.js";

/**
 * Stable identity + pointer to the current version. All executable content
 * lives on immutable workflow_versions rows, so editing a workflow cannot
 * change a run already in flight.
 *
 * R5: current_version_id carries no foreign key (mutually referential with
 * workflow_versions.workflow_id) and is checked in application code.
 */
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  currentVersionId: uuid("current_version_id"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    trigger: jsonb("trigger").$type<Record<string, unknown>>(),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("workflow_versions_unique").on(table.workflowId, table.version)],
);

export const workflowSteps = pgTable(
  "workflow_steps",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    workflowVersionId: uuid("workflow_version_id")
      .notNull()
      .references(() => workflowVersions.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    kind: text("kind").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("workflow_steps_unique").on(table.workflowVersionId, table.stepKey)],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "restrict" }),
    workflowVersionId: uuid("workflow_version_id")
      .notNull()
      .references(() => workflowVersions.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("queued"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    contextTrustLevel: text("context_trust_level").notNull().default("untrusted"),
    idempotencyKey: text("idempotency_key"),
    traceId: text("trace_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("workflow_runs_idempotency_unique").on(table.workflowId, table.idempotencyKey),
  ],
);

/**
 * Per-step execution state. context_trust_level carries taint across step
 * boundaries: the minimum of a step's own inputs and every upstream step
 * that fed it (docs/17 T8).
 */
export const workflowStepRuns = pgTable("workflow_step_runs", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  workflowRunId: uuid("workflow_run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  workflowStepId: uuid("workflow_step_id").references(() => workflowSteps.id, {
    onDelete: "set null",
  }),
  /** Logical reference to agent_runs.id (no FK: avoids a schema cycle). */
  agentRunId: uuid("agent_run_id"),
  status: text("status").notNull().default("queued"),
  attempt: integer("attempt").notNull().default(1),
  contextTrustLevel: text("context_trust_level").notNull().default("untrusted"),
  input: jsonb("input").$type<Record<string, unknown>>(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
