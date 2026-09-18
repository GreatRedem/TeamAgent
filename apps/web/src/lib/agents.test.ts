import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "./api.js";
import { Http } from "./http.js";
import {
  agentPath,
  createAgent,
  deleteAgent,
  getAgent,
  getAgentCatalogs,
  getGrants,
  listAgents,
  listGrantResources,
  listSourceConnections,
  replaceIds,
  replaceSources,
  teamPath,
  updateAgent,
  type AgentInput,
  type Source,
} from "./agents.js";

const teamId = "team /?#%فارسی";
const agentId = "agent /?#%";
const teamUrl = "/teams/team%20%2F%3F%23%25%D9%81%D8%A7%D8%B1%D8%B3%DB%8C";
const agentUrl = `${teamUrl}/agents/agent%20%2F%3F%23%25`;
const fetchMock = vi.fn<typeof fetch>();
const refresh = vi.fn<() => Promise<string | null>>();
const http = new Http(() => "test-token", refresh);

function success(data: unknown): Response {
  return new Response(
    JSON.stringify({ success: true, data, error: null, request_id: "request-1" }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

function source(id: string): Source {
  return { id, name: id, kind: "webhook", status: "active", has_webhook: true };
}

function expectRequest(method: string, url: string, body?: unknown) {
  expect(fetchMock).toHaveBeenLastCalledWith(url, {
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
  refresh.mockReset().mockResolvedValue(null);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("typed agent requests", () => {
  it("encodes team and agent IDs as individual path segments", () => {
    expect(teamPath(teamId)).toBe(teamUrl);
    expect(agentPath(teamId)).toBe(`${teamUrl}/agents`);
    expect(agentPath(teamId, agentId)).toBe(agentUrl);
  });

  it.each([
    ["list", () => listAgents(http, teamId), `${teamUrl}/agents`, { agents: [] }],
    ["get", () => getAgent(http, teamId, agentId), agentUrl, { id: agentId }],
    [
      "catalogs",
      () => getAgentCatalogs(http, teamId),
      `${teamUrl}/agents/catalogs`,
      { models: [], permissions: [] },
    ],
    [
      "grants",
      () => getGrants(http, teamId, agentId),
      `${agentUrl}/grants`,
      { agent_id: agentId, sources: [] },
    ],
  ] as const)("scopes %s to the team and returns envelope data", async (_name, call, url, data) => {
    fetchMock.mockResolvedValueOnce(success(data));
    await expect(call()).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectRequest("GET", url);
  });

  it("omits null optional fields when creating without changing the input", async () => {
    const input: AgentInput = {
      name: "Agent",
      model_id: null,
      system_prompt: null,
      budgets: { max_tokens: 123, future_limit: 4 },
    };
    fetchMock.mockResolvedValueOnce(success({ id: agentId }));
    await expect(createAgent(http, teamId, input)).resolves.toEqual({ id: agentId });
    expectRequest("POST", `${teamUrl}/agents`, { name: "Agent", budgets: input.budgets });
    expect(input.model_id).toBeNull();
    expect(input.system_prompt).toBeNull();
  });

  it("sends explicit model and prompt values on creation", async () => {
    const input: AgentInput = {
      name: "Agent",
      model_id: "model-1",
      system_prompt: "",
      budgets: null,
    };
    fetchMock.mockResolvedValueOnce(success({ id: agentId }));
    await createAgent(http, teamId, input);
    expectRequest("POST", `${teamUrl}/agents`, {
      name: "Agent",
      budgets: null,
      model_id: "model-1",
      system_prompt: "",
    });
  });

  it("preserves explicit null clearing and omits untouched settings in PATCH", async () => {
    const input = {
      model_id: null,
      system_prompt: null,
      budgets: { future_limit: 4 },
      status: "disabled" as const,
    };
    fetchMock.mockResolvedValueOnce(success({ id: agentId, ...input }));
    await expect(updateAgent(http, teamId, agentId, input)).resolves.toEqual({
      id: agentId,
      ...input,
    });
    expectRequest("PATCH", agentUrl, input);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).not.toHaveProperty("settings");
  });

  it("deletes only the scoped agent without a body", async () => {
    fetchMock.mockResolvedValueOnce(success(null));
    await expect(deleteAgent(http, teamId, agentId)).resolves.toBeNull();
    expectRequest("DELETE", agentUrl);
  });

  it.each([
    ["permissions", "permission_ids"],
    ["tools", "tool_ids"],
    ["knowledge-bases", "knowledge_base_ids"],
  ] as const)(
    "replaces %s using its typed body key and retains unavailable IDs",
    async (kind, field) => {
      for (const ids of [["known", "unavailable"], []]) {
        const data = { agent_id: agentId, [field]: ids };
        fetchMock.mockResolvedValueOnce(success(data));
        await expect(replaceIds(http, teamId, agentId, kind, ids)).resolves.toEqual(data);
        expectRequest("PUT", `${agentUrl}/${kind}`, { [field]: ids });
      }
    },
  );

  it("replaces source grants exactly, including an empty replacement", async () => {
    const sources = [
      {
        source_connection_id: "unavailable-connection",
        can_reply: false,
        can_initiate: true,
        allowed_destinations: ["channel:1"],
      },
    ];
    for (const value of [sources, []]) {
      fetchMock.mockResolvedValueOnce(success({ agent_id: agentId, sources: value }));
      await expect(replaceSources(http, teamId, agentId, value)).resolves.toEqual({
        agent_id: agentId,
        sources: value,
      });
      expectRequest("PUT", `${agentUrl}/sources`, { sources: value });
    }
  });

  it.each([
    ["permissions", "/agents/catalogs", "permissions"],
    ["tools", "/tools", "tools"],
    ["knowledge-bases", "/knowledge", "knowledge_bases"],
  ] as const)("loads the scoped %s resource catalog", async (kind, suffix, field) => {
    const resources = [{ id: "resource-1", name: "Resource" }];
    fetchMock.mockResolvedValueOnce(success({ [field]: resources }));
    await expect(listGrantResources(http, teamId, kind)).resolves.toEqual(resources);
    expectRequest("GET", `${teamUrl}${suffix}`);
  });
});

describe("source connection discovery", () => {
  it("flattens connections in source order and attaches source metadata", async () => {
    const sources = [source("source /?#%"), source("second")];
    const first = { id: "connection-1", name: "First", owner_scope: "team", status: "active" };
    const second = { ...first, id: "connection-2" };
    fetchMock
      .mockResolvedValueOnce(success({ sources }))
      .mockResolvedValueOnce(success({ connections: [first, second] }))
      .mockResolvedValueOnce(success({ connections: [] }));
    await expect(listSourceConnections(http, teamId)).resolves.toEqual([
      { ...first, source: sources[0] },
      { ...second, source: sources[0] },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${teamUrl}/sources`,
      `${teamUrl}/sources/source%20%2F%3F%23%25/connections`,
      `${teamUrl}/sources/second/connections`,
    ]);
    expect(
      fetchMock.mock.calls.every(
        ([, options]) => options?.method === "GET" && options.body === undefined,
      ),
    ).toBe(true);
  });

  it("returns no connections and makes no child requests for an empty source catalog", async () => {
    fetchMock.mockResolvedValueOnce(success({ sources: [] }));
    await expect(listSourceConnections(http, teamId)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates source catalog API errors without issuing child requests", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code: "FORBIDDEN", message: "Denied", details: {} },
          request_id: "denied-request",
        }),
        { status: 403 },
      ),
    );
    const result = listSourceConnections(http, teamId);
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      requestId: "denied-request",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a partial connection listing rather than hiding a failed source", async () => {
    fetchMock
      .mockResolvedValueOnce(success({ sources: [source("ok"), source("failed")] }))
      .mockResolvedValueOnce(success({ connections: [{ id: "connection-1" }] }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            error: { code: "NOT_FOUND", message: "Gone", details: {} },
            request_id: "missing-request",
          }),
          { status: 404 },
        ),
      );
    await expect(listSourceConnections(http, teamId)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      requestId: "missing-request",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["catalog", "connections"])("propagates %s network failures", async (stage) => {
    const cause = new TypeError("offline");
    if (stage === "connections")
      fetchMock.mockResolvedValueOnce(success({ sources: [source("source-1")] }));
    fetchMock.mockRejectedValueOnce(cause);
    const result = listSourceConnections(http, teamId);
    await expect(result).rejects.toBeInstanceOf(NetworkError);
    await expect(result).rejects.toMatchObject({ cause });
    expect(fetchMock).toHaveBeenCalledTimes(stage === "catalog" ? 1 : 2);
  });
});
