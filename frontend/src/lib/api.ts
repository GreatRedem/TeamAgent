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
export function teamBotUpdate(teamId: number, botId: number, name: string, publicUrl: string)
{
    return request<TeamBot>('PATCH', `/team/${ teamId }/bot/${ botId }`, { name, public_url: publicUrl });
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
    last_seen_at: string;
    created_at: string;
}

export interface TelegramMessage
{
    id: number;
    bot_id: number;
    text: string;
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
