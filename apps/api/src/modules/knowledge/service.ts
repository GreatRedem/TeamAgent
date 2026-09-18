import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentKnowledgeBases,
  agents,
  knowledgeBases,
  knowledgeChunks,
  knowledgeItems,
} from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { badRequest, notFound } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";
import { chunkContent } from "./chunk.js";

export interface KnowledgeMeta {
  actorId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const MAX_CONTENT_CHARS = 100_000;
const MAX_QUERY_TERMS = 12;
const CANDIDATE_CAP = 200;

function actorType(actorId: string | null): string {
  return actorId === null ? "api_key" : "user";
}

async function requireBase(database: AnyDb, teamId: string, baseId: string) {
  const rows = await database
    .select()
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.id, baseId), eq(knowledgeBases.teamId, teamId)));
  const base = rows[0];
  if (base === undefined) throw notFound("Knowledge base");
  return base;
}

function toBaseJson(row: typeof knowledgeBases.$inferSelect): unknown {
  return {
    id: row.id,
    name: row.name,
    type: row.kind,
    description: row.description,
    created_at: row.createdAt.toISOString(),
  };
}

export async function createBase(
  database: AnyDb,
  input: {
    teamId: string;
    name: string;
    kind?: string | null;
    description?: string | null;
  } & KnowledgeMeta,
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (name.length === 0)
    throw badRequest("INVALID_INPUT", "Knowledge base name must not be empty.");
  const id = randomUUID();
  await database.insert(knowledgeBases).values({
    id,
    teamId: input.teamId,
    name,
    kind: input.kind?.trim() ? input.kind.trim() : null,
    description: input.description ?? null,
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "knowledge.base.create",
    resourceType: "knowledge_base",
    resourceId: id,
    outcome: "allowed",
    metadata: { name },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id };
}

export async function listBases(database: AnyDb, teamId: string): Promise<unknown[]> {
  const rows = await database
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.teamId, teamId));
  return rows.map(toBaseJson);
}

export async function getBase(database: AnyDb, teamId: string, baseId: string): Promise<unknown> {
  return toBaseJson(await requireBase(database, teamId, baseId));
}

export interface KnowledgeItemSummary {
  id: string;
  knowledge_base_id: string;
  title: string | null;
  trust_level: string;
  trusted_by: string | null;
  trusted_at: string | null;
  ingested_from: string | null;
  ingested_by: string | null;
  created_at: string;
}

export interface KnowledgeItemDetail extends KnowledgeItemSummary {
  content: string;
  metadata: Record<string, unknown> | null;
}

export interface KnowledgeItemPage {
  items: KnowledgeItemSummary[];
  next_cursor: string | null;
  has_more: boolean;
}

