import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../../lib/api.js";
import {
  completeDetail,
  knowledgeAccess,
  knowledgeDate,
  knowledgeFailure,
  knowledgeTrust,
  mergeItems,
  validBase,
  validCursor,
  validIngestion,
  validatePage,
} from "./helpers.js";

const item = {
  id: "item",
  knowledge_base_id: "base",
  title: null,
  trust_level: "untrusted",
  trusted_by: null,
  trusted_at: null,
  ingested_from: null,
  ingested_by: null,
  created_at: "2026-09-18T12:00:00.123456Z",
  content: " \nfull\u202e ",
  metadata: null,
};

describe("knowledge helpers", () => {
  it("uses effective permissions only", () => {
    expect(knowledgeAccess(["owner", "admin", "knowledge.*"])).toEqual({
      read: false,
      write: false,
    });
    expect(knowledgeAccess(["knowledge.read", "knowledge.write"])).toEqual({
      read: true,
      write: true,
    });
  });
  it.each(["trusted", "untrusted", "future", "Trusted", "user_input", ""])(
    "maps trust %s without unsafe fallback",
    (value) => {
      expect(knowledgeTrust(value)).toBe(
        value === "trusted" || value === "untrusted" ? value : "unknown",
      );
    },
  );
  it.each(["en", "fa"])("formats six-fraction UTC timestamps through Intl in %s", (locale) => {
    expect(knowledgeDate(item.created_at, locale)).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "long" }).format(
        new Date(item.created_at),
      ),
    );
    expect(knowledgeDate(null, locale)).toBeNull();
    expect(knowledgeDate("invalid", locale)).toBeNull();
  });
  it("validates base boundaries and optional description", () => {
    expect(validBase({ name: " " })).toBe(false);
    expect(validBase({ name: "x".repeat(200), description: "x".repeat(2000) })).toBe(true);
    expect(validBase({ name: "x".repeat(201) })).toBe(false);
    expect(validBase({ name: "x", description: "x".repeat(2001) })).toBe(false);
  });
  it("validates raw content lengths without trimming or requiring invented provenance", () => {
    expect(validIngestion({ content: " \n\t " })).toBe(true);
    expect(validIngestion({ content: "" })).toBe(false);
    expect(
      validIngestion({
        content: "x".repeat(100000),
        title: "x".repeat(500),
        ingested_from: "x".repeat(2000),
      }),
    ).toBe(true);
    expect(validIngestion({ content: "x".repeat(100001) })).toBe(false);
    expect(validIngestion({ content: "x", title: "x".repeat(501) })).toBe(false);
    expect(validIngestion({ content: "x", ingested_from: "x".repeat(2001) })).toBe(false);
    expect(validIngestion({ content: "x", title: " " })).toBe(false);
    expect(validIngestion({ content: "x", ingested_from: " " })).toBe(false);
  });
  it("requires all summary fields and complete content/metadata with matching IDs", () => {
    expect(completeDetail(item, "base", "item")).toBe(true);
    expect(completeDetail({ ...item, content: "" }, "base", "item")).toBe(true);
    expect(completeDetail(item, "other", "item")).toBe(false);
    expect(completeDetail(item, "base", "other")).toBe(false);
    for (const key of Object.keys(item)) {
      const incomplete = { ...item, [key]: undefined };
      expect(completeDetail(incomplete, "base", "item")).toBe(false);
    }
    for (const metadata of [[], "text", 1])
      expect(completeDetail({ ...item, metadata }, "base", "item")).toBe(false);
  });
  it.each([null, undefined, "", " ", "a/b", "a=", "a\n", "x".repeat(1025)])(
    "rejects malformed opaque cursor %#",
    (cursor) => {
      expect(validCursor(cursor)).toBe(false);
    },
  );
  it("accepts opaque cursor characters without decoding or timestamp reconstruction", () => {
    expect(validCursor("opaque-A_1")).toBe(true);
    expect(validCursor("x".repeat(1024))).toBe(true);
    expect(() =>
      validatePage({ items: [item], next_cursor: "opaque-A_1", has_more: true }, "base", new Set()),
    ).not.toThrow();
  });
  it("rejects oversized pages, malformed nullable fields and repeated cursors", () => {
    for (const page of [
      { items: Array.from({ length: 51 }, () => item), next_cursor: null, has_more: false },
      { items: [{ ...item, trusted_by: 42 }], next_cursor: null, has_more: false },
      { items: [item], next_cursor: "seen", has_more: true },
    ])
      expect(() => validatePage(page as never, "base", new Set(["seen"]))).toThrow();
  });
  it("deduplicates without mutating earlier snapshots, retaining latest attribution", () => {
    const previous = [item];
    const next = { ...item, trusted_by: "human" };
    expect(mergeItems(previous, [next, { ...item, id: "other" }, next])).toEqual([
      next,
      { ...item, id: "other" },
    ]);
    expect(previous).toEqual([item]);
  });
  it.each([
    [401, "OTHER", "session"],
    [403, "OTHER", "denied"],
    [404, "OTHER", "notFound"],
    [400, "INVALID_CURSOR", "cursor"],
    [400, "INVALID_INPUT", "invalid"],
    [500, "OTHER", "load"],
  ] as const)("maps %s %s without exposing server prose", (status, code, key) => {
    expect(knowledgeFailure(new ApiError(code, status, "private", "reference"))).toEqual({
      key,
      requestId: "reference",
    });
  });
  it("distinguishes ambiguous mutations from read failures", () => {
    expect(knowledgeFailure(new NetworkError())).toEqual({ key: "load", requestId: null });
    expect(knowledgeFailure(new NetworkError(), true)).toEqual({ key: "unknown", requestId: null });
    expect(knowledgeFailure(new ApiError("INTERNAL", 500, "private", "ref"), true)).toEqual({
      key: "unknown",
      requestId: "ref",
    });
  });
});
