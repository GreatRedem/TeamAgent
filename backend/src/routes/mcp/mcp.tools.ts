import type { FastifyInstance } from 'fastify';

import { TeamAgent, TeamAgentDocument } from '../agent/agent.entity.js';
import { agentHasPermission } from '../agent/agent.permission.js';
import { audit } from '../audit/audit.log.js';
import { TeamDocument } from '../team/team.entity.js';
import {
    ROSTER_FILE,
    RosterError,
    findMember,
    parseRoster,
    removeMember,
    serializeRoster,
    upsertMember,
    type Roster,
} from '../team/team.roster.js';
import {
    TelegramMessage,
    TelegramUser,
    TelegramUserDocument,
} from '../telegram/telegram.entity.js';
import { FETCH_BYTES_MAX, fetchPublicUrl } from './mcp.web.js';

export interface ToolDefinition {
    name: string;
    description: string;
    permission: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required: string[];
    };
}

export const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}\.md$/;
export const DOCUMENT_CONTENT_MAX = 16384;

const PREFERENCES_TEMPLATE = `# Preferences

What this person wants remembered between conversations.

- (nothing recorded yet)
`;

export const TOOLS: ToolDefinition[] = [
    {
        name: 'preferences_list',
        description: 'List the markdown files stored for the person you are talking to.',
        permission: 'prefs.read',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'preferences_read',
        description: "Read one of the person's markdown files, for example preferences.md.",
        permission: 'prefs.read',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'File name, e.g. preferences.md' } },
            required: ['name'],
        },
    },
    {
        name: 'preferences_write',
        description:
            "Replace the whole contents of one of the person's markdown files, creating it if needed. Read it first unless you intend to discard what is there.",
        permission: 'prefs.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'File name, e.g. preferences.md' },
                content: { type: 'string', description: 'The complete new contents of the file' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'preferences_append',
        description:
            "Add a line to the end of one of the person's markdown files without rewriting it.",
        permission: 'prefs.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'File name, e.g. preferences.md' },
                content: { type: 'string', description: 'The line to add' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'profile_get',
        description:
            'Read the stored facts about the person you are talking to: their name, username, language and how much they have written.',
        permission: 'prefs.read',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'conversation_search',
        description:
            'Search everything this person has written to you before, further back than the recent turns you can already see.',
        permission: 'conversation.read',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Text to look for, case-insensitive' },
                offset: {
                    type: 'integer',
                    description: 'Skip this many matches, to read past the first page',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'team_members',
        description:
            'List the people this team knows: everyone who has written to one of its bots. Start here when you need to know who someone is.',
        permission: 'team.read',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Optional name or username to filter by, case-insensitive',
                },
                offset: {
                    type: 'integer',
                    description:
                        'Skip this many people; use next_offset from a previous call to read the rest',
                },
            },
            required: [],
        },
    },
    {
        name: 'team_member_read',
        description:
            'Read what has been recorded about one member of the team. Use the member_id from team_members.',
        permission: 'team.read',
        inputSchema: {
            type: 'object',
            properties: {
                member_id: { type: 'integer', description: 'The member_id from team_members' },
                name: { type: 'string', description: 'File name, defaults to preferences.md' },
            },
            required: ['member_id'],
        },
    },
    {
        name: 'team_member_note',
        description:
            'Remember something about one member of the team by adding a line to their notes. It appends, so nothing already recorded is lost.',
        permission: 'team.write',
        inputSchema: {
            type: 'object',
            properties: {
                member_id: { type: 'integer', description: 'The member_id from team_members' },
                content: { type: 'string', description: 'The single line to remember' },
                name: { type: 'string', description: 'File name, defaults to preferences.md' },
            },
            required: ['member_id', 'content'],
        },
    },
    {
        name: 'web_fetch',
        description:
            'Fetch a public web page or API response and read its text. Only public addresses work; private and internal ones are always refused.',
        permission: 'web.fetch',
        inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Full http or https url' } },
            required: ['url'],
        },
    },
    {
        name: 'time_now',
        description:
            'The current date and time in UTC. Use this rather than guessing what day it is.',
        permission: 'basics',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'roster_read',
        description:
            'Read team.json: the people on this team with their rank, description and public handles. Use it before answering questions about who someone is or what they do.',
        permission: 'roster.read',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Optional: return only this member instead of everyone',
                },
            },
            required: [],
        },
    },
    {
        name: 'roster_member_set',
        description:
            'Record a person in team.json, creating them or updating what is already there. Only the fields you pass are changed, so you can add a rank without touching a description. Use roster_read first when you need to know what is already recorded.',
        permission: 'roster.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: "The person's name; this is how they are addressed",
                },
                rank: {
                    type: 'string',
                    description: 'Their role or rank on the team, e.g. founder, engineer',
                },
                description: {
                    type: 'string',
                    description: 'What they do and anything worth remembering about them',
                },
                social: {
                    type: 'object',
                    description:
                        'Handles per network, e.g. {"x":"@alex","github":"alexk"}. Merged with any already recorded.',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'roster_member_remove',
        description:
            'Remove a person from team.json. Use this only when asked to; it is the one roster action that loses information.',
        permission: 'roster.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name of the member to remove' },
            },
            required: ['name'],
        },
    },
    {
        name: 'document_read',
        description:
            'Read one of your own reference files by name, for example knowledge.md. The files you can open are listed at the end of your instructions.',
        permission: 'basics',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'File name, e.g. knowledge.md' } },
            required: ['name'],
        },
    },
];

