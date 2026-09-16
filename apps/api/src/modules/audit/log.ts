import { randomUUID } from "node:crypto";
import { auditLogs } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";

export interface AuditEvent {
  teamId?: string | null;
  actorType: string;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "allowed" | "denied";
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
}

/**
 * Transactional audit write — never a log line, never sampled. Callers pass
 * attribution; secrets, signatures, and token values must never appear here.
 */
export async function writeAudit(database: AnyDb, event: AuditEvent): Promise<void> {
  await database.insert(auditLogs).values({
    id: randomUUID(),
    teamId: event.teamId ?? null,
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    outcome: event.outcome,
    reason: event.reason ?? null,
    metadata: event.metadata ?? null,
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
    traceId: event.traceId ?? null,
  });
}
