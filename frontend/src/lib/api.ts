/**
 * Typed client for the backend API.
 *
 * Paths here are relative to the API base and must match what Fastify
 * registers in `backend/src/routes` — the dev proxy strips the `/api` prefix.
 */

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

async function post<T>(path: string, body: unknown): Promise<T>
{
    const response = await fetch(BASE_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // the backend sets a refresh cookie on sign-in
        credentials: 'include',
        body: JSON.stringify(body)
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
    return post<{ message: string }>('/account/wallet/nonce', { address });
}

/** Exchange a signed challenge for an access token. */
export function walletSignIn(address: string, signature: string)
{
    return post<{ accessToken: string }>('/account/wallet/sign-in', { address, signature });
}