function readOffset(args: Record<string, unknown>): number {
    const offset = Number(args['offset'] ?? 0);

    return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

const SEARCH_LIMIT = 20;

const ROSTER_LIMIT = 50;

export function allowedTools(agentPermissions: string): ToolDefinition[] {
    return TOOLS.filter((tool) => agentHasPermission(agentPermissions, tool.permission));
}

export function toOpenAITools(tools: ToolDefinition[]) {
    return tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
}

export interface ToolResult {
    ok: boolean;
    content: string;
}

function refuse(reason: string): ToolResult {
    return { ok: false, content: JSON.stringify({ error: reason }) };
}

async function readRosterContent(fastify: FastifyInstance, teamId: number): Promise<string> {
    const row = await fastify.db
        .getRepository(TeamDocument)
        .findOneBy({ team_id: teamId, name: ROSTER_FILE });

    return row?.content ?? '';
}

async function writeRosterContent(
    fastify: FastifyInstance,
    teamId: number,
    content: string,
): Promise<void> {
    const repository = fastify.db.getRepository(TeamDocument);
    const row = await repository.findOneBy({ team_id: teamId, name: ROSTER_FILE });

    await (row
        ? repository.update({ id: row.id }, { content })
        : repository.save({ team_id: teamId, name: ROSTER_FILE, content }));
}

async function ensureSeeded(fastify: FastifyInstance, userId: number): Promise<void> {
    const repository = fastify.db.getRepository(TelegramUserDocument);

    if ((await repository.countBy({ user_id: userId })) > 0) {
        return;
    }

    await repository.save({
        user_id: userId,
        name: 'preferences.md',
        content: PREFERENCES_TEMPLATE,
    });
}

export async function runTool(
    fastify: FastifyInstance,
    agent: TeamAgent,
    user: TelegramUser,
    name: string,
    args: Record<string, unknown>,
): Promise<ToolResult> {
    const tool = TOOLS.find((candidate) => candidate.name === name);

    if (!tool) {
        return refuse('unknown tool');
    }

    if (!agentHasPermission(agent.permissions, tool.permission)) {
        return refuse(`not permitted: this agent does not have ${tool.permission}`);
    }

    if (tool.name === 'time_now') {
        const now = new Date();

        return {
            ok: true,
            content: JSON.stringify({
                utc: now.toISOString(),
                unix: Math.floor(now.getTime() / 1000),
            }),
        };
    }

    if (tool.name === 'roster_read') {
        let roster: Roster;

        try {
            roster = parseRoster(await readRosterContent(fastify, agent.team_id));
        } catch (cause) {
            return refuse(
                cause instanceof RosterError ? cause.message : 'team.json could not be read',
            );
        }

        const one = typeof args['name'] === 'string' ? args['name'].trim() : '';

        if (one !== '') {
            const member = findMember(roster, one);

            return member
                ? { ok: true, content: JSON.stringify(member) }
                : refuse(`no member named ${one}`);
        }

        return {
            ok: true,
            content: JSON.stringify({ members: roster.members, count: roster.members.length }),
        };
    }

    if (tool.name === 'roster_member_set' || tool.name === 'roster_member_remove') {
        const name = typeof args['name'] === 'string' ? args['name'].trim() : '';

        if (name === '') {
            return refuse('name is required');
        }

        let next: Roster;
        let outcome: string;

        try {
            const roster = parseRoster(await readRosterContent(fastify, agent.team_id));

            if (tool.name === 'roster_member_remove') {
                const removed = removeMember(roster, name);

                if (!removed.removed) {
                    return refuse(`no member named ${name}`);
                }

                next = removed.roster;
                outcome = 'removed';
            } else {
                const existed = findMember(roster, name) !== undefined;

                next = upsertMember(roster, {
                    name,
                    ...(typeof args['rank'] === 'string' && { rank: args['rank'] }),
                    ...(typeof args['description'] === 'string' && {
                        description: args['description'],
                    }),
                    ...(typeof args['social'] === 'object' &&
                        args['social'] !== null && {
                            social: args['social'] as Record<string, string>,
                        }),
                });

                outcome = existed ? 'updated' : 'added';
            }

            await writeRosterContent(fastify, agent.team_id, serializeRoster(next));
        } catch (cause) {
            return refuse(
                cause instanceof RosterError ? cause.message : 'team.json could not be written',
            );
        }

        await audit(fastify, fastify.log, {
            teamId: agent.team_id,
            actor: 'agent',
            action: 'agent.roster',
            target: `team:${agent.team_id}`,
            detail: `${outcome} ${name} · agent ${agent.id} (${agent.name}) · ${next.members.length} members`,
        });

        return {
            ok: true,
            content: JSON.stringify({ result: outcome, name, members: next.members.length }),
        };
    }

    if (tool.name === 'document_read') {
        const name = typeof args['name'] === 'string' ? args['name'].trim() : '';

        if (!DOCUMENT_NAME_PATTERN.test(name)) {
            return refuse('name must be a plain markdown filename, e.g. knowledge.md');
        }

        const document = await fastify.db
            .getRepository(TeamAgentDocument)
            .findOneBy({ agent_id: agent.id, name });

        if (!document) {
            return refuse(`no such file: ${name}`);
        }

        return {
            ok: true,
            content: JSON.stringify({ name: document.name, content: document.content }),
        };
    }

    if (tool.name === 'web_fetch') {
        const url = typeof args['url'] === 'string' ? args['url'].trim() : '';

        if (url === '') {
            return refuse('url is required');
        }

        const fetched = await fetchPublicUrl(url);

        if (!fetched.ok) {
            return refuse(fetched.reason ?? 'fetch refused');
        }

        return {
            ok: true,
            content: JSON.stringify({
                url: fetched.finalUrl,
                status: fetched.status,
                content_type: fetched.contentType,
                truncated: fetched.truncated === true,
                bytes_limit: FETCH_BYTES_MAX,
                text: fetched.text,
            }),
        };
    }

    if (tool.name === 'conversation_search') {
        const query = typeof args['query'] === 'string' ? args['query'].trim() : '';

        if (query === '') {
            return refuse('query is required');
        }

        const matches = await fastify.db
            .getRepository(TelegramMessage)
            .createQueryBuilder('message')
            .where('message.user_id = :userId', { userId: user.id })
            .andWhere('message.text ILIKE :query', { query: `%${query}%` })
            .orderBy('message.id', 'DESC')
            .skip(readOffset(args))
            .take(SEARCH_LIMIT)
            .getMany();

        return {
            ok: true,
            content: JSON.stringify({
                matches: matches.map((message) => ({
                    direction: message.direction,
                    text: message.text,
                    sent_at: message.sent_at,
                })),
            }),
        };
    }

    if (tool.name === 'team_members') {
        const query = typeof args['query'] === 'string' ? args['query'].trim() : '';

        const builder = fastify.db
            .getRepository(TelegramUser)
            .createQueryBuilder('member')
            .where('member.team_id = :teamId', { teamId: agent.team_id });

        if (query !== '') {
            builder.andWhere(
                '(member.first_name ILIKE :q OR member.last_name ILIKE :q OR member.username ILIKE :q)',
                { q: `%${query}%` },
            );
        }

        const total = await builder.getCount();
        const offset = readOffset(args);
        const members = await builder
            .orderBy('member.last_seen_at', 'DESC')
            .skip(offset)
            .take(ROSTER_LIMIT)
            .getMany();

        return {
            ok: true,
            content: JSON.stringify({
                total,
                shown: members.length,
                offset,
                ...(offset + members.length < total && { next_offset: offset + members.length }),
                members: members.map((member) => ({
                    member_id: member.id,
                    first_name: member.first_name,
                    last_name: member.last_name,
                    username: member.username,
                    message_count: member.message_count,
                    last_seen_at: member.last_seen_at,
                    is_you: member.id === user.id,
                })),
            }),
        };
    }

    if (tool.name === 'team_member_read' || tool.name === 'team_member_note') {
        const memberId = Number(args['member_id']);

        if (!Number.isInteger(memberId) || memberId <= 0) {
            return refuse('member_id is required; get it from team_members');
        }

        const member = await fastify.db
            .getRepository(TelegramUser)
            .findOneBy({ id: memberId, team_id: agent.team_id });

        if (!member) {
            return refuse('no such member of this team');
        }

        const raw = typeof args['name'] === 'string' ? args['name'].trim() : '';
        const noteName = raw === '' ? 'preferences.md' : raw;

        if (!DOCUMENT_NAME_PATTERN.test(noteName)) {
            return refuse('name must be a plain markdown filename, e.g. preferences.md');
        }

        const documents = fastify.db.getRepository(TelegramUserDocument);
        const stored = await documents.findOneBy({ user_id: member.id, name: noteName });

        if (tool.name === 'team_member_read') {
            return stored
                ? {
                      ok: true,
                      content: JSON.stringify({
                          member_id: member.id,
                          name: stored.name,
                          content: stored.content,
                      }),
                  }
                : refuse('nothing recorded for that member under that name');
        }

        const line = typeof args['content'] === 'string' ? args['content'].trim() : '';

        if (line === '') {
            return refuse('content is required');
        }

        const merged = stored ? `${stored.content.replace(/\s+$/, '')}\n${line}\n` : `${line}\n`;

        if (merged.length > DOCUMENT_CONTENT_MAX) {
            return refuse('the notes for that member are full');
        }

        if (stored) {
            await documents.update({ id: stored.id }, { content: merged });
        } else {
            await documents.save({ user_id: member.id, name: noteName, content: merged });
        }

        await audit(fastify, fastify.log, {
            teamId: agent.team_id,
            action: 'agent.member_note',
            target: `profile:${member.id}`,
            actor: 'agent',
            detail: `${agent.name} appended to ${noteName}, now ${merged.length} chars`,
        });

        return {
            ok: true,
            content: JSON.stringify({ member_id: member.id, name: noteName, chars: merged.length }),
        };
    }

    const repository = fastify.db.getRepository(TelegramUserDocument);

    if (tool.name === 'profile_get') {
        return {
            ok: true,
            content: JSON.stringify({
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                language_code: user.language_code,
                message_count: user.message_count,
            }),
        };
    }

    if (tool.name === 'preferences_list') {
        await ensureSeeded(fastify, user.id);

        const documents = await repository.find({
            where: { user_id: user.id },
            order: { name: 'ASC' },
        });

        return {
            ok: true,
            content: JSON.stringify({
                files: documents.map((document) => ({
                    name: document.name,
                    chars: document.content.length,
                })),
            }),
        };
    }

    const fileName = typeof args['name'] === 'string' ? args['name'].trim() : '';

    if (!DOCUMENT_NAME_PATTERN.test(fileName)) {
        return refuse('name must be a plain markdown filename, e.g. preferences.md');
    }

    if (tool.name === 'preferences_read') {
        await ensureSeeded(fastify, user.id);

        const document = await repository.findOneBy({ user_id: user.id, name: fileName });

        if (!document) {
            return refuse('no such file');
        }

        return {
            ok: true,
            content: JSON.stringify({ name: document.name, content: document.content }),
        };
    }

    const body = typeof args['content'] === 'string' ? args['content'] : '';

    if (body.length > DOCUMENT_CONTENT_MAX) {
        return refuse(`content exceeds ${DOCUMENT_CONTENT_MAX} characters`);
    }

    const existing = await repository.findOneBy({ user_id: user.id, name: fileName });

    if (tool.name === 'preferences_append') {
        const merged = existing
            ? `${existing.content.replace(/\s+$/, '')}\n${body}\n`
            : `${body}\n`;

        if (merged.length > DOCUMENT_CONTENT_MAX) {
            return refuse('file would exceed its size limit');
        }

        if (existing) {
            await repository.update({ id: existing.id }, { content: merged });
        } else {
            await repository.save({ user_id: user.id, name: fileName, content: merged });
        }

        return { ok: true, content: JSON.stringify({ name: fileName, chars: merged.length }) };
    }

    if (existing) {
        await repository.update({ id: existing.id }, { content: body });
    } else {
        await repository.save({ user_id: user.id, name: fileName, content: body });
    }

    return { ok: true, content: JSON.stringify({ name: fileName, chars: body.length }) };
}
