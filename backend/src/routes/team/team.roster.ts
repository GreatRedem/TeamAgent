export const ROSTER_FILE = 'team.json';

export const ROSTER_CONTENT_MAX = 65536;

export const MEMBERS_MAX = 500;

export const MEMBER_NAME_MAX = 120;

export const MEMBER_TEXT_MAX = 2000;

export const SOCIAL_MAX = 20;

export interface RosterMember {
    name: string;
    rank?: string;
    description?: string;
    social?: Record<string, string>;
    [key: string]: unknown;
}

export interface Roster {
    members: RosterMember[];
    [key: string]: unknown;
}

export class RosterError extends Error {}

export function emptyRoster(): Roster {
    return { members: [] };
}

export function memberKey(name: string): string {
    return name.trim().toLowerCase();
}

function readSocial(value: unknown): Record<string, string> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }

    const social: Record<string, string> = {};

    for (const [network, handle] of Object.entries(value)) {
        if (typeof handle === 'string' && handle.trim() !== '') {
            social[network.trim().slice(0, 32)] = handle.trim().slice(0, MEMBER_TEXT_MAX);
        }

        if (Object.keys(social).length >= SOCIAL_MAX) {
            break;
        }
    }

    return Object.keys(social).length === 0 ? undefined : social;
}

export function readMember(entry: unknown): RosterMember | undefined {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return undefined;
    }

    const source = entry as Record<string, unknown>;
    const name =
        typeof source['name'] === 'string' ? source['name'].trim().slice(0, MEMBER_NAME_MAX) : '';

    if (name === '') {
        return undefined;
    }

    const member: RosterMember = { ...source, name };

    for (const [field, value] of Object.entries(member)) {
        if (field !== 'social' && typeof value === 'string') {
            member[field] = value.slice(0, MEMBER_TEXT_MAX);
        }
    }

    const social = readSocial(source['social']);

    if (social) {
        member.social = social;
    } else {
        delete member.social;
    }

    return member;
}

export function parseRoster(content: string): Roster {
    if (content.trim() === '') {
        return emptyRoster();
    }

    let payload: unknown;

    try {
        payload = JSON.parse(content);
    } catch {
        throw new RosterError(`${ROSTER_FILE} is not valid JSON`);
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new RosterError(`${ROSTER_FILE} must be a JSON object`);
    }

    const source = payload as Record<string, unknown>;
    const raw = source['members'];

    if (raw !== undefined && !Array.isArray(raw)) {
        throw new RosterError(`${ROSTER_FILE} members must be an array`);
    }

    const members = (raw ?? [])
        .map(readMember)
        .filter((member): member is RosterMember => member !== undefined)
        .slice(0, MEMBERS_MAX);

    return { ...source, members };
}

export function serializeRoster(roster: Roster): string {
    const content = `${JSON.stringify(roster, null, 2)}\n`;

    if (content.length > ROSTER_CONTENT_MAX) {
        throw new RosterError(`${ROSTER_FILE} would exceed ${ROSTER_CONTENT_MAX} characters`);
    }

    return content;
}

export function findMember(roster: Roster, name: string): RosterMember | undefined {
    const key = memberKey(name);

    return roster.members.find((member) => memberKey(member.name) === key);
}

export function upsertMember(roster: Roster, patch: RosterMember): Roster {
    const member = readMember(patch);

    if (!member) {
        throw new RosterError('a member needs a name');
    }

    const key = memberKey(member.name);
    const at = roster.members.findIndex((candidate) => memberKey(candidate.name) === key);

    if (at === -1) {
        if (roster.members.length >= MEMBERS_MAX) {
            throw new RosterError(`${ROSTER_FILE} already holds ${MEMBERS_MAX} members`);
        }

        return { ...roster, members: [...roster.members, member] };
    }

    const stored = roster.members[at];

    const merged: RosterMember = {
        ...stored,
        ...member,
        name: stored.name,
        ...((stored.social ?? member.social) && { social: { ...stored.social, ...member.social } }),
    };

    const members = [...roster.members];

    members[at] = merged;

    return { ...roster, members };
}

export function removeMember(roster: Roster, name: string): { roster: Roster; removed: boolean } {
    const key = memberKey(name);
    const members = roster.members.filter((member) => memberKey(member.name) !== key);

    return { roster: { ...roster, members }, removed: members.length !== roster.members.length };
}
