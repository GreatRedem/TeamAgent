import { type Paged, pageQuery, request } from './client';

export type PluginKindKey = 'telegram' | 'discord' | 'instagram' | 'browser' | 'webhook';

export interface PluginField {
    key: string;
    label: string;
    secret: boolean;
    required: boolean;
    hint: string;
    placeholder: string;
}

export interface PluginKind {
    key: PluginKindKey;
    label: string;
    description: string;
    inbound: 'listen' | 'webhook' | 'none';
    inbound_hint: string;
    fields: PluginField[];
    tools: { name: string; description: string }[];
}

export interface PluginStats {
    requests: number;
    failures: number;
    inbound: number;
    replies: number;
    day: number;
    week: number;
    average_ms: number;
    last_at: string | null;
}

export interface TeamPlugin {
    id: number;
    kind: PluginKindKey;
    name: string;
    enabled: boolean;
    config: Record<string, string>;
    secrets: Record<string, string>;
    agents: number[];
    hook_agent_id: number;
    hook_url: string;
    hook_events: string[];
    hook_secret: string;
    hook_path: string;
    account: string;
    listening: boolean;
    listen_error: string;
    stats: PluginStats;
    created_at: string;
}

export interface PluginDraft {
    kind?: PluginKindKey;
    name: string;
    enabled: boolean;
    fields: Record<string, string>;
    clear: string[];
    agents: number[];
    hook_agent_id: number;
    hook_url: string;
    hook_events: string[];
}

export type PluginDirection = 'tool' | 'in' | 'reply' | 'out' | 'test';

export interface PluginCall {
    id: number;
    direction: PluginDirection;
    action: string;
    ok: boolean;
    status: number;
    duration_ms: number;
    agent_id: number;
    agent_name: string;
    thread: string;
    request: string;
    response: string;
    error: string;
    created_at: string;
}

export interface PluginActionStats {
    direction: PluginDirection;
    action: string;
    count: number;
    failures: number;
    average_ms: number;
    last_at: string;
}

export function pluginCatalog(teamId: number) {
    return request<{ kinds: PluginKind[]; events: string[] }>(
        'GET',
        `/team/${teamId}/plugin/catalog`,
    );
}

export function pluginList(teamId: number) {
    return request<{ plugins: TeamPlugin[] }>('GET', `/team/${teamId}/plugin`);
}

export function pluginCreate(teamId: number, draft: PluginDraft) {
    return request<TeamPlugin>('POST', `/team/${teamId}/plugin`, draft);
}

export function pluginUpdate(teamId: number, pluginId: number, draft: PluginDraft) {
    return request<TeamPlugin>('PATCH', `/team/${teamId}/plugin/${pluginId}`, draft);
}

export function pluginRemove(teamId: number, pluginId: number) {
    return request<{ result: string }>('DELETE', `/team/${teamId}/plugin/${pluginId}`);
}

export function pluginTest(teamId: number, pluginId: number) {
    return request<{ ok: boolean; account: string; error: string; plugin: TeamPlugin }>(
        'POST',
        `/team/${teamId}/plugin/${pluginId}/test`,
    );
}

export function pluginCalls(teamId: number, pluginId: number, page?: Partial<Paged>) {
    return request<{ calls: PluginCall[]; actions: PluginActionStats[] } & Paged>(
        'GET',
        `/team/${teamId}/plugin/${pluginId}/call${pageQuery(page)}`,
    );
}
