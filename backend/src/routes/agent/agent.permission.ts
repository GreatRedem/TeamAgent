/**
 * What an agent is allowed to do.
 *
 * Separate from `telegram.permission.ts`, which governs what a *person* may do
 * (may they chat, may they reach the model). These describe a capability of the
 * agent itself: whether it is the kind of agent that keeps notes about people.
 * Putting them on the profile made every person answer a question about the
 * agent's design, which is not theirs to answer.
 *
 * Stored and parsed exactly like the profile permissions: comma-joined keys,
 * deny-by-default, unknown keys dropped on read.
 */

export interface AgentPermission
{
    key: string;
    label: string;
    description: string;
}

export const AGENT_PERMISSIONS: AgentPermission[] = [
    {
        key: 'prefs.read',
        label: 'May read files',
        description: 'Lets this agent read the markdown files it keeps for the people it talks to.'
    },
    {
        key: 'prefs.write',
        label: 'May write files',
        description: 'Lets this agent create and change those files. Granting it does not imply read.'
    },
    {
        key: 'conversation.read',
        label: 'May search past messages',
        description: 'Lets this agent look back through what a person has written to it before, beyond the recent turns it already sees.'
    },
    {
        key: 'team.read',
        label: 'May see the team roster',
        description: 'Lets this agent list the people the team knows and read what has been recorded about them, not only the person it is currently talking to.'
    },
    {
        key: 'team.write',
        label: 'May remember things about the team',
        description: 'Lets this agent add notes about any member of the team. It can only append, so nothing already recorded is lost.'
    },
    {
        key: 'web.fetch',
        label: 'May fetch web pages',
        description: 'Lets this agent read public web pages. Private, loopback and cloud-metadata addresses are always refused, whoever asks.'
    },
    {
        key: 'basics',
        label: 'May read the clock',
        description: 'Lets this agent know the current date and time. Harmless, and on by default for new agents.'
    }
];

const KNOWN = new Set(AGENT_PERMISSIONS.map((permission) => permission.key));

/**
 * A new agent starts with only the harmless one. Everything that reads files,
 * history or the network is switched on deliberately.
 */
export const DEFAULT_AGENT_PERMISSIONS: string[] = [ 'basics' ];

export const AGENT_PERMISSIONS_MAX = 256;

export function parseAgentPermissions(stored: string): string[]
{
    return stored
        .split(',')
        .map((key) => key.trim())
        .filter((key) => KNOWN.has(key));
}

export function serializeAgentPermissions(keys: string[]): string
{
    // Catalog order, de-duplicated, so the stored value does not depend on the
    // order the client happened to send.
    return AGENT_PERMISSIONS
        .filter((permission) => keys.includes(permission.key))
        .map((permission) => permission.key)
        .join(',');
}

export function isKnownAgentPermission(key: string): boolean
{
    return KNOWN.has(key);
}

export function agentHasPermission(stored: string, key: string): boolean
{
    return parseAgentPermissions(stored).includes(key);
}
