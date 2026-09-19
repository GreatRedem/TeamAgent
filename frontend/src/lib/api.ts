/**
 * Typed client for the backend API.
 *
 * Paths here are relative to the API base and must match what Fastify
 * registers in `backend/src/routes` — the dev proxy strips the `/api` prefix.
 */

import { readAccessToken } from './session';

const BASE_URL = '/api';

/** The backend's failure envelope is `{ result: 'ERROR_CODE' }`. */
export class ApiError extends Error
{
    readonly status: number;
    readonly result: string;

    constructor(status: number, result: string)
    {
        super(result);

        this.name = 'ApiError';
        this.status = status;
        this.result = result;
    }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T>
{
    const token = readAccessToken();

    const response = await fetch(BASE_URL + path, {
        method,
        headers: {
            ...body !== undefined && { 'Content-Type': 'application/json' },
            // Guarded routes read a bearer token; the public sign-in routes
            // ignore it, so sending it when present costs nothing.
            ...token !== null && { Authorization: `Bearer ${ token }` }
        },
        // the backend sets a refresh cookie on sign-in
        credentials: 'include',
        ...body !== undefined && { body: JSON.stringify(body) }
    });

    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok)
    {
        const result = typeof payload === 'object' && payload !== null && 'result' in payload
            ? String((payload as { result: unknown }).result)
            : 'REQUEST_FAILED';

        throw new ApiError(response.status, result);
    }

    return payload as T;
}

/** Ask the server for a sign-in challenge. The server authors the message. */
export function walletNonce(address: string)
{
    return request<{ message: string }>('POST', '/account/wallet/nonce', { address });
}

/** Exchange a signed challenge for an access token. */
export function walletSignIn(address: string, signature: string)
{
    return request<{ accessToken: string }>('POST', '/account/wallet/sign-in', { address, signature });
}

export interface Team
{
    id: number;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
}

/**
 * `description` is sent even when empty: the backend's validator has no
 * optional-field rule, so an absent key reads as a missing one.
 */
export function teamCreate(name: string, description: string)
{
    return request<Team>('POST', '/team', { name, description });
}

/** Teams owned by the signed-in account, newest first. */
export function teamList()
{
    return request<{ teams: Team[] }>('GET', '/team');
}

export function teamDetails(id: number)
{
    return request<Team>('GET', `/team/${ id }`);
}

export function teamUpdate(id: number, name: string, description: string)
{
    return request<Team>('PATCH', `/team/${ id }`, { name, description });
}

/**
 * A team's Telegram bot. The BotFather token is write-only: the backend stores
 * it and returns `token_hint` (public bot id plus the last four characters)
 * instead, so it cannot be read back out of the UI.
 */
export interface TeamBot
{
    id: number;
    name: string;
    token_hint: string;
    /** This bot's own public origin. Blank means it runs in polling mode. */
    public_url: string;
    mode: 'webhook' | 'polling';
    /** 0 when nobody answers for this bot; the name is '' to match. */
    agent_id: number;
    agent_name: string;
    created_at: string;
}

export function teamBotList(teamId: number)
{
    return request<{ bots: TeamBot[] }>('GET', `/team/${ teamId }/bot`);
}

export function teamBotCreate(teamId: number, name: string, token: string, publicUrl: string)
{
    return request<TeamBot>('POST', `/team/${ teamId }/bot`, { name, token, public_url: publicUrl });
}

/** Blank `publicUrl` switches the bot to polling. */
export function teamBotUpdate(teamId: number, botId: number, name: string, publicUrl: string, agentId: number)
{
    return request<TeamBot>('PATCH', `/team/${ teamId }/bot/${ botId }`, { name, public_url: publicUrl, agent_id: agentId });
}

export function teamBotRemove(teamId: number, botId: number)
{
    return request<{ result: string }>('DELETE', `/team/${ teamId }/bot/${ botId }`);
}

/** Outcome of asking Telegram whether a stored token still works. */
export interface TeamBotProbe
{
    ok: boolean;
    username?: string;
    reason?: string;
}

/**
 * A rejected bot still answers 200 — the check ran and the answer was no, so
 * only a genuine request failure throws `ApiError`.
 */
export function teamBotTest(teamId: number, botId: number)
{
    return request<TeamBotProbe>('POST', `/team/${ teamId }/bot/${ botId }/test`);
}

/**
 * A person who has sent the team a private message on Telegram. Built from
 * what Telegram reports, and refreshed on every message — names and usernames
 * change. `telegram_id` is a string because the ids exceed what a JS number
 * holds exactly.
 */
export interface TelegramProfile
{
    id: number;
    telegram_id: string;
    username: string;
    first_name: string;
    last_name: string;
    language_code: string;
    message_count: number;
    /** Granted permission keys. Absent means denied — there is no implicit grant. */
    permissions: string[];
    last_seen_at: string;
    created_at: string;
}

export interface TelegramMessage
{
    id: number;
    bot_id: number;
    text: string;
    /** 'in' is what the person sent, 'out' is what an agent replied. */
    direction: 'in' | 'out';
    sent_at: string;
}

/** Everyone who has written to the team, most recent first. */
export function conversationList(teamId: number)
{
    return request<{ conversations: TelegramProfile[] }>('GET', `/team/${ teamId }/conversation`);
}

export function conversationMessages(teamId: number, profileId: number)
{
    return request<{ profile: TelegramProfile; messages: TelegramMessage[] }>('GET', `/team/${ teamId }/conversation/${ profileId }`);
}

