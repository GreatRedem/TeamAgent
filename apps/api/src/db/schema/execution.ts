import { index, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { teams } from "./tenancy.js";
import { agents } from "./agents.js";
import { tools } from "./tools.js";

/**
 * agent_snapshot pins the resolved configuration that produced the run —
 * model, prompt, settings, granted tools, destinations (docs/17 T13).
 * A run's narrative output is evidence of nothing; this is.
 *
 * token_usage feeds tokens_consumed_total; cost_estimate is stored rather
 * than computed on read because provider pricing changes (docs/22, T12).
 */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("queued"),
    contextTrustLevel: text("context_trust_level").notNull().default("untrusted"),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    agentSnapshot: jsonb("agent_snapshot").$type<Record<string, unknown>>(),
    tokenUsage: jsonb("token_usage").$type<Record<string, unknown>>(),
    costEstimate: numeric("cost_estimate"),
    idempotencyKey: text("idempotency_key"),
    traceId: text("trace_id"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("agent_runs_idempotency_unique").on(table.agentId, table.idempotencyKey),
    index("agent_runs_team_status_idx").on(table.teamId, table.status),
  ],
);

/**
 * Provenance-aware execution record. Rows are written BEFORE execution and
 * updated after, so a crash mid-call still leaves evidence. Denied and
 * pending attempts are recorded, not just successful ones (docs/17 C11).
 *
 * agent_run_id is nullable: direct human execution (docs/15-api.md section
 * 9) is recorded here exactly like a model-requested call, and it has no
 * agent run. Phase 4 always sets it.
 */
export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id").references(() => tools.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    arguments: jsonb("arguments").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    contextTrustLevel: text("context_trust_level").notNull(),
    riskTier: text("risk_tier").notNull(),
    decision: text("decision").notNull(),
    decisionReason: text("decision_reason"),
    resolvedDestination: text("resolved_destination"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("tool_calls_run_idx").on(table.agentRunId),
    index("tool_calls_decision_idx").on(table.decision),
  ],
);
