import type { FastifyInstance } from 'fastify';
import {
    DOCUMENT_NAME_PATTERN,
    FETCH_TEXT_MAX,
    MCP_DOCUMENT_CONTENT_MAX,
    PREFERENCES_TEMPLATE,
    ROSTER_FILE,
    ROSTER_LIMIT,
    SEARCH_LIMIT,
    TOOLS,
} from '../../constant.js';

import { TeamAgent, TeamAgentDocument } from '../agent/agent.entity.js';
import { agentHasPermission, parseAgentPermissions } from '../agent/agent.permission.js';
import { audit } from '../audit/audit.log.js';
import { isPluginTool, pluginTools, runPluginTool } from '../plugin/plugin.tools.js';
import { TeamDocument } from '../team/team.entity.js';
import {
    findMember,
    parseRoster,
    type Roster,
    RosterError,
    removeMember,
    replaceMember,
    serializeRoster,
} from '../team/team.roster.js';
import {
    TelegramMessage,
    TelegramUser,
    TelegramUserDocument,
} from '../telegram/telegram.entity.js';
import { hasPermission } from '../telegram/telegram.permission.js';
import { searchWeb } from './mcp.search.js';
import { weatherFor } from './mcp.weather.js';
import { fetchPublicUrl } from './mcp.web.js';

export interface ToolDefinition {
    name: string;
    description: string;
    permission: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, { type: string; description: string; items?: { type: string } }>;
        required: string[];
    };
}

