/**
 * What a Telegram profile is allowed to do.
 *
 * The granted keys are stored as one comma-joined column rather than a join
 * table or a column per permission: adding a permission is then a single entry
 * in `PERMISSIONS` below, with no schema change and nothing to migrate. The
 * set is small and always read whole, so there is nothing a join table would
 * buy here.
 *
 * Storage is a deny-by-default allow-list -- a key absent from the stored
 * string is not granted -- so a permission added later is off for everyone
 * until it is deliberately switched on.
 */

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
    },
    {
        key: 'prefs.read',
        label: 'Agent may read their files',
        description: 'Lets the agent read the files belonging to this person, including preferences.md, through the internal tools.'
    },
    {
        key: 'prefs.write',
        label: 'Agent may write their files',
        description: 'Lets the agent create and change the files belonging to this person. Granting it does not imply read.'
    }
];

const KNOWN = new Set(PERMISSIONS.map((permission) => permission.key));

/** What a profile starts with the first time it appears. */
export const DEFAULT_PERMISSIONS = [ 'chat' ];

/** Column limit; the whole catalog joined has to fit comfortably. */
export const PERMISSIONS_MAX = 512;

export function parsePermissions(stored: string): string[]
{
    // Unknown keys are dropped rather than kept: a permission removed from the
    // catalog must not linger in a row and silently come back if re-added.
    return stored
        .split(',')
        .map((key) => key.trim())
        .filter((key) => KNOWN.has(key));
}

export function serializePermissions(keys: string[]): string
{
    // Ordered by the catalog so the stored value is stable regardless of the
    // order the client sent, and de-duplicated on the way through.
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
