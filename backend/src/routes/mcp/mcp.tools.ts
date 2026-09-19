import type { FastifyInstance } from 'fastify';

import { TeamAgent } from '../agent/agent.entity.js';
import { agentHasPermission } from '../agent/agent.permission.js';
import { TelegramMessage, TelegramUser, TelegramUserDocument } from '../telegram/telegram.entity.js';
import { FETCH_BYTES_MAX, fetchPublicUrl } from './mcp.web.js';
import { audit } from '../audit/audit.log.js';

/**
 * The internal tool protocol agents use to manage the person they are talking
 * to.
 *
 * Definitions are MCP-shaped -- `name`, `description`, `inputSchema` -- rather
 * than written in the model vendor's format, so the registry stays the single
 * description of what a tool is and `toOpenAITools` adapts it at the edge. If
 * these are ever exposed over a real MCP transport, the definitions move
 * unchanged and only the adapter is replaced.
 *
 * Every tool names the permission it needs, and that permission belongs to the
 * **agent**, not to the person being talked about: whether an agent keeps notes
 * is a property of how it was built, not a question each person should have to
 * answer.
 *
 * There is deliberately **no tool that touches permissions themselves**: an
 * agent that could grant its own access would make the whole model decorative,
 * so that stays an owner-only action through the HTTP API.
 */

export interface ToolDefinition
{
    name: string;
    description: string;
    /** The permission the profile must hold for the agent to use this. */
    permission: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required: string[];
    };
}

export const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}\.md$/;
export const DOCUMENT_CONTENT_MAX = 16384;

/** Seeded the first time a profile's files are touched. */
const PREFERENCES_TEMPLATE = `# Preferences

What this person wants remembered between conversations.

- (nothing recorded yet)
`;

export const TOOLS: ToolDefinition[] = [
    {
        name: 'preferences_list',
        description: 'List the markdown files stored for the person you are talking to.',
        permission: 'prefs.read',
        inputSchema: { type: 'object', properties: { }, required: [ ] }
    },
    {
        name: 'preferences_read',
        description: 'Read one of the person\'s markdown files, for example preferences.md.',
        permission: 'prefs.read',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'File name, e.g. preferences.md' } },
            required: [ 'name' ]
        }
    },
    {
        name: 'preferences_write',
        description: 'Replace the whole contents of one of the person\'s markdown files, creating it if needed. Read it first unless you intend to discard what is there.',
        permission: 'prefs.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'File name, e.g. preferences.md' },
                content: { type: 'string', description: 'The complete new contents of the file' }
            },
            required: [ 'name', 'content' ]
        }
    },
    {
        name: 'preferences_append',
        description: 'Add a line to the end of one of the person\'s markdown files without rewriting it.',
        permission: 'prefs.write',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'File name, e.g. preferences.md' },
                content: { type: 'string', description: 'The line to add' }
            },
            required: [ 'name', 'content' ]
        }
    },
    {
        name: 'profile_get',
        description: 'Read the stored facts about the person you are talking to: their name, username, language and how much they have written.',
        permission: 'prefs.read',
        inputSchema: { type: 'object', properties: { }, required: [ ] }
    },
    {
        name: 'conversation_search',
        description: 'Search everything this person has written to you before, further back than the recent turns you can already see.',
        permission: 'conversation.read',
        inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Text to look for, case-insensitive' } },
            required: [ 'query' ]
        }
    },
    {
        name: 'team_members',
        description: 'List the people this team knows: everyone who has written to one of its bots. Start here when you need to know who someone is.',
        permission: 'team.read',
        inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Optional name or username to filter by, case-insensitive' } },
            required: [ ]
        }
    },
    {
        name: 'team_member_read',
        description: 'Read what has been recorded about one member of the team. Use the member_id from team_members.',
        permission: 'team.read',
        inputSchema: {
            type: 'object',
            properties: {
                member_id: { type: 'integer', description: 'The member_id from team_members' },
                name: { type: 'string', description: 'File name, defaults to preferences.md' }
            },
            required: [ 'member_id' ]
        }
    },
    {
        name: 'team_member_note',
        description: 'Remember something about one member of the team by adding a line to their notes. It appends, so nothing already recorded is lost.',
        permission: 'team.write',
        inputSchema: {
            type: 'object',
            properties: {
                member_id: { type: 'integer', description: 'The member_id from team_members' },
                content: { type: 'string', description: 'The single line to remember' },
                name: { type: 'string', description: 'File name, defaults to preferences.md' }
            },
            required: [ 'member_id', 'content' ]
        }
    },
    {
        name: 'web_fetch',
        description: 'Fetch a public web page or API response and read its text. Only public addresses work; private and internal ones are always refused.',
        permission: 'web.fetch',
        inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Full http or https url' } },
            required: [ 'url' ]
        }
    },
    {
        name: 'time_now',
        description: 'The current date and time in UTC. Use this rather than guessing what day it is.',
        permission: 'basics',
        inputSchema: { type: 'object', properties: { }, required: [ ] }
    }
];

