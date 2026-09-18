import { ApiError, NetworkError } from "../../lib/api.js";

export function sourceAccess(permissions: readonly string[]) {
  return {
    read: permissions.includes("source.read"),
    connect: permissions.includes("source.connect"),
    disconnect: permissions.includes("source.disconnect"),
  };
}

export function validSourceText(value: string, limit = 200): boolean {
  return value.trim().length > 0 && value.length <= limit;
}

export function sourceStatus(value: string): "active" | "disabled" | "unknown" {
  return value === "active" || value === "disabled" ? value : "unknown";
}

export function sourceDate(value: string, locale: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)
    : null;
}

export interface SourceFailure {
  key: "denied" | "session" | "notFound" | "inUse" | "invalid" | "unknown" | "load";
  denied: boolean;
  requestId: string | null;
}

export function sourceFailure(error: unknown, mutation = false): SourceFailure {
  const fallback = mutation ? "unknown" : "load";
  if (error instanceof ApiError) {
    return {
      key:
        error.status === 403
          ? "denied"
          : error.status === 401
            ? "session"
            : error.status === 404
              ? "notFound"
              : error.code === "CONNECTION_IN_USE"
                ? "inUse"
                : error.code === "INVALID_INPUT"
                  ? "invalid"
                  : fallback,
      denied: error.status === 403,
      requestId: error.requestId,
    };
  }
  return {
    key: error instanceof NetworkError && mutation ? "unknown" : fallback,
    denied: false,
    requestId: null,
  };
}
