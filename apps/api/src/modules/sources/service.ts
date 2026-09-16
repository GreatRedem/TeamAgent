import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { sourceConnections, sources, teamMembers } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { badRequest, conflict, notFound } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";

export interface SourceMeta {
  actorId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

function isForeignKeyViolation(error: unknown): boolean {
  // 23503 fires on insert/update against a missing parent; 23001 fires on a
  // delete blocked by RESTRICT (e.g. a connection granted to an agent).
  const code = (error as { cause?: { code?: unknown } }).cause?.code;
  return code === "23503" || code === "23001";
}

export async function createSource(
  database: AnyDb,
  input: {
    teamId: string;
    kind: string;
    name: string;
    config?: Record<string, unknown> | null;
    webhookSecretRef?: string | null;
  } & SourceMeta,
): Promise<{ id: string }> {
  if (input.kind.trim().length === 0 || input.name.trim().length === 0) {
    throw badRequest("INVALID_INPUT", "Source kind and name must not be empty.");
  }
  const id = randomUUID();
  await database.insert(sources).values({
    id,
    teamId: input.teamId,
    kind: input.kind.trim(),
    name: input.name.trim(),
    config: input.config ?? null,
    webhookSecretRef: input.webhookSecretRef ?? null,
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actorId === null ? "api_key" : "user",
    actorId: input.actorId,
    action: "source.create",
    resourceType: "source",
    resourceId: id,
    outcome: "allowed",
    metadata: { kind: input.kind.trim() },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id };
}

export async function listSources(database: AnyDb, teamId: string): Promise<unknown[]> {
  const rows = await database.select().from(sources).where(eq(sources.teamId, teamId));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    status: r.status,
    has_webhook: r.webhookSecretRef !== null,
    created_at: r.createdAt.toISOString(),
  }));
}

export async function getSource(
  database: AnyDb,
  teamId: string,
  sourceId: string,
): Promise<unknown> {
  const rows = await database
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.teamId, teamId)));
  const row = rows[0];
  if (row === undefined) throw notFound("Source");
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    has_webhook: row.webhookSecretRef !== null,
    created_at: row.createdAt.toISOString(),
  };
}

export async function updateSource(
  database: AnyDb,
  input: {
    teamId: string;
    sourceId: string;
    name?: string;
    status?: string;
    config?: Record<string, unknown> | null;
  } & SourceMeta,
): Promise<void> {
  const rows = await database
    .select()
    .from(sources)
    .where(and(eq(sources.id, input.sourceId), eq(sources.teamId, input.teamId)));
  if (rows.length === 0) throw notFound("Source");
  const patch: { name?: string; status?: string; config?: Record<string, unknown> | null } = {};
  if (input.name !== undefined) {
    if (input.name.trim().length === 0)
      throw badRequest("INVALID_INPUT", "Source name must not be empty.");
    patch.name = input.name.trim();
  }
  if (input.status !== undefined) {
    if (input.status !== "active" && input.status !== "disabled") {
      throw badRequest("INVALID_INPUT", "Status must be active or disabled.");
    }
    patch.status = input.status;
  }
  if (input.config !== undefined) patch.config = input.config;
  if (Object.keys(patch).length > 0) {
    await database.update(sources).set(patch).where(eq(sources.id, input.sourceId));
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actorId === null ? "api_key" : "user",
    actorId: input.actorId,
    action: "source.update",
    resourceType: "source",
    resourceId: input.sourceId,
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function createConnection(
  database: AnyDb,
  input: {
    teamId: string;
    sourceId: string;
    name: string;
    ownerScope?: string;
    userId?: string | null;
    credentialRef?: string | null;
  } & SourceMeta,
): Promise<{ id: string }> {
  const parent = await database
    .select()
    .from(sources)
    .where(and(eq(sources.id, input.sourceId), eq(sources.teamId, input.teamId)));
  if (parent.length === 0) throw notFound("Source");
  if (input.name.trim().length === 0) {
    throw badRequest("INVALID_INPUT", "Connection name must not be empty.");
  }
  const ownerScope = input.ownerScope ?? "team";
  let userId: string | null = null;
  if (ownerScope === "user") {
    if (input.userId === undefined || input.userId === null) {
      throw badRequest("INVALID_INPUT", "User-scoped connections require user_id.");
    }
    const membership = await database
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
    if (membership.length === 0) {
      throw badRequest("UNKNOWN_USER", "The owning user is not a member of this team.");
    }
    userId = input.userId;
  } else if (ownerScope !== "team") {
    throw badRequest("INVALID_INPUT", "owner_scope must be team or user.");
  }
  const id = randomUUID();
  await database.insert(sourceConnections).values({
    id,
    teamId: input.teamId,
    sourceId: input.sourceId,
    name: input.name.trim(),
    ownerScope,
    userId,
    credentialRef: input.credentialRef ?? null,
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actorId === null ? "api_key" : "user",
    actorId: input.actorId,
    action: "source.connect",
    resourceType: "source_connection",
    resourceId: id,
    outcome: "allowed",
    metadata: { owner_scope: ownerScope },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id };
}

export async function listConnections(
  database: AnyDb,
  teamId: string,
  sourceId: string,
): Promise<unknown[]> {
  const parent = await database
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.teamId, teamId)));
  if (parent.length === 0) throw notFound("Source");
  const rows = await database
    .select()
    .from(sourceConnections)
    .where(and(eq(sourceConnections.sourceId, sourceId), eq(sourceConnections.teamId, teamId)));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    owner_scope: r.ownerScope,
    status: r.status,
    created_at: r.createdAt.toISOString(),
  }));
}

export async function deleteConnection(
  database: AnyDb,
  input: { teamId: string; sourceId: string; connectionId: string } & SourceMeta,
): Promise<void> {
  const rows = await database
    .select()
    .from(sourceConnections)
    .where(
      and(
        eq(sourceConnections.id, input.connectionId),
        eq(sourceConnections.sourceId, input.sourceId),
        eq(sourceConnections.teamId, input.teamId),
      ),
    );
  if (rows.length === 0) throw notFound("Connection");
  try {
    await database.delete(sourceConnections).where(eq(sourceConnections.id, input.connectionId));
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        "CONNECTION_IN_USE",
        "The connection is granted to an agent and cannot be removed.",
      );
    }
    throw error;
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: input.actorId === null ? "api_key" : "user",
    actorId: input.actorId,
    action: "source.disconnect",
    resourceType: "source_connection",
    resourceId: input.connectionId,
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