/** How many past messages a search may return. */
const SEARCH_LIMIT = 20;

/** How many people one roster listing may return. */
const ROSTER_LIMIT = 50;

/** The tools an agent's own capabilities allow. */
export function allowedTools(agentPermissions: string): ToolDefinition[]
{
    return TOOLS.filter((tool) => agentHasPermission(agentPermissions, tool.permission));
}

/** Adapts the registry to the shape an OpenAI-compatible endpoint expects. */
export function toOpenAITools(tools: ToolDefinition[])
{
    return tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
    }));
}

export interface ToolResult
{
    ok: boolean;
    /** Serialised back to the model as the tool message content. */
    content: string;
}

function refuse(reason: string): ToolResult
{
    return { ok: false, content: JSON.stringify({ error: reason }) };
}

/**
 * Creates `preferences.md` the first time a profile's files are looked at, so
 * an agent always has somewhere to write rather than having to invent a
 * filename.
 */
async function ensureSeeded(fastify: FastifyInstance, userId: number): Promise<void>
{
    const repository = fastify.db.getRepository(TelegramUserDocument);

    if (await repository.countBy({ user_id: userId }) > 0)
    {
        return;
    }

    await repository.save({ user_id: userId, name: 'preferences.md', content: PREFERENCES_TEMPLATE });
}

/**
 * Runs one tool call on behalf of an agent.
 *
 * The permission is re-checked here rather than trusted from the advertised
 * list: the tools offered to the model and the tools it actually asks for are
 * separate things, and a model can name a tool it was never given.
 *
 * Errors come back as tool results rather than thrown, because the model is
 * expected to read and react to them -- a refusal is information, not a crash.
 */
