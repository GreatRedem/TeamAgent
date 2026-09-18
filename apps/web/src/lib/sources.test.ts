import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Http } from "./http.js";
import {
  createConnection,
  createSource,
  getSource,
  listConnections,
  listSources,
  removeConnection,
  sourcePath,
  updateSource,
} from "./sources.js";
import { NetworkError } from "./api.js";

const fetchMock = vi.fn<typeof fetch>();
const http = new Http(
  () => "test-token",
  async () => null,
);
const team = "team /?#%فارسی";
const sourceId = "source /?#%";
const connectionId = "connection /?#%";
const base = `/teams/${encodeURIComponent(team)}/sources`;
const detail = `${base}/${encodeURIComponent(sourceId)}`;
const source = {
  id: sourceId,
  kind: "email",
  name: "Name",
  status: "active",
  has_webhook: true,
  created_at: "2026-06-01T12:00:00Z",
};
const connection = {
  id: connectionId,
  name: "Endpoint",
  owner_scope: "user",
  status: "disconnected",
  created_at: source.created_at,
};
function success(data: unknown) {
  return new Response(
    JSON.stringify({ success: true, data, error: null, request_id: "request-id" }),
  );
}
function request(method: string, path: string, body?: unknown) {
  expect(fetchMock).toHaveBeenLastCalledWith(path, {
    method,
    headers: {
      accept: "application/json",
      authorization: "Bearer test-token",
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

describe("source API contracts", () => {
  it("encodes each path segment", () => {
    expect(sourcePath(team)).toBe(base);
    expect(sourcePath(team, sourceId)).toBe(detail);
  });
  it.each([
    [() => listSources(http, team), base, { sources: [source] }],
    [() => getSource(http, team, sourceId), detail, source],
    [
      () => listConnections(http, team, sourceId),
      `${detail}/connections`,
      { connections: [connection] },
    ],
  ] as const)("reads the service's exact data shape %#", async (call, path, data) => {
    fetchMock.mockResolvedValueOnce(success(data));
    await expect(call()).resolves.toEqual(data);
    request("GET", path);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("creates with type and name only, never kind/config/secrets", async () => {
    fetchMock.mockResolvedValueOnce(success({ id: sourceId }));
    const input = {
      type: "email",
      name: "Name",
      kind: "not sent",
      config: { retained: true },
      webhook_secret_ref: "not sent",
    };
    await expect(createSource(http, team, input)).resolves.toEqual({ id: sourceId });
    request("POST", base, { type: "email", name: "Name" });
    expect(input.config).toEqual({ retained: true });
  });
  it.each(["active", "disabled"] as const)(
    "patches name and %s without sending config or connections",
    async (status) => {
      fetchMock.mockResolvedValueOnce(success({ ...source, status }));
      const input = { name: "Changed", status, config: null, connections: [] };
      await expect(updateSource(http, team, sourceId, input)).resolves.toEqual({
        ...source,
        status,
      });
      request("PATCH", detail, { name: "Changed", status });
    },
  );
  it("creates one team-owned connection without credentials or replacing existing records", async () => {
    fetchMock.mockResolvedValueOnce(success({ id: connectionId }));
    await expect(createConnection(http, team, sourceId, "Endpoint")).resolves.toEqual({
      id: connectionId,
    });
    request("POST", `${detail}/connections`, { name: "Endpoint", owner_scope: "team" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("removes only the selected scoped connection with no body", async () => {
    fetchMock.mockResolvedValueOnce(success({}));
    await expect(removeConnection(http, team, sourceId, connectionId)).resolves.toEqual({});
    request("DELETE", `${detail}/connections/${encodeURIComponent(connectionId)}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONNECTION_IN_USE"],
    [500, "INTERNAL"],
  ] as const)("preserves %s %s and request ID", async (status, code) => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code, message: "private server text", details: {} },
          request_id: "failure-reference",
        }),
        { status },
      ),
    );
    await expect(removeConnection(http, team, sourceId, connectionId)).rejects.toMatchObject({
      status,
      code,
      requestId: "failure-reference",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    () => createSource(http, team, { type: "email", name: "Name" }),
    () => updateSource(http, team, sourceId, { name: "Name", status: "disabled" }),
    () => createConnection(http, team, sourceId, "Endpoint"),
    () => removeConnection(http, team, sourceId, connectionId),
  ])("does not retry mutation transport failures %#", async (call) => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(call()).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("treats a truncated mutation response as unknown without replay", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{"));
    await expect(createConnection(http, team, sourceId, "Endpoint")).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
