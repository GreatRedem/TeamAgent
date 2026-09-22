import { ACCESS_TOKEN_KEY } from '@/lib/constant';

export function readAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function writeAccessToken(token: string): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