export async function runTool(fastify: FastifyInstance, agent: TeamAgent, user: TelegramUser, name: string, args: Record<string, unknown>): Promise<ToolResult>
{
    const tool = TOOLS.find((candidate) => candidate.name === name);

    if (!tool)
    {
        return refuse('unknown tool');
    }

    if (!agentHasPermission(agent.permissions, tool.permission))
    {
        return refuse(`not permitted: this agent does not have ${ tool.permission }`);
    }

    if (tool.name === 'time_now')
    {
        const now = new Date();

        return { ok: true, content: JSON.stringify({ utc: now.toISOString(), unix: Math.floor(now.getTime() / 1000) }) };
    }

    if (tool.name === 'web_fetch')
    {
        const url = typeof args['url'] === 'string' ? args['url'].trim() : '';

        if (url === '')
        {
            return refuse('url is required');
        }

        const fetched = await fetchPublicUrl(url);

        if (!fetched.ok)
        {
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
                text: fetched.text
            })
        };
    }

    if (tool.name === 'conversation_search')
    {
        const query = typeof args['query'] === 'string' ? args['query'].trim() : '';

        if (query === '')
        {
            return refuse('query is required');
        }

        // Scoped to this one person's thread. An agent searching across a
        // team's whole inbox would be a very different capability.
        const matches = await fastify.db.getRepository(TelegramMessage)
            .createQueryBuilder('message')
            .where('message.user_id = :userId', { userId: user.id })
            .andWhere('message.text ILIKE :query', { query: `%${ query }%` })
            .orderBy('message.id', 'DESC')
            .take(SEARCH_LIMIT)
            .getMany();

        return {
            ok: true,
            content: JSON.stringify({
                matches: matches.map((message) => ({
                    direction: message.direction,
                    text: message.text,
                    sent_at: message.sent_at
                }))
            })
        };
    }

    if (tool.name === 'team_members')
    {
        const query = typeof args['query'] === 'string' ? args['query'].trim() : '';

        // Scoped to the agent's own team, always. The roster is the one place
        // an agent looks past the person in front of it, so the tenancy line is
        // drawn here rather than trusted from anything the model passed in.
        const builder = fastify.db.getRepository(TelegramUser)
            .createQueryBuilder('member')
            .where('member.team_id = :teamId', { teamId: agent.team_id });

        if (query !== '')
        {
            builder.andWhere('(member.first_name ILIKE :q OR member.last_name ILIKE :q OR member.username ILIKE :q)', { q: `%${ query }%` });
        }

        const total = await builder.getCount();
        const members = await builder.orderBy('member.last_seen_at', 'DESC').take(ROSTER_LIMIT).getMany();

        return {
            ok: true,
            content: JSON.stringify({
                total,
                shown: members.length,
                // No permission keys here on purpose: what a person is allowed
                // to do is the owner's business, and an agent that could read
                // the access list is one step from reasoning about changing it.
                members: members.map((member) => ({
                    member_id: member.id,
                    first_name: member.first_name,
                    last_name: member.last_name,
                    username: member.username,
                    message_count: member.message_count,
                    last_seen_at: member.last_seen_at,
                    // So the agent does not describe the person it is talking
                    // to as though they were someone else on the list.
                    is_you: member.id === user.id
                }))
            })
        };
    }

    if (tool.name === 'team_member_read' || tool.name === 'team_member_note')
    {
        const memberId = Number(args['member_id']);

        if (!Number.isInteger(memberId) || memberId <= 0)
        {
            return refuse('member_id is required; get it from team_members');
        }

        // Matched on the agent's team as well as the id, so an id belonging to
        // another team reads as "no such member" rather than crossing over.
        const member = await fastify.db.getRepository(TelegramUser).findOneBy({ id: memberId, team_id: agent.team_id });

        if (!member)
        {
            return refuse('no such member of this team');
        }

        const raw = typeof args['name'] === 'string' ? args['name'].trim() : '';
        const noteName = raw === '' ? 'preferences.md' : raw;

        if (!DOCUMENT_NAME_PATTERN.test(noteName))
        {
            return refuse('name must be a plain markdown filename, e.g. preferences.md');
        }

        const documents = fastify.db.getRepository(TelegramUserDocument);
        const stored = await documents.findOneBy({ user_id: member.id, name: noteName });

        if (tool.name === 'team_member_read')
        {
            return stored
                ? { ok: true, content: JSON.stringify({ member_id: member.id, name: stored.name, content: stored.content }) }
                : refuse('nothing recorded for that member under that name');
        }

        const line = typeof args['content'] === 'string' ? args['content'].trim() : '';

        if (line === '')
        {
            return refuse('content is required');
        }

        // Append only. A tool that could replace the file would let one bad
        // turn erase everything the team had gathered about someone.
        const merged = stored ? `${ stored.content.replace(/\s+$/, '') }\n${ line }\n` : `${ line }\n`;

        if (merged.length > DOCUMENT_CONTENT_MAX)
        {
            return refuse('the notes for that member are full');
        }

        if (stored)
        {
            await documents.update({ id: stored.id }, { content: merged });
        }
        else
        {
            await documents.save({ user_id: member.id, name: noteName, content: merged });
        }

        // A note written about someone who is not in the conversation is the
        // one action here a team owner would want in the trail -- the exchange
        // record shows it only to whoever opens that agent's history. Detail
        // carries the shape, never the note itself.
        await audit(fastify, fastify.log, {
            teamId: agent.team_id,
            action: 'agent.member_note',
            target: `profile:${ member.id }`,
            actor: 'agent',
            detail: `${ agent.name } appended to ${ noteName }, now ${ merged.length } chars` });

        return { ok: true, content: JSON.stringify({ member_id: member.id, name: noteName, chars: merged.length }) };
    }

    const repository = fastify.db.getRepository(TelegramUserDocument);

    if (tool.name === 'profile_get')
    {
        return {
            ok: true,
            content: JSON.stringify({
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                language_code: user.language_code,
                message_count: user.message_count
            })
        };
    }

    if (tool.name === 'preferences_list')
    {
        await ensureSeeded(fastify, user.id);

        const documents = await repository.find({ where: { user_id: user.id }, order: { name: 'ASC' } });

        return { ok: true, content: JSON.stringify({ files: documents.map((document) => ({ name: document.name, chars: document.content.length })) }) };
    }

    const fileName = typeof args['name'] === 'string' ? args['name'].trim() : '';

    if (!DOCUMENT_NAME_PATTERN.test(fileName))
    {
        return refuse('name must be a plain markdown filename, e.g. preferences.md');
    }

    if (tool.name === 'preferences_read')
    {
        await ensureSeeded(fastify, user.id);

        const document = await repository.findOneBy({ user_id: user.id, name: fileName });

        if (!document)
        {
            return refuse('no such file');
        }

        return { ok: true, content: JSON.stringify({ name: document.name, content: document.content }) };
    }

    const body = typeof args['content'] === 'string' ? args['content'] : '';

    if (body.length > DOCUMENT_CONTENT_MAX)
    {
        return refuse(`content exceeds ${ DOCUMENT_CONTENT_MAX } characters`);
    }

    const existing = await repository.findOneBy({ user_id: user.id, name: fileName });

    if (tool.name === 'preferences_append')
    {
        const merged = existing ? `${ existing.content.replace(/\s+$/, '') }\n${ body }\n` : `${ body }\n`;

        if (merged.length > DOCUMENT_CONTENT_MAX)
        {
            return refuse('file would exceed its size limit');
        }

        if (existing)
        {
            await repository.update({ id: existing.id }, { content: merged });
        }
        else
        {
            await repository.save({ user_id: user.id, name: fileName, content: merged });
        }

        return { ok: true, content: JSON.stringify({ name: fileName, chars: merged.length }) };
    }

    // preferences_write
    if (existing)
    {
        await repository.update({ id: existing.id }, { content: body });
    }
    else
    {
        await repository.save({ user_id: user.id, name: fileName, content: body });
    }

    return { ok: true, content: JSON.stringify({ name: fileName, chars: body.length }) };
}
