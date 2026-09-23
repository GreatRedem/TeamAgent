import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import {
    PLUGIN_ERROR_MAX,
    PLUGIN_EVENTS,
    PLUGIN_KINDS,
    PLUGIN_TEXT_MAX,
    PLUGIN_TOOLS,
} from '../../constant.js';

import type { TeamAgent } from '../agent/agent.entity.js';
import type { ToolDefinition, ToolResult } from '../mcp/mcp.tools.js';
import { browserAct, browserProbe } from './plugin.browser.js';
import { argText, failed, type PluginOutcome, postSigned, settingsOf } from './plugin.common.js';
import { discordAct, discordProbe } from './plugin.discord.js';
import { TeamPlugin, TeamPluginCall } from './plugin.entity.js';
import { instagramAct, instagramProbe } from './plugin.instagram.js';
import { telegramAct, telegramProbe } from './plugin.telegram.js';
import { xAct, xProbe } from './plugin.x.js';

export function pluginAgents(plugin: { agents: string }): number[] {
    return plugin.agents
        .split(',')
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);
}

export function pluginEvents(plugin: { hook_events: string }): string[] {
    return plugin.hook_events.split(',').filter((event) => PLUGIN_EVENTS.includes(event));
}

export function isPluginTool(name: string): boolean {
    return PLUGIN_TOOLS.some((tool) => tool.name === name);
}

export interface CallEntry {
    direction: 'tool' | 'in' | 'reply' | 'out' | 'test';
    action: string;
    outcome: PluginOutcome;
    durationMs: number;
    agentId?: number;
    thread?: string;
    request?: string;
    response?: string;
}

export async function recordCall(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    plugin: TeamPlugin,
    entry: CallEntry,
): Promise<void> {
    try {
        await fastify.db.getRepository(TeamPluginCall).save({
            plugin_id: plugin.id,
            team_id: plugin.team_id,
            agent_id: entry.agentId ?? 0,
            direction: entry.direction,
            action: entry.action.slice(0, 64),
            ok: entry.outcome.ok,
            status: entry.outcome.status,
            duration_ms: Math.max(0, Math.round(entry.durationMs)),
            thread: (entry.thread ?? '').slice(0, 128),
            request: (entry.request ?? '').slice(0, PLUGIN_TEXT_MAX),
            response: (
                entry.response ??
                (entry.outcome.data === undefined ? '' : JSON.stringify(entry.outcome.data))
            ).slice(0, PLUGIN_TEXT_MAX),
            error: (entry.outcome.error ?? '').slice(0, PLUGIN_ERROR_MAX),
        });
    } catch (error) {
        log.error(
            { module: 'plugin', pluginId: plugin.id, err: error },
            'plugin call record failed',
        );
    }
}

export function forwardEvent(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    plugin: TeamPlugin,
    event: string,
    data: Record<string, unknown>,
): void {
    if (plugin.hook_url === '' || !pluginEvents(plugin).includes(event)) {
        return;
    }

    const startedAt = Date.now();

    void postSigned(
        plugin.hook_url,
        {
            event,
            at: new Date().toISOString(),
            plugin: { id: plugin.id, kind: plugin.kind, name: plugin.name },
            data,
        },
        plugin.hook_secret,
    )
        .then((outcome) =>
            recordCall(fastify, log, plugin, {
                direction: 'out',
                action: event,
                outcome,
                durationMs: Date.now() - startedAt,
                request: JSON.stringify(data),
            }),
        )
        .catch((error: unknown) =>
            log.error({ module: 'plugin', pluginId: plugin.id, err: error }, 'hook forward failed'),
        );
}

export function actOn(
    plugin: TeamPlugin,
    name: string,
    args: Record<string, unknown>,
    agent?: { id: number; name: string },
): Promise<PluginOutcome> {
    const settings = settingsOf(plugin);

    if (plugin.kind === 'telegram') {
        return telegramAct(settings, name, args);
    }

    if (plugin.kind === 'discord') {
        return discordAct(settings, name, args);
    }

    if (plugin.kind === 'x') {
        return xAct(settings, name, args);
    }

    if (plugin.kind === 'instagram') {
        return instagramAct(settings, name, args);
    }

    if (plugin.kind === 'browser') {
        return browserAct(settings, name, args);
    }

    if (plugin.kind === 'webhook' && name === 'webhook_send') {
        const data = args['data'];

        return postSigned(
            settings.config['url'] ?? '',
            {
                event: argText(args, 'event') || 'agent.message',
                at: new Date().toISOString(),
                text: argText(args, 'text'),
                data: typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {},
                plugin: { id: plugin.id, name: plugin.name },
                ...(agent && { agent }),
            },
            plugin.hook_secret,
            settings.secrets['authorization'] ?? '',
        );
    }

    return Promise.resolve(failed('this plugin does not do that'));
}

