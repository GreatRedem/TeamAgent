import { ApiError } from "../../lib/api.js";
import type {
  CreateKnowledgeBaseInput,
  IngestKnowledgeInput,
  KnowledgeItemDetail,
  KnowledgeItemPage,
  KnowledgeItemSummary,
} from "../../lib/knowledge.js";

export function knowledgeAccess(permissions: readonly string[]) {
  return {
    read: permissions.includes("knowledge.read"),
    write: permissions.includes("knowledge.write"),
  };
}

export function knowledgeTrust(value: string): "trusted" | "untrusted" | "unknown" {
  return value === "trusted" || value === "untrusted" ? value : "unknown";
}

export function knowledgeDate(value: string | null, locale: string): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "long" }).format(date)
    : null;
}

export function validBase(input: CreateKnowledgeBaseInput): boolean {
  return (
    input.name.trim().length > 0 &&
    input.name.length <= 200 &&
    (input.description === undefined || input.description.length <= 2000)
  );
}

export function validIngestion(input: IngestKnowledgeInput): boolean {
  return (
    input.content.length > 0 &&
    input.content.length <= 100_000 &&
    (input.title === undefined || (input.title.trim().length > 0 && input.title.length <= 500)) &&
    (input.ingested_from === undefined ||
      (input.ingested_from.trim().length > 0 && input.ingested_from.length <= 2000))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summary(value: unknown, baseId: string): value is KnowledgeItemSummary {
  return (
    record(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.knowledge_base_id === baseId &&
    typeof value.trust_level === "string" &&
    typeof value.created_at === "string" &&
    ["title", "trusted_by", "trusted_at", "ingested_from", "ingested_by"].every(
      (key) => value[key] === null || typeof value[key] === "string",
    )
  );
}

export function completeDetail(
  value: unknown,
  baseId: string,
  itemId: string,
): value is KnowledgeItemDetail {
  return (
    summary(value, baseId) &&
    value.id === itemId &&
    record(value) &&
    typeof value.content === "string" &&
    (value.metadata === null || record(value.metadata))
  );
}

export function validCursor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function validatePage(
  value: KnowledgeItemPage,
  baseId: string,
  seen: ReadonlySet<string>,
): void {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    !value.items.every((item) => summary(item, baseId)) ||
    typeof value.has_more !== "boolean" ||
    (value.has_more
      ? !validCursor(value.next_cursor) || seen.has(value.next_cursor) || value.items.length === 0
      : value.next_cursor !== null)
  ) {
    throw new ApiError("INVALID_CURSOR", 400, "Invalid inventory response", null);
  }
}

export function mergeItems(
  previous: KnowledgeItemSummary[],
  incoming: KnowledgeItemSummary[],
): KnowledgeItemSummary[] {
  const items = new Map(previous.map((item) => [item.id, item]));
  incoming.forEach((item) => items.set(item.id, item));
  return [...items.values()];
}

export interface KnowledgeFailure {
  key: "denied" | "session" | "notFound" | "invalid" | "cursor" | "unknown" | "load";
  requestId: string | null;
}

export function knowledgeFailure(error: unknown, mutation = false): KnowledgeFailure {
  return {
    key:
      error instanceof ApiError
        ? error.status === 403
          ? "denied"
          : error.status === 401
            ? "session"
            : error.status === 404
              ? "notFound"
              : error.code === "INVALID_CURSOR"
                ? "cursor"
                : error.code === "INVALID_INPUT"
                  ? "invalid"
                  : mutation
                    ? "unknown"
                    : "load"
        : mutation
          ? "unknown"
          : "load",
    requestId: error instanceof ApiError ? error.requestId : null,
  };
}
