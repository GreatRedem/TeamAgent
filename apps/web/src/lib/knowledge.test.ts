import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "./api.js";
import { Http } from "./http.js";
import {
  createKnowledgeBase,
  getKnowledgeItem,
  ingestKnowledge,
  knowledgePath,
  listKnowledgeBases,
  listKnowledgeItems,
  setKnowledgeTrust,
} from "./knowledge.js";

const fetchMock = vi.fn<typeof fetch>();
const http = new Http(
  () => "token",
  async () => null,
);
const team = "team /?#%فارسی";
const baseId = "base /?#%";
const itemId = "item /?#%";
const base = `/teams/${encodeURIComponent(team)}/knowledge`;
const items = `${base}/${encodeURIComponent(baseId)}/items`;
const detailPath = `${items}/${encodeURIComponent(itemId)}`;
const detail = {
  id: itemId,
  knowledge_base_id: baseId,
  title: null,
  trust_level: "untrusted",
  trusted_by: null,
  trusted_at: null,
  ingested_from: null,
  ingested_by: null,
  created_at: "2026-09-18T12:00:00.123456Z",
  content: "  \ncomplete\u202e  ",
  metadata: { nested: { retained: true } },
};
function success(data: unknown) {
  return new Response(
    JSON.stringify({ success: true, data, error: null, request_id: "reference" }),
  );
}
function request(method: string, path: string, body?: unknown) {
  expect(fetchMock).toHaveBeenLastCalledWith(path, {
    method,
    headers: {
      accept: "application/json",
      authorization: "Bearer token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("knowledge client contracts", () => {
  it("encodes each scope segment independently", () => {
    expect(knowledgePath(team)).toBe(base);
    expect(knowledgePath(team, baseId, itemId)).toBe(detailPath);
  });
  it("reads bases in the server envelope", async () => {
    const data = {
      knowledge_bases: [
        { id: baseId, name: "Base", type: null, description: null, created_at: detail.created_at },
      ],
    };
    fetchMock.mockResolvedValueOnce(success(data));
    await expect(listKnowledgeBases(http, team)).resolves.toEqual(data);
    request("GET", base);
  });
  it("requests the first 50 summaries without cursor", async () => {
    const data = { items: [detail], next_cursor: "opaque", has_more: true };
    fetchMock.mockResolvedValueOnce(success(data));
    await expect(listKnowledgeItems(http, team, baseId)).resolves.toEqual(data);
    request("GET", `${items}?limit=50`);
  });
  it("passes opaque cursors unchanged through query encoding", async () => {
    fetchMock.mockResolvedValueOnce(success({ items: [], next_cursor: null, has_more: false }));
    await listKnowledgeItems(http, team, baseId, "opaque /+?%فارسی");
    request("GET", `${items}?${new URLSearchParams({ limit: "50", cursor: "opaque /+?%فارسی" })}`);
  });
  it("preserves full content, nulls, metadata and all timestamp digits", async () => {
    fetchMock.mockResolvedValueOnce(success(detail));
    await expect(getKnowledgeItem(http, team, baseId, itemId)).resolves.toEqual(detail);
    request("GET", detailPath);
  });
  it("creates bases with only supported fields", async () => {
    fetchMock.mockResolvedValueOnce(success({ id: baseId }));
    await createKnowledgeBase(http, team, {
      name: "Base",
      description: "Description",
      team_id: "wrong",
      trusted: true,
    } as never);
    request("POST", base, { name: "Base", description: "Description" });
  });
  it("ingests raw text and user-supplied provenance without trust, user, upload or metadata fields", async () => {
    fetchMock.mockResolvedValueOnce(success({ id: itemId, chunk_count: 2 }));
    await expect(
      ingestKnowledge(http, team, baseId, {
        title: " Title ",
        content: detail.content,
        ingested_from: " Unverified ",
        trusted: true,
        ingested_by: "invented",
        metadata: {},
        file: "not sent",
      } as never),
    ).resolves.toEqual({ id: itemId, chunk_count: 2 });
    request("POST", items, {
      title: " Title ",
      content: detail.content,
      ingested_from: " Unverified ",
    });
  });
  it("omits nullable optional ingestion fields instead of inventing provenance", async () => {
    fetchMock.mockResolvedValueOnce(success({ id: itemId, chunk_count: 1 }));
    await ingestKnowledge(http, team, baseId, { content: "text" });
    request("POST", items, { content: "text" });
  });
  it.each([true, false])(
    "sends only trusted=%s for the bound item and discards partial response",
    async (trusted) => {
      fetchMock.mockResolvedValueOnce(
        success({ id: "wrong", trust_level: "trusted", trusted_by: "not authoritative" }),
      );
      await expect(setKnowledgeTrust(http, team, baseId, itemId, trusted)).resolves.toBeUndefined();
      request("POST", `${detailPath}/trust`, { trusted });
    },
  );
  it.each([
    [400, "INVALID_CURSOR"],
    [400, "INVALID_INPUT"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [500, "INTERNAL"],
  ] as const)("preserves %s %s and request reference", async (status, code) => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code, message: "private", details: {} },
          request_id: "failure-reference",
        }),
        { status },
      ),
    );
    await expect(listKnowledgeItems(http, team, baseId, "opaque")).rejects.toMatchObject({
      status,
      code,
      requestId: "failure-reference",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    () => createKnowledgeBase(http, team, { name: "Name" }),
    () => ingestKnowledge(http, team, baseId, { content: "Text" }),
    () => setKnowledgeTrust(http, team, baseId, itemId, true),
    () => setKnowledgeTrust(http, team, baseId, itemId, false),
  ])("never retries ambiguous mutation network failures %#", async (call) => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(call()).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not replay a mutation with a truncated response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{"));
    await expect(setKnowledgeTrust(http, team, baseId, itemId, true)).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
