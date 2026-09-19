/**
 * Where the access token lives.
 *
 * sessionStorage is per-tab and cleared when the tab closes, unlike
 * localStorage which persists. Neither is safe against XSS -- keeping this
 * behind one module means there is a single place to change when the token
 * moves into an in-memory auth context.
 */

const ACCESS_TOKEN_KEY = 'accessToken';

export function readAccessToken(): string | null
{
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function writeAccessToken(token: string): void
{
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void
{
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