export async function probePlugin(plugin: TeamPlugin): Promise<PluginOutcome> {
    const settings = settingsOf(plugin);

    if (plugin.kind === 'telegram') {
        return telegramProbe(settings);
    }

    if (plugin.kind === 'discord') {
        return discordProbe(settings);
    }

    if (plugin.kind === 'x') {
        return xProbe(settings);
    }

    if (plugin.kind === 'instagram') {
        return instagramProbe(settings);
    }

    if (plugin.kind === 'browser') {
        return browserProbe(settings);
    }

    const ping = await actOn(plugin, 'webhook_send', { event: 'ping', text: 'Test from NuraAI' });

    return ping.ok ? { ...ping, data: new URL(settings.config['url'] ?? '').host } : ping;
}

async function usable(fastify: FastifyInstance, agent: TeamAgent): Promise<TeamPlugin[]> {
    return (
        await fastify.db.getRepository(TeamPlugin).find({
            where: { team_id: agent.team_id, enabled: true },
            order: { id: 'ASC' },
        })
    ).filter((plugin) => pluginAgents(plugin).includes(agent.id));
}

export async function pluginTools(
    fastify: FastifyInstance,
    agent: TeamAgent,
): Promise<ToolDefinition[]> {
    const plugins = await usable(fastify, agent);

    return PLUGIN_KINDS.flatMap((kind) => {
        const mine = plugins.filter((plugin) => plugin.kind === kind.key);

        if (mine.length === 0) {
            return [];
        }

        const connected = mine
            .map((plugin) => {
                const { config } = settingsOf(plugin);
                const target = config['default_chat'] || config['default_channel'] || '';
                const about = [plugin.account, target === '' ? '' : `default ${target}`]
                    .filter((part) => part !== '')
                    .join(', ');

                return about === '' ? `"${plugin.name}"` : `"${plugin.name}" (${about})`;
            })
            .join('; ');

        return PLUGIN_TOOLS.filter((tool) => tool.permission === `plugin:${kind.key}`).map(
            (tool) => ({
                ...tool,
                description: `${tool.description} Connected: ${connected}.`,
                inputSchema:
                    mine.length > 1
                        ? {
                              ...tool.inputSchema,
                              properties: {
                                  ...tool.inputSchema.properties,
                                  plugin: {
                                      type: 'string',
                                      description: `Which one: ${mine.map((plugin) => plugin.name).join(', ')}`,
                                  },
                              },
                              required: [...tool.inputSchema.required, 'plugin'],
                          }
                        : tool.inputSchema,
            }),
        );
    });
}

export async function runPluginTool(
    fastify: FastifyInstance,
    agent: TeamAgent,
    name: string,
    args: Record<string, unknown>,
): Promise<ToolResult> {
    const tool = PLUGIN_TOOLS.find((candidate) => candidate.name === name);
    const refuse = (error: string) => ({ ok: false, content: JSON.stringify({ error }) });

    if (!tool) {
        return refuse('unknown tool');
    }

    const kind = tool.permission.replace('plugin:', '');
    const plugins = (await usable(fastify, agent)).filter((plugin) => plugin.kind === kind);
    const wanted = argText(args, 'plugin').toLowerCase();
    const plugin =
        wanted === ''
            ? plugins.length === 1
                ? plugins[0]
                : undefined
            : plugins.find(
                  (candidate) =>
                      candidate.name.toLowerCase() === wanted || String(candidate.id) === wanted,
              );

    if (plugins.length === 0) {
        return refuse(`no ${kind} plugin is connected for this agent`);
    }

    if (!plugin) {
        return refuse(`say which plugin: ${plugins.map((item) => item.name).join(', ')}`);
    }

    const startedAt = Date.now();
    const outcome = await actOn(plugin, name, args, { id: agent.id, name: agent.name });

    await recordCall(fastify, fastify.log, plugin, {
        direction: 'tool',
        action: name,
        outcome,
        durationMs: Date.now() - startedAt,
        agentId: agent.id,
        request: JSON.stringify(args),
    });

    forwardEvent(fastify, fastify.log, plugin, outcome.ok ? 'agent.action' : 'agent.failed', {
        agent: { id: agent.id, name: agent.name },
        tool: name,
        args,
        ...(outcome.ok ? { result: outcome.data ?? null } : { error: outcome.error ?? '' }),
    });

    return outcome.ok
        ? { ok: true, content: JSON.stringify(outcome.data ?? { done: true }) }
        : {
              ok: false,
              content: JSON.stringify({
                  error: outcome.error ?? 'failed',
                  ...(outcome.status > 0 && { status: outcome.status }),
              }),
          };
}
