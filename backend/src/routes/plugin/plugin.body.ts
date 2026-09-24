import {
    BOT_TOKEN_PATTERN,
    PLUGIN_EVENTS,
    PLUGIN_FIELD_MAX,
    PLUGIN_NAME_MAX,
    PLUGIN_URL_MAX,
    RELAY_SOURCE_PATTERN,
    RELAY_TARGET_PATTERN,
} from '../../constant.js';

import type { PluginKind, PluginSettings } from './plugin.common.js';

export class PluginError extends Error {
    readonly code: string;

    constructor(code: string) {
        super(code);

        this.code = code;
    }
}

export interface PluginBody {
    name: string;
    enabled: boolean;
    secrets: Record<string, string>;
    config: Record<string, string>;
    agents: number[];
    hook_agent_id: number;
    hook_url: string;
    hook_events: string[];
}

function isWebUrl(value: string): boolean {
    try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function ids(value: unknown): number[] {
    return Array.isArray(value)
        ? [...new Set(value.map(Number))].filter((id) => Number.isInteger(id) && id > 0)
        : [];
}

export function readPluginBody(
    body: unknown,
    kind: PluginKind,
    stored: PluginSettings | null,
): PluginBody {
    const source = (typeof body === 'object' && body !== null ? body : {}) as Record<
        string,
        unknown
    >;
    const fields = (
        typeof source['fields'] === 'object' && source['fields'] !== null ? source['fields'] : {}
    ) as Record<string, unknown>;
    const cleared = Array.isArray(source['clear']) ? source['clear'] : [];

    const name = typeof source['name'] === 'string' ? source['name'].trim() : '';

    if (name === '' || name.length > PLUGIN_NAME_MAX) {
        throw new PluginError('PLUGIN_NAME_REQUIRED');
    }

    const secrets: Record<string, string> = {};
    const config: Record<string, string> = {};

    for (const field of kind.fields) {
        const given =
            typeof fields[field.key] === 'string'
                ? (fields[field.key] as string).trim().slice(0, PLUGIN_FIELD_MAX)
                : undefined;
        const kept = (field.secret ? stored?.secrets : stored?.config)?.[field.key] ?? '';
        const value = field.secret
            ? cleared.includes(field.key)
                ? ''
                : given || kept
            : (given ?? kept);

        if (field.required && value === '') {
            throw new PluginError('PLUGIN_FIELD_REQUIRED');
        }

        if (value !== '') {
            (field.secret ? secrets : config)[field.key] = value;
        }
    }

    if (
        (kind.key === 'telegram' || kind.key === 'relay') &&
        !BOT_TOKEN_PATTERN.test(secrets['token'] ?? '')
    ) {
        throw new PluginError('PLUGIN_TOKEN_INVALID');
    }

    if (kind.key === 'relay' && !RELAY_SOURCE_PATTERN.test(config['source'] ?? '')) {
        throw new PluginError('PLUGIN_SOURCE_INVALID');
    }

    if (
        kind.key === 'relay' &&
        (!RELAY_TARGET_PATTERN.test(config['target'] ?? '') ||
            config['target']?.toLowerCase() === config['source']?.toLowerCase())
    ) {
        throw new PluginError('PLUGIN_TARGET_INVALID');
    }

    if (kind.key === 'discord' && !/^$|^\d{5,25}$/.test(config['default_channel'] ?? '')) {
        throw new PluginError('PLUGIN_CHANNEL_INVALID');
    }

    if (kind.key === 'webhook' && !isWebUrl(config['url'] ?? '')) {
        throw new PluginError('PLUGIN_URL_INVALID');
    }

    const hookUrl = typeof source['hook_url'] === 'string' ? source['hook_url'].trim() : '';

    if (hookUrl !== '' && (hookUrl.length > PLUGIN_URL_MAX || !isWebUrl(hookUrl))) {
        throw new PluginError('PLUGIN_HOOK_URL_INVALID');
    }

    const hookAgent = Number(source['hook_agent_id'] ?? 0);

    return {
        name,
        enabled: source['enabled'] !== false,
        secrets,
        config,
        agents: ids(source['agents']),
        hook_agent_id: Number.isInteger(hookAgent) && hookAgent > 0 ? hookAgent : 0,
        hook_url: hookUrl,
        hook_events: Array.isArray(source['hook_events'])
            ? PLUGIN_EVENTS.filter((event) => (source['hook_events'] as unknown[]).includes(event))
            : [...PLUGIN_EVENTS],
    };
}
