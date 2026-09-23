import { type Paged, pageQuery, request } from './client';

export interface TeamBot {
    id: number;
    name: string;
    token_hint: string;
    public_url: string;
    mode: 'webhook' | 'polling';
    agent_id: number;
    agent_name: string;
    groups: boolean;
    profiles: { id: number; name: string }[];
    created_at: string;
}

export interface TeamBotProbe {
    ok: boolean;
    username?: string;
    reads_groups?: boolean;
    reason?: string;
}

export function teamBotList(teamId: number, page?: Partial<Paged>) {
    return request<{ bots: TeamBot[] } & Paged>('GET', `/team/${teamId}/bot${pageQuery(page)}`);
}

export function teamBotCreate(teamId: number, name: string, token: string, publicUrl: string) {
    return request<TeamBot>('POST', `/team/${teamId}/bot`, { name, token, public_url: publicUrl });
}

export function teamBotUpdate(teamId: number, bot: TeamBot, token?: string) {
    return request<TeamBot>('PATCH', `/team/${teamId}/bot/${bot.id}`, {
        name: bot.name,
        public_url: bot.public_url,
        agent_id: bot.agent_id,
        groups: bot.groups,
        profiles: bot.profiles.map((profile) => profile.id),
        ...(token !== undefined && { token }),
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
