import { type Paged, pageQuery, request } from './client';

export interface ExchangeUsage {
    replies: number;
    round_trips: number;
    failures: number;
    prompt_tokens: number;
    completion_tokens: number;
    tool_calls: number;
    average_ms: number;
    last_used_at: string | null;
}

export interface TeamAgent {
    id: number;
    name: string;
    description: string;
    model_id: number;
    model_name: string;
    document_count: number;
    permissions: string[];
    created_at: string;
    usage?: ExchangeUsage;
}

export interface AgentDocument {
    id: number;
    name: string;
    content: string;
    updated_at: string;
}

export interface AgentExchange {
    id: number;
    agent_id: number;
    agent_name: string;
    user_id: number;
    round: number;
    request: string;
    response: string;
    tool_calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    tokens_estimated: boolean;
    duration_ms: number;
    outcome: string;
    reason: string;
    created_at: string;
}

export interface McpTool {
    name: string;
    description: string;
    permission: string;
}

export function agentList(teamId: number, page?: Partial<Paged>) {
    return request<{ agents: TeamAgent[] } & Paged>(
        'GET',
        `/team/${teamId}/agent${pageQuery(page)}`,
    );
}

export function agentCreate(
    teamId: number,
    name: string,
    description: string,
    modelId: number,
    instructions: string,
) {
    return request<TeamAgent>('POST', `/team/${teamId}/agent`, {
        name,
        description,
        model_id: modelId,
        instructions,
    });
}

export function agentDetails(teamId: number, agentId: number) {
    return request<{ agent: TeamAgent; documents: AgentDocument[]; usage: ExchangeUsage }>(
        'GET',
        `/team/${teamId}/agent/${agentId}`,
    );
}

export function agentUpdate(
    teamId: number,
    agentId: number,
    name: string,
    description: string,
    modelId: number,
) {
    return request<TeamAgent>('PATCH', `/team/${teamId}/agent/${agentId}`, {
        name,
        description,
        model_id: modelId,
    });
}

export function agentRemove(teamId: number, agentId: number) {
    return request<{ result: string }>('DELETE', `/team/${teamId}/agent/${agentId}`);
}

export function agentDocumentCreate(
    teamId: number,
    agentId: number,
    name: string,
    content: string,
) {
    return request<AgentDocument>('POST', `/team/${teamId}/agent/${agentId}/document`, {
        name,
        content,
    });
}

export function agentDocumentUpdate(
    teamId: number,
    agentId: number,
    documentId: number,
    name: string,
    content: string,
) {
    return request<AgentDocument>(
        'PATCH',
        `/team/${teamId}/agent/${agentId}/document/${documentId}`,
        { name, content },
    );
}

export function agentDocumentRemove(teamId: number, agentId: number, documentId: number) {
    return request<{ result: string }>(
        'DELETE',
        `/team/${teamId}/agent/${agentId}/document/${documentId}`,
    );
}

export function agentExchanges(teamId: number, agentId: number, page?: Partial<Paged>) {
    return request<{ exchanges: AgentExchange[] } & Paged>(
        'GET',
        `/team/${teamId}/agent/${agentId}/exchange${pageQuery(page)}`,
    );
}

export function mcpTools(teamId: number) {
    return request<{ tools: McpTool[] }>('GET', `/team/${teamId}/mcp/tools`);
}