function readOffset(args: Record<string, unknown>): number {
    const offset = Number(args['offset'] ?? 0);

    return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

export function allowedTools(agentPermissions: string): ToolDefinition[] {
    return TOOLS.filter((tool) => agentHasPermission(agentPermissions, tool.permission));
}

export function withCallable(
    tools: ToolDefinition[],
    others: { name: string; description: string; permissions: string }[],
): ToolDefinition[] {
    if (others.length === 0) {
        return tools.filter((tool) => tool.name !== 'agent_call');
    }

    const listed = others
        .map((other) => {
            const may = parseAgentPermissions(other.permissions).filter((key) => key !== 'basics');

            return [
                `"${other.name}"`,
                other.description === '' ? '' : `: ${other.description}`,
                may.length === 0 ? '' : ` (may: ${may.join(', ')})`,
            ].join('');
        })
        .join('; ');

    return tools.map((tool) =>
        tool.name === 'agent_call'
            ? { ...tool, description: `${tool.description} Agents you can ask: ${listed}.` }
            : tool,
    );
}

export async function agentTools(
    fastify: FastifyInstance,
    agent: TeamAgent,
    person: TelegramUser,
): Promise<ToolDefinition[]> {
    const tools = [...allowedTools(agent.permissions), ...(await pluginTools(fastify, agent))];

    if (!tools.some((tool) => tool.name === 'agent_call')) {
        return tools;
    }

    const others = hasPermission(person.permissions, 'delegate')
        ? (
              await fastify.db
                  .getRepository(TeamAgent)
                  .find({ where: { team_id: agent.team_id }, order: { id: 'ASC' } })
          ).filter((other) => other.id !== agent.id && other.model_id !== 0)
        : [];

    return withCallable(tools, others);
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

async function ensureSeeded(
    fastify: FastifyInstance,
    userId: number,
    agentId: number,
): Promise<void> {
    const repository = fastify.db.getRepository(TelegramUserDocument);

    if ((await repository.countBy({ user_id: userId, agent_id: agentId })) > 0) {
        return;
    }

    await repository.save({
        user_id: userId,
        agent_id: agentId,
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
    if (isPluginTool(name)) {
        return runPluginTool(fastify, agent, name, args);
    }

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

    if (
        tool.name === 'roster_member_create' ||
        tool.name === 'roster_member_update' ||
        tool.name === 'roster_member_delete'
    ) {
        const name = typeof args['name'] === 'string' ? args['name'].trim() : '';

        if (name === '') {
            return refuse('name is required');
        }

        const fields = {
            ...(typeof args['rank'] === 'string' && { rank: args['rank'] }),
            ...(typeof args['description'] === 'string' && { description: args['description'] }),
            ...(typeof args['social'] === 'object' &&
                args['social'] !== null &&
                !Array.isArray(args['social']) && {
                    social: args['social'] as Record<string, string>,
                }),
        };

        let next: Roster;
        let outcome: string;

        try {
            const roster = parseRoster(await readRosterContent(fastify, agent.team_id));
            const stored = findMember(roster, name);

            if (tool.name === 'roster_member_delete') {
                const removed = removeMember(roster, name);

                if (!removed.removed) {
                    return refuse(`no member named ${name}`);
                }

                next = removed.roster;
                outcome = 'removed';
            } else if (tool.name === 'roster_member_create') {
                if (stored) {
                    return refuse(
                        `${stored.name} is already on the team; use roster_member_update to change them`,
                    );
                }

                next = replaceMember(roster, undefined, { name, ...fields });
                outcome = 'added';
            } else {
                if (!stored) {
                    return refuse(
                        `no member named ${name}; use roster_member_create to add someone`,
                    );
                }

                const renamed = typeof args['new_name'] === 'string' ? args['new_name'].trim() : '';

                next = replaceMember(roster, stored.name, {
                    ...stored,
                    ...fields,
                    name: renamed === '' ? stored.name : renamed,
                    ...(fields.social && { social: { ...stored.social, ...fields.social } }),
                });
                outcome = 'updated';
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

    if (tool.name === 'web_search') {
        const query = typeof args['query'] === 'string' ? args['query'].trim() : '';

        if (query === '') {
            return refuse('query is required');
        }

        const found = await searchWeb(query, args['topic'] === 'news' ? 'news' : 'general');

        return found.ok
            ? {
                  ok: true,
                  content: JSON.stringify({ query, source: found.source, results: found.results }),
              }
            : refuse(found.reason ?? 'search failed');
    }

    if (tool.name === 'weather') {
        const place = typeof args['place'] === 'string' ? args['place'].trim() : '';

        if (place === '') {
            return refuse('place is required');
        }

        const days = typeof args['days'] === 'number' ? args['days'] : 3;
        const report = await weatherFor(place, days);

        return report.ok
            ? { ok: true, content: JSON.stringify(report.report) }
            : refuse(report.reason ?? 'weather failed');
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
                text_limit: FETCH_TEXT_MAX,
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
        const stored = await documents.findOneBy({
            user_id: member.id,
            agent_id: agent.id,
            name: noteName,
        });

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

        if (merged.length > MCP_DOCUMENT_CONTENT_MAX) {
            return refuse('the notes for that member are full');
        }

        if (stored) {
            await documents.update({ id: stored.id }, { content: merged });
        } else {
            await documents.save({
                user_id: member.id,
                agent_id: agent.id,
                name: noteName,
                content: merged,
            });
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
        await ensureSeeded(fastify, user.id, agent.id);

        const documents = await repository.find({
            where: { user_id: user.id, agent_id: agent.id },
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
        await ensureSeeded(fastify, user.id, agent.id);

        const document = await repository.findOneBy({
            user_id: user.id,
            agent_id: agent.id,
            name: fileName,
        });

        if (!document) {
            return refuse('no such file');
        }

        return {
            ok: true,
            content: JSON.stringify({ name: document.name, content: document.content }),
        };
    }

    const body = typeof args['content'] === 'string' ? args['content'] : '';

    if (body.length > MCP_DOCUMENT_CONTENT_MAX) {
        return refuse(`content exceeds ${MCP_DOCUMENT_CONTENT_MAX} characters`);
    }

    const existing = await repository.findOneBy({
        user_id: user.id,
        agent_id: agent.id,
        name: fileName,
    });

    if (tool.name === 'preferences_append') {
        const merged = existing
            ? `${existing.content.replace(/\s+$/, '')}\n${body}\n`
            : `${body}\n`;

        if (merged.length > MCP_DOCUMENT_CONTENT_MAX) {
            return refuse('file would exceed its size limit');
        }

        if (existing) {
            await repository.update({ id: existing.id }, { content: merged });
        } else {
            await repository.save({
                user_id: user.id,
                agent_id: agent.id,
                name: fileName,
                content: merged,
            });
        }

        return { ok: true, content: JSON.stringify({ name: fileName, chars: merged.length }) };
    }

    if (existing) {
        await repository.update({ id: existing.id }, { content: body });
    } else {
        await repository.save({
            user_id: user.id,
            agent_id: agent.id,
            name: fileName,
            content: body,
        });
    }

    return { ok: true, content: JSON.stringify({ name: fileName, chars: body.length }) };
}
