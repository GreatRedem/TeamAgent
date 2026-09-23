import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { In } from 'typeorm';
import {
    DAY,
    PLUGIN_CALL_PAGE,
    PLUGIN_EVENTS,
    PLUGIN_KINDS,
    PLUGIN_STATUS,
    PLUGIN_TOOLS,
    WEEK,
} from '../../constant.js';

import { authGuard } from '../../plugins/authentication.js';
import { BadRequestResponse } from '../../utils/response.js';
import { TeamAgent } from '../agent/agent.entity.js';
import { audit, changed } from '../audit/audit.log.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { type PluginBody, PluginError, readPluginBody } from './plugin.body.js';
import { type PluginKind, settingsOf } from './plugin.common.js';
import { TeamPlugin, TeamPluginCall } from './plugin.entity.js';
import {
    schemaPluginCalls,
    schemaPluginCatalog,
    schemaPluginList,
    schemaPluginResult,
    schemaPluginSave,
    schemaPluginTest,
} from './plugin.schema.js';
import { pluginAgents, pluginEvents, probePlugin, recordCall } from './plugin.tools.js';

interface PluginStats {
    requests: number;
    failures: number;
    inbound: number;
    replies: number;
    day: number;
    week: number;
    average_ms: number;
    last_at: string | null;
}

function hint(secret: string): string {
    return secret.length > 12 ? `${secret.slice(0, 3)}…${secret.slice(-4)}` : '••••';
}

function kindOf(key: string): PluginKind {
    const kind = PLUGIN_KINDS.find((candidate) => candidate.key === key);

    if (!kind) {
        throw new BadRequestResponse('PLUGIN_KIND_INVALID');
    }

    return kind;
}

async function findOwnedPlugin(
    fastify: FastifyInstance,
    request: FastifyRequest,
): Promise<TeamPlugin> {
    const teamId = readTeamId(request);

    await findOwnedTeam(fastify, teamId, request.account_id);

    const plugin = await fastify.db.getRepository(TeamPlugin).findOneBy({
        id: readParamId(request, 'pluginId', 'PLUGIN_ID_INVALID'),
        team_id: teamId,
    });

    if (!plugin) {
        throw new BadRequestResponse('PLUGIN_NOT_FOUND');
    }

    return plugin;
}

async function pluginStats(
    fastify: FastifyInstance,
    ids: number[],
): Promise<Map<number, PluginStats>> {
    if (ids.length === 0) {
        return new Map();
    }

    const rows = await fastify.db
        .getRepository(TeamPluginCall)
        .createQueryBuilder('c')
        .select('c.plugin_id', 'plugin_id')
        .addSelect("COUNT(*) FILTER (WHERE c.direction <> 'in')", 'requests')
        .addSelect("COUNT(*) FILTER (WHERE c.direction <> 'in' AND NOT c.ok)", 'failures')
        .addSelect("COUNT(*) FILTER (WHERE c.direction = 'in')", 'inbound')
        .addSelect("COUNT(*) FILTER (WHERE c.direction = 'reply' AND c.ok)", 'replies')
        .addSelect(`COUNT(*) FILTER (WHERE c.direction <> 'in' AND c.created_at > ${DAY})`, 'day')
        .addSelect(`COUNT(*) FILTER (WHERE c.direction <> 'in' AND c.created_at > ${WEEK})`, 'week')
        .addSelect(
            "COALESCE(AVG(c.duration_ms) FILTER (WHERE c.direction <> 'in' AND c.ok), 0)",
            'average_ms',
        )
        .addSelect('MAX(c.created_at)', 'last_at')
        .where('c.plugin_id IN (:...ids)', { ids })
        .groupBy('c.plugin_id')
        .getRawMany<Record<string, string | Date | null>>();

    return new Map(
        rows.map((row) => [
            Number(row['plugin_id']),
            {
                requests: Number(row['requests']),
                failures: Number(row['failures']),
                inbound: Number(row['inbound']),
                replies: Number(row['replies']),
                day: Number(row['day']),
                week: Number(row['week']),
                average_ms: Math.round(Number(row['average_ms'])),
                last_at: row['last_at'] ? new Date(row['last_at']).toISOString() : null,
            },
        ]),
    );
}

async function pluginViews(fastify: FastifyInstance, plugins: TeamPlugin[]) {
    const stats = await pluginStats(
        fastify,
        plugins.map((plugin) => plugin.id),
    );

    return plugins.map((plugin) => {
        const { secrets, config } = settingsOf(plugin);
        const status = PLUGIN_STATUS.get(plugin.id);

        return {
            id: plugin.id,
            kind: plugin.kind,
            name: plugin.name,
            enabled: plugin.enabled,
            config,
            secrets: Object.fromEntries(
                Object.entries(secrets).map(([key, value]) => [key, hint(value)]),
            ),
            agents: pluginAgents(plugin),
            hook_agent_id: plugin.hook_agent_id,
            hook_url: plugin.hook_url,
            hook_events: pluginEvents(plugin),
            hook_secret: plugin.hook_secret,
            hook_path:
                PLUGIN_KINDS.find((kind) => kind.key === plugin.kind)?.inbound === 'webhook'
                    ? `/plugin/${plugin.id}/hook`
                    : '',
            account: plugin.account,
            listening: status?.listening ?? false,
            listen_error: status?.error ?? '',
            stats: stats.get(plugin.id) ?? {
                requests: 0,
                failures: 0,
                inbound: 0,
                replies: 0,
                day: 0,
                week: 0,
                average_ms: 0,
                last_at: null,
            },
            created_at: plugin.created_at.toISOString(),
        };
    });
}