const itemSummarySelection = {
  id: knowledgeItems.id,
  knowledge_base_id: knowledgeItems.knowledgeBaseId,
  title: knowledgeItems.title,
  trust_level: knowledgeItems.trustLevel,
  trusted_by: knowledgeItems.trustedBy,
  trusted_at: sql<
    string | null
  >`to_char(${knowledgeItems.trustedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  ingested_from: knowledgeItems.ingestedFrom,
  ingested_by: knowledgeItems.ingestedBy,
  created_at: sql<string>`to_char(${knowledgeItems.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};

const ItemCursor = z
  .object({
    version: z.literal(1),
    team_id: z.string().uuid(),
    knowledge_base_id: z.string().uuid(),
    id: z.string().uuid(),
    created_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
      .refine((value) => {
        const milliseconds = value.replace(/\d{3}Z$/, "Z");
        const date = new Date(milliseconds);
        return (
          Number.isFinite(date.getTime()) &&
          date.getUTCFullYear() >= 1 &&
          date.toISOString() === milliseconds
        );
      }),
  })
  .strict();

function decodeItemCursor(
  value: string,
  teamId: string,
  baseId: string,
): z.infer<typeof ItemCursor> {
  try {
    if (value.length === 0 || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error("Invalid encoding");
    }
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) throw new Error("Invalid encoding");
    const cursor = ItemCursor.parse(JSON.parse(decoded.toString("utf8")));
    if (cursor.team_id !== teamId || cursor.knowledge_base_id !== baseId) {
      throw new Error("Invalid scope");
    }
    return cursor;
  } catch {
    throw badRequest("INVALID_CURSOR", "The knowledge item cursor is invalid.");
  }
}

export async function listItems(
  database: AnyDb,
  input: { teamId: string; baseId: string; limit?: number; cursor?: string },
): Promise<KnowledgeItemPage> {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw badRequest("INVALID_INPUT", "Limit must be an integer between 1 and 200.");
  }
  await requireBase(database, input.teamId, input.baseId);
  const cursor =
    input.cursor === undefined
      ? undefined
      : decodeItemCursor(input.cursor, input.teamId, input.baseId);
  const rows = await database
    .select(itemSummarySelection)
    .from(knowledgeItems)
    .where(
      and(
        eq(knowledgeItems.teamId, input.teamId),
        eq(knowledgeItems.knowledgeBaseId, input.baseId),
        cursor === undefined
          ? undefined
          : sql`(${knowledgeItems.createdAt}, ${knowledgeItems.id}) < (${cursor.created_at}::timestamptz, ${cursor.id}::uuid)`,
      ),
    )
    .orderBy(desc(knowledgeItems.createdAt), desc(knowledgeItems.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = items.at(-1);
  return {
    items,
    next_cursor:
      hasMore && last !== undefined
        ? Buffer.from(
            JSON.stringify({
              version: 1,
              team_id: input.teamId,
              knowledge_base_id: input.baseId,
              id: last.id,
              created_at: last.created_at,
            }),
          ).toString("base64url")
        : null,
    has_more: hasMore,
  };
}

export async function getItem(
  database: AnyDb,
  teamId: string,
  baseId: string,
  itemId: string,
): Promise<KnowledgeItemDetail> {
  await requireBase(database, teamId, baseId);
  const rows = await database
    .select({
      ...itemSummarySelection,
      content: knowledgeItems.content,
      metadata: knowledgeItems.metadata,
    })
    .from(knowledgeItems)
    .where(
      and(
        eq(knowledgeItems.teamId, teamId),
        eq(knowledgeItems.knowledgeBaseId, baseId),
        eq(knowledgeItems.id, itemId),
      ),
    );
  const item = rows[0];
  if (item === undefined) throw notFound("Knowledge item");
  return item;
}

export async function createItem(
  database: AnyDb,
  input: {
    teamId: string;
    baseId: string;
    title?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
    ingestedFrom?: string | null;
  } & KnowledgeMeta,
): Promise<{ id: string; chunkCount: number }> {
  await requireBase(database, input.teamId, input.baseId);
  if (input.content.length === 0 || input.content.length > MAX_CONTENT_CHARS) {
    throw badRequest(
      "INVALID_INPUT",
      `Content must be between 1 and ${MAX_CONTENT_CHARS} characters.`,
    );
  }
  const chunks = chunkContent(input.content);
  if (chunks.length === 0) {
    throw badRequest("INVALID_INPUT", "Content must contain searchable text.");
  }
  const id = randomUUID();
  // Ingestion never produces a trusted item: trust_level defaults to
  // untrusted and there is deliberately no input that overrides it.
  await database.insert(knowledgeItems).values({
    id,
    teamId: input.teamId,
    knowledgeBaseId: input.baseId,
    title: input.title?.trim() ? input.title.trim() : null,
    content: input.content,
    ingestedFrom: input.ingestedFrom?.trim() ? input.ingestedFrom.trim() : null,
    ingestedBy: input.actorId,
    metadata: input.metadata ?? null,
  });
  await database.insert(knowledgeChunks).values(
    chunks.map((chunk) => ({
      id: randomUUID(),
      teamId: input.teamId,
      knowledgeBaseId: input.baseId,
      knowledgeItemId: id,
      ordinal: chunk.ordinal,
      content: chunk.content,
      charCount: chunk.charCount,
    })),
  );
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: actorType(input.actorId),
    actorId: input.actorId,
    action: "knowledge.item.create",
    resourceType: "knowledge_item",
    resourceId: id,
    outcome: "allowed",
    metadata: { knowledge_base_id: input.baseId, chunks: chunks.length },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id, chunkCount: chunks.length };
}

function toItemJson(row: typeof knowledgeItems.$inferSelect): unknown {
  return {
    id: row.id,
    knowledge_base_id: row.knowledgeBaseId,
    title: row.title,
    trust_level: row.trustLevel,
    trusted_by: row.trustedBy,
    trusted_at: row.trustedAt ? row.trustedAt.toISOString() : null,
    ingested_from: row.ingestedFrom,
  };
}

/**
 * Trust is an action a human takes. Setting trusted records who and when;
 * clearing returns the item to untrusted and takes effect on the next
 * retrieval — it never rewrites runs that already used the item.
 */
export async function setItemTrust(
  database: AnyDb,
  input: {
    teamId: string;
    baseId: string;
    itemId: string;
    trusted: boolean;
    actorId: string;
  } & KnowledgeMeta,
): Promise<unknown> {
  await requireBase(database, input.teamId, input.baseId);
  const rows = await database
    .select()
    .from(knowledgeItems)
    .where(
      and(
        eq(knowledgeItems.id, input.itemId),
        eq(knowledgeItems.knowledgeBaseId, input.baseId),
        eq(knowledgeItems.teamId, input.teamId),
      ),
    );
  const item = rows[0];
  if (item === undefined) throw notFound("Knowledge item");
  const now = new Date();
  await database
    .update(knowledgeItems)
    .set(
      input.trusted
        ? { trustLevel: "trusted", trustedBy: input.actorId, trustedAt: now }
        : { trustLevel: "untrusted", trustedBy: null, trustedAt: null },
    )
    .where(eq(knowledgeItems.id, input.itemId));
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "user",
    actorId: input.actorId,
    action: "knowledge.item.trust",
    resourceType: "knowledge_item",
    resourceId: input.itemId,
    outcome: "allowed",
    metadata: { trusted: input.trusted },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  const refreshed = await database
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.id, input.itemId));
  return toItemJson(
    refreshed[0] ?? { ...item, trustLevel: input.trusted ? "trusted" : "untrusted" },
  );
}

