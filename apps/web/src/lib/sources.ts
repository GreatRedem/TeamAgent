import type { Http } from "./http.js";

export interface Source {
  id: string;
  kind: string;
  name: string;
  status: string;
  has_webhook: boolean;
  created_at: string;
}

export interface SourceConnection {
  id: string;
  name: string;
  owner_scope: string;
  status: string;
  created_at: string;
}

export interface CreateSourceInput {
  type: string;
  name: string;
}

export interface UpdateSourceInput {
  name: string;
  status: "active" | "disabled";
}

export function sourcePath(teamId: string, sourceId?: string): string {
  return `/teams/${encodeURIComponent(teamId)}/sources${sourceId === undefined ? "" : `/${encodeURIComponent(sourceId)}`}`;
}

export function listSources(http: Http, teamId: string): Promise<{ sources: Source[] }> {
  return http.request("GET", sourcePath(teamId));
}

export function getSource(http: Http, teamId: string, sourceId: string): Promise<Source> {
  return http.request("GET", sourcePath(teamId, sourceId));
}

export function createSource(
  http: Http,
  teamId: string,
  input: CreateSourceInput,
): Promise<{ id: string }> {
  return http.request("POST", sourcePath(teamId), { body: { type: input.type, name: input.name } });
}

export function updateSource(
  http: Http,
  teamId: string,
  sourceId: string,
  input: UpdateSourceInput,
): Promise<Source> {
  return http.request("PATCH", sourcePath(teamId, sourceId), {
    body: { name: input.name, status: input.status },
  });
}

export function listConnections(
  http: Http,
  teamId: string,
  sourceId: string,
): Promise<{ connections: SourceConnection[] }> {
  return http.request("GET", `${sourcePath(teamId, sourceId)}/connections`);
}

export function createConnection(
  http: Http,
  teamId: string,
  sourceId: string,
  name: string,
): Promise<{ id: string }> {
  return http.request("POST", `${sourcePath(teamId, sourceId)}/connections`, {
    body: { name, owner_scope: "team" },
  });
}

export function removeConnection(
  http: Http,
  teamId: string,
  sourceId: string,
  connectionId: string,
): Promise<Record<string, never>> {
  return http.request(
    "DELETE",
    `${sourcePath(teamId, sourceId)}/connections/${encodeURIComponent(connectionId)}`,
  );
}
