/**
 * The team's own roster file, `team.json`.
 *
 * Pure: no database, no Fastify. An agent writes this file, so what counts as a
 * valid roster has to be decided somewhere that can be exercised without either
 * -- the rules below are the interesting part, not the storage.
 *
 * A member is addressed by **name**, case-insensitively. An agent knows the
 * person it is talking about by name and nothing else; making it carry an
 * opaque id would mean a lookup before every write, and a roster small enough
 * to live in one file is small enough for a name to be unique in it.
 */

export const ROSTER_FILE = 'team.json';

/** Ceiling on the stored file, matching the other document tables. */
export const ROSTER_CONTENT_MAX = 65536;

/** Past this a roster is a database, not a file. */
export const MEMBERS_MAX = 500;

export const MEMBER_NAME_MAX = 120;

/** Applied to every string a member carries, known field or not. */
export const MEMBER_TEXT_MAX = 2000;

/** Handles per member. Generous; the cap exists so one entry cannot fill the file. */
export const SOCIAL_MAX = 20;

export interface RosterMember
{
    name: string;
    rank?: string;
    description?: string;
    /** Handle per network, e.g. `{ "x": "@alex", "github": "alexk" }`. */
    social?: Record<string, string>;
    /** Anything the team keeps that has no field here -- the "etc". */
    [key: string]: unknown;
}

export interface Roster
{
    members: RosterMember[];
    [key: string]: unknown;
}

export class RosterError extends Error { }

export function emptyRoster(): Roster
{
    return { members: [ ] };
}

/** Identity, so `Alex` and `alex` are one person rather than two rows. */
export function memberKey(name: string): string
{
    return name.trim().toLowerCase();
}

function readSocial(value: unknown): Record<string, string> | undefined
{
    if (typeof value !== 'object' || value === null || Array.isArray(value))
    {
        return undefined;
    }

    const social: Record<string, string> = { };

    for (const [ network, handle ] of Object.entries(value))
    {
        // Anything that is not a plain string is dropped rather than rejected:
        // one odd handle should not make the whole roster unreadable.
        if (typeof handle === 'string' && handle.trim() !== '')
        {
            social[network.trim().slice(0, 32)] = handle.trim().slice(0, MEMBER_TEXT_MAX);
        }

        if (Object.keys(social).length >= SOCIAL_MAX)
        {
            break;
        }
    }

    return Object.keys(social).length === 0 ? undefined : social;
}

/**
 * One member as stored, or undefined for an entry with no usable name.
 *
 * Unknown fields are carried through untouched: the file is the team's, and a
 * field this code does not recognise is not therefore a mistake.
 */
export function readMember(entry: unknown): RosterMember | undefined
{
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
    {
        return undefined;
    }

    const source = entry as Record<string, unknown>;
    const name = typeof source['name'] === 'string' ? source['name'].trim().slice(0, MEMBER_NAME_MAX) : '';

    if (name === '')
    {
        return undefined;
    }

    const member: RosterMember = { ...source, name };

    for (const [ field, value ] of Object.entries(member))
    {
        if (field !== 'social' && typeof value === 'string')
        {
            member[field] = value.slice(0, MEMBER_TEXT_MAX);
        }
    }

    const social = readSocial(source['social']);

    if (social)
    {
        member.social = social;
    }
    else
    {
        delete member.social;
    }

    return member;
}

/**
 * Reads stored text into a roster.
 *
 * Throws on text that is not a JSON object rather than returning an empty
 * roster: a caller that cannot tell "no members yet" from "the file is damaged"
 * would happily write the first over the second. An empty file is the one case
 * that is genuinely new, so it alone reads as empty.
 */
export function parseRoster(content: string): Roster
{
    if (content.trim() === '')
    {
        return emptyRoster();
    }

    let payload: unknown;

    try
    {
        payload = JSON.parse(content);
    }
    catch
    {
        throw new RosterError(`${ ROSTER_FILE } is not valid JSON`);
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    {
        throw new RosterError(`${ ROSTER_FILE } must be a JSON object`);
    }

    const source = payload as Record<string, unknown>;
    const raw = source['members'];

    if (raw !== undefined && !Array.isArray(raw))
    {
        throw new RosterError(`${ ROSTER_FILE } members must be an array`);
    }

    const members = (raw ?? [ ])
        .map(readMember)
        .filter((member): member is RosterMember => member !== undefined)
        .slice(0, MEMBERS_MAX);

    return { ...source, members };
}

/** Canonical text for storage: stable key order per member, readable in a diff. */
export function serializeRoster(roster: Roster): string
{
    const content = `${ JSON.stringify(roster, null, 2) }\n`;

    if (content.length > ROSTER_CONTENT_MAX)
    {
        throw new RosterError(`${ ROSTER_FILE } would exceed ${ ROSTER_CONTENT_MAX } characters`);
    }

    return content;
}

export function findMember(roster: Roster, name: string): RosterMember | undefined
{
    const key = memberKey(name);

    return roster.members.find((member) => memberKey(member.name) === key);
}

/**
 * Adds a member, or merges fields into the one already there.
 *
 * Merged rather than replaced, and `social` merged a level deeper, so recording
 * someone's rank does not erase the description written for them last week and
 * adding a GitHub handle does not drop their existing ones. Whole-member
 * replacement is deliberately not offered to agents -- one confused turn should
 * not be able to blank a person.
 *
 * The stored spelling of the name wins. An agent addressing `alex` is naming
 * the person, not renaming them; correcting capitalisation is an owner edit
 * through the API.
 */
export function upsertMember(roster: Roster, patch: RosterMember): Roster
{
    const member = readMember(patch);

    if (!member)
    {
        throw new RosterError('a member needs a name');
    }

    const key = memberKey(member.name);
    const at = roster.members.findIndex((candidate) => memberKey(candidate.name) === key);

    if (at === -1)
    {
        if (roster.members.length >= MEMBERS_MAX)
        {
            throw new RosterError(`${ ROSTER_FILE } already holds ${ MEMBERS_MAX } members`);
        }

        return { ...roster, members: [ ...roster.members, member ] };
    }

    const stored = roster.members[at];

    const merged: RosterMember = {
        ...stored,
        ...member,
        name: stored.name,
        ...(stored.social ?? member.social) && { social: { ...stored.social, ...member.social } }
    };

    const members = [ ...roster.members ];

    members[at] = merged;

    return { ...roster, members };
}

/** Removes a member, reporting whether there was one to remove. */
export function removeMember(roster: Roster, name: string): { roster: Roster; removed: boolean }
{
    const key = memberKey(name);
    const members = roster.members.filter((member) => memberKey(member.name) !== key);

    return { roster: { ...roster, members }, removed: members.length !== roster.members.length };
}
