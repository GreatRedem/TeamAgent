import { type Paged, pageQuery, request } from './client';

export interface TeamBot {
    id: number;
    name: string;
    token_hint: string;
    public_url: string;
    mode: 'webhook' | 'polling';
    agent_id: number;
    agent_name: string;
    created_at: string;
}

export interface TeamBotProbe {
    ok: boolean;
    username?: string;
    reason?: string;
}

export function teamBotList(teamId: number, page?: Partial<Paged>) {
    return request<{ bots: TeamBot[] } & Paged>('GET', `/team/${teamId}/bot${pageQuery(page)}`);
}

export function teamBotCreate(teamId: number, name: string, token: string, publicUrl: string) {
    return request<TeamBot>('POST', `/team/${teamId}/bot`, { name, token, public_url: publicUrl });
}

export function teamBotUpdate(
    teamId: number,
    botId: number,
    name: string,
    publicUrl: string,
    agentId: number,
) {
    return request<TeamBot>('PATCH', `/team/${teamId}/bot/${botId}`, {
        name,
        public_url: publicUrl,
        agent_id: agentId,
    });
}

export function teamBotRemove(teamId: number, botId: number) {
    return request<{ result: string }>('DELETE', `/team/${teamId}/bot/${botId}`);
}

export function teamBotTest(teamId: number, botId: number) {
    return request<TeamBotProbe>('POST', `/team/${teamId}/bot/${botId}/test`);
}

export function teamBotWebhookRegister(teamId: number, botId: number) {
    return request<{ ok: boolean; url?: string; reason?: string }>(
        'POST',
        `/team/${teamId}/bot/${botId}/webhook`,
    );
}