export interface ChunkHit {
  chunkId: string;
  knowledgeBaseId: string;
  baseName: string;
  itemId: string;
  title: string | null;
  content: string;
  trustLevel: string;
  ingestedFrom: string | null;
  score: number;
}

/** Lowercase alphanumeric terms; punctuation-only queries match nothing. */
export function tokenizeQuery(query: string): string[] {
  const terms = new Set<string>();
  for (const token of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 2) terms.add(token);
    if (terms.size >= MAX_QUERY_TERMS) break;
  }
  return [...terms];
}

function scoreChunk(content: string, terms: string[]): number {
  const lower = content.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let index = lower.indexOf(term);
    while (index !== -1) {
      score += 1;
      index = lower.indexOf(term, index + term.length);
    }
  }
  return score;
}

async function searchChunks(
  database: AnyDb,
  teamId: string,
  baseIds: string[],
  terms: string[],
  limit: number,
): Promise<ChunkHit[]> {
  const candidates = await database
    .select({
      chunkId: knowledgeChunks.id,
      knowledgeBaseId: knowledgeChunks.knowledgeBaseId,
      baseName: knowledgeBases.name,
      itemId: knowledgeChunks.knowledgeItemId,
      title: knowledgeItems.title,
      content: knowledgeChunks.content,
      trustLevel: knowledgeItems.trustLevel,
      ingestedFrom: knowledgeItems.ingestedFrom,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeItems, eq(knowledgeChunks.knowledgeItemId, knowledgeItems.id))
    .innerJoin(knowledgeBases, eq(knowledgeChunks.knowledgeBaseId, knowledgeBases.id))
    .where(
      and(
        eq(knowledgeChunks.teamId, teamId),
        inArray(knowledgeChunks.knowledgeBaseId, baseIds),
        or(...terms.map((term) => ilike(knowledgeChunks.content, `%${term}%`))),
      ),
    )
    .limit(CANDIDATE_CAP);
  return candidates
    .map((row) => ({ ...row, score: scoreChunk(row.content, terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function toHitJson(hit: ChunkHit): unknown {
  return {
    chunk_id: hit.chunkId,
    knowledge_base_id: hit.knowledgeBaseId,
    item_id: hit.itemId,
    title: hit.title,
    content: hit.content,
    trust_level: hit.trustLevel,
    ingested_from: hit.ingestedFrom,
    score: hit.score,
  };
}

/** Human search over explicitly named team bases (knowledge.read). */
export async function searchKnowledge(
  database: AnyDb,
  input: { teamId: string; baseIds: string[]; query: string; limit?: number },
): Promise<unknown[]> {
  const uniqueBaseIds = [...new Set(input.baseIds)];
  if (uniqueBaseIds.length === 0) {
    throw badRequest("INVALID_INPUT", "At least one knowledge base is required.");
  }
  const bases = await database
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.teamId, input.teamId), inArray(knowledgeBases.id, uniqueBaseIds)));
  if (bases.length !== uniqueBaseIds.length) {
    throw badRequest(
      "UNKNOWN_KNOWLEDGE_BASE",
      "One of the knowledge bases does not exist in this team.",
    );
  }
  const terms = tokenizeQuery(input.query);
  if (terms.length === 0) return [];
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
  const hits = await searchChunks(database, input.teamId, uniqueBaseIds, terms, limit);
  return hits.map(toHitJson);
}

/**
 * Agent retrieval: same ranking, but the base set comes from the agent's
 * grants, never from the caller. Trust is read live per item so a trust
 * change takes effect on the next retrieval. Each hit carries its item's
 * own trust level — one untrusted chunk taints the run, by design.
 */
export async function retrieveForAgent(
  database: AnyDb,
  input: { teamId: string; agentId: string; query: string; limit?: number },
): Promise<ChunkHit[]> {
  const agentRows = await database
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.teamId, input.teamId)));
  if (agentRows.length === 0) throw notFound("Agent");
  const grantRows = await database
    .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
    .from(agentKnowledgeBases)
    .where(
      and(
        eq(agentKnowledgeBases.agentId, input.agentId),
        eq(agentKnowledgeBases.teamId, input.teamId),
      ),
    );
  if (grantRows.length === 0) return [];
  const terms = tokenizeQuery(input.query);
  if (terms.length === 0) return [];
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
  return searchChunks(
    database,
    input.teamId,
    grantRows.map((r) => r.knowledgeBaseId),
    terms,
    limit,
  );
}
