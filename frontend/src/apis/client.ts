import { API_BASE_URL } from '../libs/constant';
import { readAccessToken } from '../libs/session';

export class ApiError extends Error {
    readonly status: number;
    readonly result: string;

    constructor(status: number, result: string) {
        super(result);

        this.name = 'ApiError';
        this.status = status;
        this.result = result;
    }
}

export interface Paged {
    limit: number;
    offset: number;
    has_more: boolean;
    total: number;
}

export async function send(
    method: string,
    path: string,
    body?: BodyInit,
    type?: string,
): Promise<Response> {
    const token = readAccessToken();

    const response = await fetch(API_BASE_URL + path, {
        method,
        headers: {
            ...(type !== undefined && { 'Content-Type': type }),
            ...(token !== null && { Authorization: `Bearer ${token}` }),
        },
        credentials: 'include',
        ...(body !== undefined && { body }),
    });

    if (!response.ok) {
        const payload: unknown = await response.json().catch(() => undefined);
        const result =
            typeof payload === 'object' && payload !== null && 'result' in payload
                ? String((payload as { result: unknown }).result)
                : 'REQUEST_FAILED';

        throw new ApiError(response.status, result);
    }

    return response;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response =
        body === undefined
            ? await send(method, path)
            : await send(method, path, JSON.stringify(body), 'application/json');

    return (await response.json().catch(() => undefined)) as T;
}

export function pageQuery(page?: Partial<Paged>): string {
    const params = new URLSearchParams();

    if (page?.limit !== undefined) {
        params.set('limit', String(page.limit));
    }
    if (page?.offset !== undefined) {
        params.set('offset', String(page.offset));
    }

    const query = params.toString();

    return query === '' ? '' : `?${query}`;
}
