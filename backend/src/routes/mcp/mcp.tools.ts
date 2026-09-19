import type { FastifyInstance } from 'fastify';

import { TelegramUser, TelegramUserDocument } from '../telegram/telegram.entity.js';
import { hasPermission } from '../telegram/telegram.permission.js';

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
 * Every tool names the permission it needs. There is deliberately **no tool
 * that touches permissions themselves**: an agent that could grant its own
 * access would make the whole permission model decorative, so that stays an
 * owner-only action through the HTTP API.
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
    }
];

/** The tools a given profile's permissions actually allow. */
export function allowedTools(permissions: string): ToolDefinition[]
{
    return TOOLS.filter((tool) => hasPermission(permissions, tool.permission));
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
export async function runTool(fastify: FastifyInstance, user: TelegramUser, name: string, args: Record<string, unknown>): Promise<ToolResult>
{
    const tool = TOOLS.find((candidate) => candidate.name === name);

    if (!tool)
    {
        return refuse('unknown tool');
    }

    if (!hasPermission(user.permissions, tool.permission))
    {
        return refuse(`not permitted: this person has not granted ${ tool.permission }`);
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