async function checkedBody(
    fastify: FastifyInstance,
    request: FastifyRequest,
    teamId: number,
    kind: PluginKind,
    stored: TeamPlugin | null,
): Promise<PluginBody> {
    let body: PluginBody;

    try {
        body = readPluginBody(request.body, kind, stored ? settingsOf(stored) : null);
    } catch (cause) {
        throw new BadRequestResponse(cause instanceof PluginError ? cause.code : 'PLUGIN_INVALID');
    }

    const agents = await fastify.db
        .getRepository(TeamAgent)
        .find({ where: { team_id: teamId }, select: { id: true } });
    const known = new Set(agents.map((agent) => agent.id));

    if (body.hook_agent_id !== 0 && !known.has(body.hook_agent_id)) {
        throw new BadRequestResponse('PLUGIN_AGENT_NOT_FOUND');
    }

    const taken = await fastify.db.getRepository(TeamPlugin).findOneBy({
        team_id: teamId,
        name: body.name,
    });

    if (taken && taken.id !== stored?.id) {
        throw new BadRequestResponse('PLUGIN_NAME_TAKEN');
    }

    return { ...body, agents: body.agents.filter((id) => known.has(id)) };
}

function columns(body: PluginBody) {
    return {
        name: body.name,
        enabled: body.enabled,
        secrets: JSON.stringify(body.secrets),
        config: JSON.stringify(body.config),
        agents: body.agents.join(','),
        hook_agent_id: body.hook_agent_id,
        hook_url: body.hook_url,
        hook_events: body.hook_events.join(','),
    };
}

async function probeAndRecord(
    fastify: FastifyInstance,
    request: FastifyRequest,
    plugin: TeamPlugin,
) {
    const startedAt = Date.now();
    const probe = await probePlugin(plugin);

    await recordCall(fastify, request.log, plugin, {
        direction: 'test',
        action: 'test',
        outcome: probe,
        durationMs: Date.now() - startedAt,
    });

    if (probe.ok && typeof probe.data === 'string') {
        plugin.account = probe.data.slice(0, 128);

        await fastify.db
            .getRepository(TeamPlugin)
            .update({ id: plugin.id }, { account: plugin.account });
    }

    return probe;
}

export function pluginCatalog(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({
            events: PLUGIN_EVENTS,
            kinds: PLUGIN_KINDS.map((kind) => ({
                ...kind,
                tools: PLUGIN_TOOLS.filter((tool) => tool.permission === `plugin:${kind.key}`).map(
                    (tool) => ({ name: tool.name, description: tool.description }),
                ),
            })),
        });
    };

    return { schema: schemaPluginCatalog(), config: { ...authGuard() }, handler };
}

export function pluginList(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const plugins = await fastify.db
            .getRepository(TeamPlugin)
            .find({ where: { team_id: teamId }, order: { id: 'ASC' } });

        reply.send({ plugins: await pluginViews(fastify, plugins) });
    };

    return { schema: schemaPluginList(), config: { ...authGuard() }, handler };
}

export function pluginCreate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const kind = kindOf(String((request.body as { kind?: unknown } | undefined)?.kind ?? ''));
        const body = await checkedBody(fastify, request, teamId, kind, null);

        const saved = await fastify.db.getRepository(TeamPlugin).save({
            team_id: teamId,
            kind: kind.key,
            hook_secret: randomBytes(24).toString('hex'),
            ...columns(body),
        });

        await probeAndRecord(fastify, request, saved);

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'plugin.create',
            target: `plugin:${saved.id}`,
            detail: `${kind.label} · ${saved.name} · ${body.agents.length} agent(s)`,
            changes: { kind: kind.key, ...columns(body), account: saved.account },
        });

        const [view] = await pluginViews(fastify, [saved]);

        reply.send(view);
    };

    return { schema: schemaPluginSave(), config: { ...authGuard() }, handler };
}

