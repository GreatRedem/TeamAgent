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