/** Points Telegram at the bot's own public url. Needs that url to be set. */
export function teamBotWebhookRegister(teamId: number, botId: number)
{
    return request<{ ok: boolean; url?: string; reason?: string }>('POST', `/team/${ teamId }/bot/${ botId }/webhook`);
}

/** One bot a person has written to, with how much they wrote to it. */
export interface TelegramProfileBot
{
    id: number;
    name: string;
    message_count: number;
    last_seen_at: string;
}

/** Everything held about one person: their fields, their bots, their history. */
export function profileDetails(teamId: number, profileId: number)
{
    return request<{ profile: TelegramProfile; bots: TelegramProfileBot[]; messages: TelegramMessage[] }>('GET', `/team/${ teamId }/profile/${ profileId }`);
}

/**
 * An OpenAI-compatible model endpoint. The API key is write-only: the backend
 * stores it and returns `key_hint` instead, so it cannot be read back out.
 */
export interface TeamModel
{
    id: number;
    name: string;
    model: string;
    base_url: string;
    key_hint: string;
    created_at: string;
}

export interface TeamModelProbe
{
    ok: boolean;
    models?: number;
    found?: boolean;
    reason?: string;
}

export function modelList(teamId: number)
{
    return request<{ models: TeamModel[] }>('GET', `/team/${ teamId }/model`);
}

export function modelCreate(teamId: number, name: string, model: string, baseUrl: string, apiKey: string)
{
    return request<TeamModel>('POST', `/team/${ teamId }/model`, { name, model, base_url: baseUrl, api_key: apiKey });
}

/** An empty `apiKey` keeps the stored one, so a rename need not re-enter it. */
export function modelUpdate(teamId: number, modelId: number, name: string, model: string, baseUrl: string, apiKey: string)
{
    return request<TeamModel>('PATCH', `/team/${ teamId }/model/${ modelId }`, { name, model, base_url: baseUrl, api_key: apiKey });
}

export function modelRemove(teamId: number, modelId: number)
{
    return request<{ result: string }>('DELETE', `/team/${ teamId }/model/${ modelId }`);
}

/** A rejected model still answers 200 — the check ran and the answer was no. */
export function modelTest(teamId: number, modelId: number)
{
    return request<TeamModelProbe>('POST', `/team/${ teamId }/model/${ modelId }/test`);
}

/** One entry in the permission catalog the backend defines. */
export interface Permission
{
    key: string;
    label: string;
    description: string;
}

/** The catalog is served rather than hard-coded, so adding one is backend-only. */
export function permissionCatalog(teamId: number)
{
    return request<{ permissions: Permission[] }>('GET', `/team/${ teamId }/permission`);
}

/** Replaces the profile's grants with exactly this set. */
export function profilePermissionUpdate(teamId: number, profileId: number, permissions: string[])
{
    return request<TelegramProfile>('PATCH', `/team/${ teamId }/profile/${ profileId }/permission`, { permissions });
}

/** An agent: a named role bound to one of the team's models. */
export interface TeamAgent
{
    id: number;
    name: string;
    description: string;
    /** 0 when no model is attached, e.g. the model it used was removed. */
    model_id: number;
    /** Empty when the model is gone; shown as "no model" rather than an id. */
    model_name: string;
    document_count: number;
    created_at: string;
}

/** One markdown document defining part of an agent's behaviour. */
export interface AgentDocument
{
    id: number;
    name: string;
    content: string;
    updated_at: string;
}

export function agentList(teamId: number)
{
    return request<{ agents: TeamAgent[] }>('GET', `/team/${ teamId }/agent`);
}

export function agentCreate(teamId: number, name: string, description: string, modelId: number)
{
    return request<TeamAgent>('POST', `/team/${ teamId }/agent`, { name, description, model_id: modelId });
}

export function agentDetails(teamId: number, agentId: number)
{
    return request<{ agent: TeamAgent; documents: AgentDocument[] }>('GET', `/team/${ teamId }/agent/${ agentId }`);
}

export function agentUpdate(teamId: number, agentId: number, name: string, description: string, modelId: number)
{
    return request<TeamAgent>('PATCH', `/team/${ teamId }/agent/${ agentId }`, { name, description, model_id: modelId });
}

export function agentRemove(teamId: number, agentId: number)
{
    return request<{ result: string }>('DELETE', `/team/${ teamId }/agent/${ agentId }`);
}

export function agentDocumentCreate(teamId: number, agentId: number, name: string, content: string)
{
    return request<AgentDocument>('POST', `/team/${ teamId }/agent/${ agentId }/document`, { name, content });
}

export function agentDocumentUpdate(teamId: number, agentId: number, documentId: number, name: string, content: string)
{
    return request<AgentDocument>('PATCH', `/team/${ teamId }/agent/${ agentId }/document/${ documentId }`, { name, content });
}

export function agentDocumentRemove(teamId: number, agentId: number, documentId: number)
{
    return request<{ result: string }>('DELETE', `/team/${ teamId }/agent/${ agentId }/document/${ documentId }`);
}

/** One recorded action in a team's audit trail. */
export interface AuditEntry
{
    id: number;
    action: string;
    target: string;
    outcome: 'ok' | 'error' | 'skipped';
    detail: string;
    created_at: string;
}

/** One day in the activity heatmap. Every day in range is present, even empty ones. */
export interface HeatmapDay
{
    date: string;
    total: number;
    errors: number;
}

export function auditList(teamId: number)
{
    return request<{ entries: AuditEntry[] }>('GET', `/team/${ teamId }/audit`);
}

export function auditHeatmap(teamId: number)
{
    return request<{ days: HeatmapDay[]; from: string; to: string; total: number; busiest: number }>('GET', `/team/${ teamId }/audit/heatmap`);
}