export function pluginUpdate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const plugin = await findOwnedPlugin(fastify, request);
        const body = await checkedBody(
            fastify,
            request,
            plugin.team_id,
            kindOf(plugin.kind),
            plugin,
        );
        const next = columns(body);
        const diff = changed(plugin, next);

        await fastify.db.getRepository(TeamPlugin).update({ id: plugin.id }, next);

        const saved = { ...plugin, ...next } as TeamPlugin;

        if (next.secrets !== plugin.secrets || next.config !== plugin.config) {
            await probeAndRecord(fastify, request, saved);
        }

        await audit(fastify, request.log, {
            teamId: plugin.team_id,
            accountId: request.account_id,
            action: 'plugin.update',
            target: `plugin:${plugin.id}`,
            detail: `${saved.name} · changed ${Object.keys(diff).join(', ') || 'nothing'}`,
            changes: diff,
        });

        const [view] = await pluginViews(fastify, [saved]);

        reply.send(view);
    };

    return { schema: schemaPluginSave(), config: { ...authGuard() }, handler };
}

export function pluginRemove(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const plugin = await findOwnedPlugin(fastify, request);

        const calls = await fastify.db
            .getRepository(TeamPluginCall)
            .delete({ plugin_id: plugin.id });
        await fastify.db.getRepository(TeamPlugin).delete({ id: plugin.id });

        PLUGIN_STATUS.delete(plugin.id);

        await audit(fastify, request.log, {
            teamId: plugin.team_id,
            accountId: request.account_id,
            action: 'plugin.remove',
            target: `plugin:${plugin.id}`,
            detail: `${plugin.kind} · ${plugin.name} · ${calls.affected ?? 0} request records removed`,
            changes: { plugin, requests_removed: calls.affected ?? 0 },
        });

        reply.send({ result: 'removed' });
    };

    return { schema: schemaPluginResult(), config: { ...authGuard() }, handler };
}

export function pluginTest(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const plugin = await findOwnedPlugin(fastify, request);
        const account = plugin.account;
        const probe = await probeAndRecord(fastify, request, plugin);
        const [view] = await pluginViews(fastify, [plugin]);

        await audit(fastify, request.log, {
            teamId: plugin.team_id,
            accountId: request.account_id,
            action: 'plugin.test',
            target: `plugin:${plugin.id}`,
            outcome: probe.ok ? 'ok' : 'error',
            detail: `${plugin.name} · ${probe.ok ? `works as ${plugin.account}` : (probe.error ?? 'failed')}`,
            changes: {
                status: probe.status,
                error: probe.error,
                ...(account !== plugin.account && {
                    account: { from: account, to: plugin.account },
                }),
            },
        });

        reply.send({
            ok: probe.ok,
            error: probe.error ?? '',
            plugin: view,
        });
    };

    return { schema: schemaPluginTest(), config: { ...authGuard() }, handler };
}

export function pluginCalls(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const plugin = await findOwnedPlugin(fastify, request);
        const { limit, offset } = readPage(request, PLUGIN_CALL_PAGE);
        const calls = fastify.db.getRepository(TeamPluginCall);

        const [[rows, total], actions] = await Promise.all([
            calls.findAndCount({
                where: { plugin_id: plugin.id },
                order: { id: 'DESC' },
                skip: offset,
                take: limit + 1,
            }),
            calls
                .createQueryBuilder('c')
                .select('c.direction', 'direction')
                .addSelect('c.action', 'action')
                .addSelect('COUNT(*)', 'count')
                .addSelect('COUNT(*) FILTER (WHERE NOT c.ok)', 'failures')
                .addSelect('COALESCE(AVG(c.duration_ms) FILTER (WHERE c.ok), 0)', 'average_ms')
                .addSelect('MAX(c.created_at)', 'last_at')
                .where('c.plugin_id = :pluginId', { pluginId: plugin.id })
                .groupBy('c.direction')
                .addGroupBy('c.action')
                .orderBy('COUNT(*)', 'DESC')
                .getRawMany<Record<string, string | Date>>(),
        ]);

        const { items, has_more } = takePage(rows, limit);

        const agentIds = [...new Set(items.map((call) => call.agent_id).filter((id) => id > 0))];
        const agents = new Map(
            (agentIds.length === 0
                ? []
                : await fastify.db
                      .getRepository(TeamAgent)
                      .find({ where: { id: In(agentIds) }, select: { id: true, name: true } })
            ).map((agent) => [agent.id, agent.name]),
        );

        reply.send({
            limit,
            offset,
            has_more,
            total,
            actions: actions.map((row) => ({
                direction: String(row['direction']),
                action: String(row['action']),
                count: Number(row['count']),
                failures: Number(row['failures']),
                average_ms: Math.round(Number(row['average_ms'])),
                last_at: new Date(row['last_at'] as string).toISOString(),
            })),
            calls: items.map((call) => ({
                id: call.id,
                direction: call.direction,
                action: call.action,
                ok: call.ok,
                status: call.status,
                duration_ms: call.duration_ms,
                agent_id: call.agent_id,
                agent_name: agents.get(call.agent_id) ?? '',
                thread: call.thread,
                request: call.request,
                response: call.response,
                error: call.error,
                created_at: call.created_at.toISOString(),
            })),
        });
    };

    return { schema: schemaPluginCalls(), config: { ...authGuard() }, handler };
}
