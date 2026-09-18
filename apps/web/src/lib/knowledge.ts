import type { Http } from "./http.js";

export interface KnowledgeBase {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  created_at: string;
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

export interface CreateKnowledgeBaseInput {
  name: string;
  description?: string;
}

export interface IngestKnowledgeInput {
  title?: string;
  content: string;
  ingested_from?: string;
}

export function knowledgePath(teamId: string, baseId?: string, itemId?: string): string {
  const base = `/teams/${encodeURIComponent(teamId)}/knowledge`;
  return baseId === undefined
    ? base
    : `${base}/${encodeURIComponent(baseId)}${itemId === undefined ? "" : `/items/${encodeURIComponent(itemId)}`}`;
}

export function listKnowledgeBases(
  http: Http,
  teamId: string,
): Promise<{ knowledge_bases: KnowledgeBase[] }> {
  return http.request("GET", knowledgePath(teamId));
}

export function createKnowledgeBase(
  http: Http,
  teamId: string,
  input: CreateKnowledgeBaseInput,
): Promise<{ id: string }> {
  return http.request("POST", knowledgePath(teamId), {
    body: { name: input.name, description: input.description },
  });
}

export function listKnowledgeItems(
  http: Http,
  teamId: string,
  baseId: string,
  cursor?: string,
): Promise<KnowledgeItemPage> {
  return http.request("GET", `${knowledgePath(teamId, baseId)}/items`, {
    query: { limit: 50, cursor },
  });
}

export function getKnowledgeItem(
  http: Http,
  teamId: string,
  baseId: string,
  itemId: string,
): Promise<KnowledgeItemDetail> {
  return http.request("GET", knowledgePath(teamId, baseId, itemId));
}

export function ingestKnowledge(
  http: Http,
  teamId: string,
  baseId: string,
  input: IngestKnowledgeInput,
): Promise<{ id: string; chunk_count: number }> {
  return http.request("POST", `${knowledgePath(teamId, baseId)}/items`, {
    body: { title: input.title, content: input.content, ingested_from: input.ingested_from },
  });
}

export async function setKnowledgeTrust(
  http: Http,
  teamId: string,
  baseId: string,
  itemId: string,
  trusted: boolean,
): Promise<void> {
  await http.request("POST", `${knowledgePath(teamId, baseId, itemId)}/trust`, {
    body: { trusted },
  });
}
