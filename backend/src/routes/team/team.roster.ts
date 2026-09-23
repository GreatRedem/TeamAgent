import {
    FORM_FIELDS,
    MEMBER_NAME_MAX,
    MEMBER_TEXT_MAX,
    MEMBERS_MAX,
    ROSTER_CONTENT_MAX,
    ROSTER_FILE,
    ROSTER_INLINE_MAX,
    SOCIAL_MAX,
} from '../../constant.js';
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

export class RosterError extends Error {
    readonly code: string;

    constructor(message: string, code = 'ROSTER_INVALID') {
        super(message);

        this.code = code;
    }
}

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
        throw new RosterError(
            `${ROSTER_FILE} would exceed ${ROSTER_CONTENT_MAX} characters`,
            'ROSTER_TOO_LARGE',
        );
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

export function replaceMember(
    roster: Roster,
    previous: string | undefined,
    entry: unknown,
): Roster {
    const member = readMember(entry);

    if (!member) {
        throw new RosterError('a member needs a name');
    }

    for (const field of ['rank', 'description']) {
        if (typeof member[field] !== 'string' || (member[field] as string).trim() === '') {
            delete member[field];
        }
    }

    const profile = member['profile_id'];

    if (!(typeof profile === 'number' && Number.isInteger(profile) && profile > 0)) {
        delete member['profile_id'];
    }

    const at =
        previous === undefined
            ? -1
            : roster.members.findIndex(
                  (candidate) => memberKey(candidate.name) === memberKey(previous),
              );
    const clash = roster.members.findIndex(
        (candidate, index) => index !== at && memberKey(candidate.name) === memberKey(member.name),
    );

    if (clash !== -1) {
        throw new RosterError(
            `someone called ${member.name} is already on the team`,
            'ROSTER_MEMBER_TAKEN',
        );
    }

    if (at === -1) {
        if (roster.members.length >= MEMBERS_MAX) {
            throw new RosterError(
                `${ROSTER_FILE} already holds ${MEMBERS_MAX} members`,
                'ROSTER_FULL',
            );
        }

        return { ...roster, members: [...roster.members, member] };
    }

    const kept = Object.fromEntries(
        Object.entries(roster.members[at]).filter(([field]) => !FORM_FIELDS.includes(field)),
    );
    const members = [...roster.members];

    members[at] = { ...kept, ...member };

    return { ...roster, members };
}

export function rosterPrompt(content: string): string {
    let roster: Roster;

    try {
        roster = parseRoster(content);
    } catch {
        return '';
    }

    if (roster.members.length === 0) {
        return '';
    }

    const heading = [
        `# Your team (${ROSTER_FILE})`,
        '',
        'The people on this team: their rank, what they do and where to find them. Use it to answer questions about who someone is, what they do, who to ask about something and how to reach them. Do not invent members, ranks or handles that are not in it.',
    ];
    const json = JSON.stringify({ members: roster.members }, null, 1);

    if (json.length > ROSTER_INLINE_MAX) {
        return [
            ...heading,
            '',
            `${ROSTER_FILE} holds ${roster.members.length} people, too many to include here. Call \`roster_read\`, with a name to read one person, before answering a question about the team.`,
        ].join('\n');
    }

    return [...heading, '', '```json', json, '```'].join('\n');
}
