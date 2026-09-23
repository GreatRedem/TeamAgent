import { createHmac } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { APP_NAME, PLUGIN_READ_MAX } from '../../constant.js';

import { type CallOutcome, callJson, failed } from '../../utils/http.js';
import { checkPublicUrl } from '../mcp/mcp.web.js';

export { callJson, failed };
export type PluginOutcome = CallOutcome;

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

function readMap(stored: string): Record<string, string> {
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

export function readLimit(
    args: Record<string, unknown>,
    fallback: number,
    low = 1,
    high = PLUGIN_READ_MAX,
): number {
    const limit = Number(args['limit']);

    return Number.isInteger(limit) && limit > 0 ? Math.min(Math.max(limit, low), high) : fallback;
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return wait(ms, undefined, { signal }).catch(() => undefined);
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
