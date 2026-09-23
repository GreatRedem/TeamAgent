import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { In } from 'typeorm';
import { PERSONAL_TOOLS, PLUGIN_HISTORY, PLUGIN_KINDS, ROSTER_FILE } from '../../constant.js';

import { TeamAgent, TeamAgentDocument } from '../agent/agent.entity.js';
import { agentHasPermission } from '../agent/agent.permission.js';
import { buildMessages, buildSystemPrompt, toolGuidance } from '../agent/agent.reply.js';
import { audit } from '../audit/audit.log.js';
import { agentTools } from '../mcp/mcp.tools.js';
import { TeamDocument, TeamModel } from '../team/team.entity.js';
import { rosterPrompt } from '../team/team.roster.js';
import { placeholderUser, runAgent } from '../telegram/telegram.service.js';
import { failed, type InboundEvent, type PluginOutcome } from './plugin.common.js';
import { type TeamPlugin, TeamPluginCall } from './plugin.entity.js';
import { forwardEvent, recordCall } from './plugin.tools.js';

export interface InboundResult {
    answered: boolean;
    text: string;
    error: string;
}

export async function receiveInbound(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    plugin: TeamPlugin,
    event: InboundEvent,
    reply: (text: string) => Promise<PluginOutcome>,
): Promise<InboundResult> {
    const calls = fastify.db.getRepository(TeamPluginCall);

    await recordCall(fastify, log, plugin, {
        direction: 'in',
        action: event.kind,
        outcome: { ok: true, status: 200 },
        durationMs: 0,
        thread: event.thread,
        request: event.text,
        response: JSON.stringify({ author: event.author, where: event.where, ...event.ids }),
    });

    forwardEvent(fastify, log, plugin, 'message.received', { ...event });

    if (plugin.hook_agent_id === 0) {
        return { answered: false, text: '', error: '' };
    }

    const startedAt = Date.now();

    const fail = async (error: string): Promise<InboundResult> => {
        await recordCall(fastify, log, plugin, {
            direction: 'reply',
            action: event.kind,
            outcome: failed(error),
            durationMs: Date.now() - startedAt,
            agentId: plugin.hook_agent_id,
            thread: event.thread,
            request: event.text,
        });

        forwardEvent(fastify, log, plugin, 'agent.failed', { ...event, error });

        return { answered: false, text: '', error };
    };

    const agent = await fastify.db
        .getRepository(TeamAgent)
        .findOneBy({ id: plugin.hook_agent_id, team_id: plugin.team_id });

    if (!agent) {
        return fail('the agent that answers here no longer exists');
    }

    const model = await fastify.db
        .getRepository(TeamModel)
        .findOneBy({ id: agent.model_id, team_id: plugin.team_id });

    if (!model) {
        return fail(`${agent.name} has no model to answer with`);
    }

    const documents = await fastify.db
        .getRepository(TeamAgentDocument)
        .find({ where: { agent_id: agent.id } });

    const tools = (await agentTools(fastify, agent)).filter(
        (tool) => !PERSONAL_TOOLS.includes(tool.name),
    );

    const roster = agentHasPermission(agent.permissions, 'roster.read')
        ? rosterPrompt(
              (
                  await fastify.db
                      .getRepository(TeamDocument)
                      .findOneBy({ team_id: plugin.team_id, name: ROSTER_FILE })
              )?.content ?? '',
          )
        : '';

    const earlier = (
        await calls.find({
            where: {
                plugin_id: plugin.id,
                thread: event.thread,
                direction: In(['in', 'reply']),
                ok: true,
            },
            order: { id: 'DESC' },
            take: PLUGIN_HISTORY + 1,
        })
    )
        .slice(1)
        .reverse()
        .map((call) => ({
            direction: call.direction === 'reply' ? 'out' : 'in',
            text: call.direction === 'reply' ? call.response : call.request,
        }));

    const place = PLUGIN_KINDS.find((kind) => kind.key === plugin.kind)?.label ?? plugin.kind;

    const messages = buildMessages(
        [
            buildSystemPrompt(
                documents,
                tools.some((tool) => tool.name === 'document_read'),
            ),
            roster,
            toolGuidance(tools.map((tool) => tool.name)),
            [
                '# Where you are',
                '',
                `You are answering ${event.author} on ${place}, in ${event.where}. What you write is sent back there as your reply, so write only the reply itself, in the language they wrote in.`,
            ].join('\n'),
        ]
            .filter((section) => section !== '')
            .join('\n\n---\n\n'),
        earlier,
        event.text,
    );

    const run = await runAgent(fastify, log.child({ pluginId: plugin.id }), {
        teamId: plugin.team_id,
        agent,
        model,
        user: placeholderUser(plugin.team_id, new Date()),
        messages,
        tools,
    });

    if (run.unreachable || run.text === undefined || run.text.trim() === '') {
        return fail(
            run.unreachable
                ? 'the model could not be reached'
                : run.failure === ''
                  ? 'the model returned no text'
                  : run.failure,
        );
    }

    const text = run.text.trim();
    const sent = await reply(text);

    await recordCall(fastify, log, plugin, {
        direction: 'reply',
        action: event.kind,
        outcome: sent,
        durationMs: Date.now() - startedAt,
        agentId: agent.id,
        thread: event.thread,
        request: event.text,
        response: text,
    });

    forwardEvent(fastify, log, plugin, sent.ok ? 'agent.replied' : 'agent.failed', {
        ...event,
        agent: { id: agent.id, name: agent.name },
        reply: text,
        ...(!sent.ok && { error: sent.error ?? '' }),
    });

    await audit(fastify, log, {
        teamId: plugin.team_id,
        actor: 'agent',
        action: 'plugin.reply',
        target: `plugin:${plugin.id}`,
        outcome: sent.ok ? 'ok' : 'error',
        durationMs: Date.now() - startedAt,
        detail: `${agent.name} answered ${event.author} on ${plugin.name} · ${run.toolRuns} tool call(s) · ${text.length} chars${sent.ok ? '' : ` · ${sent.error ?? ''}`}`,
    });

    return { answered: sent.ok, text, error: sent.error ?? '' };
}
