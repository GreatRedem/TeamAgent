import { createHmac } from 'node:crypto';
import { APP_NAME, PLUGIN_TIMEOUT } from '../../constant.js';

import { checkPublicUrl } from '../mcp/mcp.web.js';

export interface PluginField {
    key: string;
    label: string;
    secret: boolean;
    required: boolean;
    hint: string;
    placeholder: string;
    format?: 'url' | 'numeric';
}

export interface PluginKind {
    key: string;
    label: string;
    description: string;
    inbound: 'listen' | 'webhook' | 'none';
    inbound_hint: string;
    fields: PluginField[];
}

export interface PluginOutcome {
    ok: boolean;
    status: number;
    data?: unknown;
    error?: string;
}

export interface InboundEvent {
    kind: 'direct' | 'mention' | 'comment' | 'message';
    thread: string;
    author: string;
    author_id: string;
    text: string;
    where: string;
    ids: Record<string, string>;
}

export interface PluginSettings {
    secrets: Record<string, string>;
    config: Record<string, string>;
}

export function readMap(stored: string): Record<string, string> {
    try {
        const parsed: unknown = JSON.parse(stored);

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
        );
    } catch {
        return {};
    }
}

export function settingsOf(plugin: { secrets: string; config: string }): PluginSettings {
    return { secrets: readMap(plugin.secrets), config: readMap(plugin.config) };
}

export function argText(args: Record<string, unknown>, key: string): string {
    const value = args[key];

    if (typeof value === 'number') {
        return String(value);
    }

    return typeof value === 'string' ? value.trim() : '';
}

export function failed(error: string, status = 0): PluginOutcome {
    return { ok: false, status, error };
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);

        signal.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);

                resolve();
            },
            { once: true },
        );
    });
}

export async function callJson(
    url: string,
    init: RequestInit,
    errorOf: (body: unknown) => string,
    timeout = PLUGIN_TIMEOUT,
): Promise<PluginOutcome> {
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

export function signature(secret: string, body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export async function postSigned(
    url: string,
    payload: Record<string, unknown>,
    secret: string,
    authorization = '',
): Promise<PluginOutcome> {
    const check = await checkPublicUrl(url);

    if (!check.ok || !check.url) {
        return failed(check.reason ?? 'refused');
    }

    const body = JSON.stringify(payload);

    return callJson(
        check.url.toString(),
        {
            method: 'POST',
            redirect: 'manual',
            headers: {
                'content-type': 'application/json',
                'user-agent': APP_NAME,
                'x-nura-event': String(payload['event'] ?? ''),
                'x-nura-signature': signature(secret, body),
                ...(authorization !== '' && { authorization }),
            },
            body,
        },
        () => '',
    );
}
