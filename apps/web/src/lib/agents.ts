import type { Http } from "./http.js";

export interface Agent {
  id: string;
  name: string;
  model_id: string | null;
  system_prompt: string | null;
  settings: Record<string, unknown> | null;
  budgets: Record<string, unknown> | null;
  status: "active" | "disabled" | "archived";
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  name: string;
  description?: string | null;
  risk_tier?: string;
}

export interface AgentCatalogs {
  models: (Resource & { provider: string; status: string })[];
  permissions: (Resource & { description: string | null; risk_tier: string })[];
}

export interface SourceGrant {
  source_connection_id: string;
  can_reply: boolean;
  can_initiate: boolean;
  allowed_destinations: string[];
}

export interface Grants {
  agent_id: string;
  permission_ids: string[];
  tool_ids: string[];
  knowledge_base_ids: string[];
  sources: SourceGrant[];
}

export interface Source extends Resource {
  kind: string;
  status: string;
  has_webhook: boolean;
}

export interface Connection extends Resource {
  owner_scope: string;
  status: string;
  source: Source;
}

export type AgentInput = Pick<Agent, "name" | "system_prompt" | "budgets"> & {
  model_id?: string | null;
};
export type IdGrantKind = "permissions" | "tools" | "knowledge-bases";

export function teamPath(teamId: string): string {
  return `/teams/${encodeURIComponent(teamId)}`;
}

export function agentPath(teamId: string, agentId?: string): string {
  return `${teamPath(teamId)}/agents${agentId === undefined ? "" : `/${encodeURIComponent(agentId)}`}`;
}

export function listAgents(http: Http, teamId: string): Promise<{ agents: Agent[] }> {
  return http.request("GET", agentPath(teamId));
}

export function getAgent(http: Http, teamId: string, agentId: string): Promise<Agent> {
  return http.request("GET", agentPath(teamId, agentId));
}

export function getAgentCatalogs(http: Http, teamId: string): Promise<AgentCatalogs> {
  return http.request("GET", `${agentPath(teamId)}/catalogs`);
}

export function createAgent(
  http: Http,
  teamId: string,
  input: AgentInput,
): Promise<{ id: string }> {
  const { model_id, system_prompt, ...rest } = input;
  return http.request("POST", agentPath(teamId), {
    body: { ...rest, model_id: model_id ?? undefined, system_prompt: system_prompt ?? undefined },
  });
}

export function updateAgent(
  http: Http,
  teamId: string,
  agentId: string,
  input: Partial<AgentInput> & { status?: Agent["status"] },
): Promise<Agent> {
  return http.request("PATCH", agentPath(teamId, agentId), { body: input });
}

export function deleteAgent(http: Http, teamId: string, agentId: string): Promise<unknown> {
  return http.request("DELETE", agentPath(teamId, agentId));
}

export function getGrants(http: Http, teamId: string, agentId: string): Promise<Grants> {
  return http.request("GET", `${agentPath(teamId, agentId)}/grants`);
}

export function replaceIds(
  http: Http,
  teamId: string,
  agentId: string,
  kind: IdGrantKind,
  ids: string[],
): Promise<Grants> {
  const field = {
    permissions: "permission_ids",
    tools: "tool_ids",
    "knowledge-bases": "knowledge_base_ids",
  }[kind];
  return http.request("PUT", `${agentPath(teamId, agentId)}/${kind}`, { body: { [field]: ids } });
}

export function replaceSources(
  http: Http,
  teamId: string,
  agentId: string,
  sources: SourceGrant[],
): Promise<Grants> {
  return http.request("PUT", `${agentPath(teamId, agentId)}/sources`, { body: { sources } });
}

export async function listGrantResources(
  http: Http,
  teamId: string,
  kind: IdGrantKind,
): Promise<Resource[]> {
  if (kind === "permissions") return (await getAgentCatalogs(http, teamId)).permissions;
  if (kind === "tools")
    return (await http.request<{ tools: Resource[] }>("GET", `${teamPath(teamId)}/tools`)).tools;
  return (
    await http.request<{ knowledge_bases: Resource[] }>("GET", `${teamPath(teamId)}/knowledge`)
  ).knowledge_bases;
}

export async function listSourceConnections(http: Http, teamId: string): Promise<Connection[]> {
  const { sources } = await http.request<{ sources: Source[] }>(
    "GET",
    `${teamPath(teamId)}/sources`,
  );
  const groups = await Promise.all(
    sources.map(async (source) => {
      const { connections } = await http.request<{ connections: Omit<Connection, "source">[] }>(
        "GET",
        `${teamPath(teamId)}/sources/${encodeURIComponent(source.id)}/connections`,
      );
      return connections.map((connection) => ({ ...connection, source }));
    }),
  );
  return groups.flat();
}
