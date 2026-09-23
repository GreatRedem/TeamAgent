import { PLUGIN_TIMEOUT } from '../constant.js';

export interface CallOutcome {
    ok: boolean;
    status: number;
    data?: unknown;
    error?: string;
}

export function failed(error: string, status = 0): CallOutcome {
    return { ok: false, status, error };
}

export async function callJson(
    url: string,
    init: RequestInit,
    errorOf: (body: unknown) => string,
    timeout = PLUGIN_TIMEOUT,
): Promise<CallOutcome> {
    const limit = AbortSignal.timeout(timeout);

    try {
        const response = await fetch(url, {
            ...init,
            signal: init.signal ? AbortSignal.any([init.signal, limit]) : limit,
        });
        const raw = await response.text();

        let body: unknown = raw;

        try {
            body = raw === '' ? undefined : JSON.parse(raw);
        } catch {
            body = raw.slice(0, 200);
        }

        return response.ok
            ? { ok: true, status: response.status, data: body }
            : {
                  ok: false,
                  status: response.status,
                  data: body,
                  error: errorOf(body) || `http ${response.status}`,
              };
    } catch {
        return failed(limit.aborted ? 'timed out' : 'could not be reached');
    }
}
