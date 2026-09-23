import { AGENT_KNOWN, AGENT_PERMISSIONS, SPLIT } from '../../constant.js';
export interface AgentPermission {
    key: string;
    label: string;
    description: string;
}

function expand(keys: string[]) {
    return keys.flatMap((key) => SPLIT[key] ?? [key]);
}

export function parseAgentPermissions(stored: string): string[] {
    return [...new Set(expand(stored.split(',').map((key) => key.trim())))].filter((key) =>
        AGENT_KNOWN.has(key),
    );
}

export function serializeAgentPermissions(keys: string[]): string {
    const held = expand(keys);

    return AGENT_PERMISSIONS.filter((permission) => held.includes(permission.key))
        .map((permission) => permission.key)
        .join(',');
}

export function isKnownAgentPermission(key: string): boolean {
    return AGENT_KNOWN.has(key);
}

export function agentHasPermission(stored: string, key: string): boolean {
    return parseAgentPermissions(stored).includes(key);
}
