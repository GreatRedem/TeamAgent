import { PERMISSIONS, TELEGRAM_KNOWN } from '../../constant.js';
export interface Permission {
    key: string;
    label: string;
    description: string;
}

export function parsePermissions(stored: string): string[] {
    return stored
        .split(',')
        .map((key) => key.trim())
        .filter((key) => TELEGRAM_KNOWN.has(key));
}

export function serializePermissions(keys: string[]): string {
    return PERMISSIONS.filter((permission) => keys.includes(permission.key))
        .map((permission) => permission.key)
        .join(',');
}

export function isKnownPermission(key: string): boolean {
    return TELEGRAM_KNOWN.has(key);
}

export function hasPermission(stored: string, key: string): boolean {
    return parsePermissions(stored).includes(key);
}
