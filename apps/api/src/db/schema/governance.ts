import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { teams } from "./tenancy.js";
import { users } from "./identity.js";

/**
 * Human gate for write-tier actions on untrusted context (docs/17 C5).
 * triggering_content + triggering_origin are what make review meaningful.
 * expires_at is NOT NULL: an expired approval is a denial.
 */
export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  agentRunId: uuid("agent_run_id"),
  toolCallId: uuid("tool_call_id"),
  proposedAction: jsonb("proposed_action").$type<Record<string, unknown>>(),
  resolvedDestination: text("resolved_destination"),
  triggeringContent: text("triggering_content"),
  triggeringOrigin: text("triggering_origin"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/**
 * Transactional audit writes, never log lines, never sampled. team_id,
 * actor_id, and resource_id deliberately carry no foreign key so rows
 * survive deletion of what they describe. resource_id is nullable (a failed
 * login has no resource). Denials are recorded, not only successes.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id"),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    outcome: text("outcome").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_team_created_idx").on(table.teamId, table.createdAt),
    index("audit_logs_trace_idx").on(table.traceId),
  ],
);
