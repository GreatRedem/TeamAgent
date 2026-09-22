export interface Permission
{
    key: string;
    label: string;
    description: string;
}

export const PERMISSIONS: Permission[] = [
    {
        key: 'chat',
        label: 'Chat',
        description: 'May message the team\'s bots. Without it, messages are acknowledged to Telegram but not recorded.'
    },
    {
        key: 'model',
        label: 'Chat with model',
        description: 'May have messages answered by the team\'s configured model.'
    }
];

const KNOWN = new Set(PERMISSIONS.map((permission) => permission.key));

export const DEFAULT_PERMISSIONS = [ 'chat' ];

export const PERMISSIONS_MAX = 512;

export function parsePermissions(stored: string): string[]
{
    return stored
        .split(',')
        .map((key) => key.trim())
        .filter((key) => KNOWN.has(key));
}

export function serializePermissions(keys: string[]): string
{
    return PERMISSIONS
        .filter((permission) => keys.includes(permission.key))
        .map((permission) => permission.key)
        .join(',');
}

export function isKnownPermission(key: string): boolean
{
    return KNOWN.has(key);
}

export function hasPermission(stored: string, key: string): boolean
{
    return parsePermissions(stored).includes(key);
}
