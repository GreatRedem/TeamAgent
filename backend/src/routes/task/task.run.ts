import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { DRAFT_INTERVAL, PERSONAL_TOOLS, ROSTER_FILE, TELEGRAM_TEXT_MAX } from '../../constant.js';

import { TeamAgent, TeamAgentDocument } from '../agent/agent.entity.js';
import { agentHasPermission } from '../agent/agent.permission.js';
import { buildSystemPrompt } from '../agent/agent.reply.js';
import { audit } from '../audit/audit.log.js';
import { allowedTools } from '../mcp/mcp.tools.js';
import { TeamBot, TeamDocument, TeamModel } from '../team/team.entity.js';
import { rosterPrompt } from '../team/team.roster.js';
import { TelegramMessage, TelegramUser } from '../telegram/telegram.entity.js';
import { runAgent, telegramText } from '../telegram/telegram.service.js';
import { TeamTask, TeamTaskRun } from './task.entity.js';
import { nextStart, profileLabel, type TaskRepeat, taskMessages } from './task.plan.js';

export async function runTask(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    taskId: number,
): Promise<boolean> {
    const tasks = fastify.db.getRepository(TeamTask);
    const runs = fastify.db.getRepository(TeamTaskRun);

    const claimed = await tasks.update({ id: taskId, status: 'scheduled' }, { status: 'running' });

    if (claimed.affected !== 1) {
        return false;
    }

    const task = (await tasks.findOneBy({ id: taskId })) as TeamTask;
    const startedAt = new Date();
    const run = await runs.save({
        task_id: task.id,
        team_id: task.team_id,
        started_at: startedAt,
        outcome: 'running',
    });

    log.info({ module: 'task', taskId: task.id, runId: run.id }, 'task run started');

    const events: Record<string, unknown>[] = [];
    const spent = { model: '', prompt_tokens: 0, completion_tokens: 0, tool_calls: 0 };
    let written: Promise<unknown> = Promise.resolve();

    const write = (fields: Parameters<typeof runs.update>[1]) => {
        written = written.then(() => runs.update({ id: run.id }, fields)).catch(() => undefined);
    };

    const note = (event: Record<string, unknown>) => {
        events.push({ at: new Date().toISOString(), ...event });
        write({ log: JSON.stringify(events), ...spent });
    };

    const finish = async (
        outcome: 'ok' | 'error',
        output: string,
        delivered: boolean,
        reason: string,
    ) => {
        const now = new Date();
        const next = nextStart(task.start_at, task.repeat as TaskRepeat, now);

        events.push({ at: now.toISOString(), kind: 'end', outcome, delivered, reason });

        await written;

        await runs.update(
            { id: run.id },
            {
                finished_at: now,
                outcome,
                output,
                delivered,
                reason: reason.slice(0, 240),
                log: JSON.stringify(events),
                ...spent,
            },
        );

        log.info(
            {
                module: 'task',
                taskId: task.id,
                runId: run.id,
                outcome,
                delivered,
                durationMs: now.getTime() - startedAt.getTime(),
                ...spent,
            },
            'task run finished',
        );

        await tasks.update(
            { id: task.id },
            {
                last_run_at: startedAt,
                run_count: task.run_count + 1,
                ...(next === null
                    ? { status: outcome === 'ok' ? 'done' : 'failed' }
                    : { status: 'scheduled', start_at: next }),
            },
        );

        await audit(fastify, log, {
            teamId: task.team_id,
            actor: 'agent',
            action: 'task.run',
            target: `task:${task.id}`,
            outcome: outcome === 'ok' ? 'ok' : 'error',
            durationMs: now.getTime() - startedAt.getTime(),
            detail: `${task.title} · agent ${task.agent_id}${delivered ? ' · sent' : ''}${reason === '' ? '' : ` · ${reason}`}`,
        });
    };

    try {
        const agent = await fastify.db
            .getRepository(TeamAgent)
            .findOneBy({ id: task.agent_id, team_id: task.team_id });

        if (!agent) {
            await finish('error', '', false, 'its agent no longer exists');

            return true;
        }

        const model = await fastify.db
            .getRepository(TeamModel)
            .findOneBy({ id: agent.model_id, team_id: task.team_id });

        if (!model) {
            await finish('error', '', false, `${agent.name} has no model to answer with`);

            return true;
        }

        note({ kind: 'start', agent: agent.name, model: model.name });

        const recipient =
            task.profile_id === 0
                ? null
                : await fastify.db
                      .getRepository(TelegramUser)
                      .findOneBy({ id: task.profile_id, team_id: task.team_id });

        if (recipient) {
            note({ kind: 'recipient', name: profileLabel(recipient) });
        }

        if (task.profile_id !== 0 && !recipient) {
            await finish('error', '', false, 'the person it was for is no longer in this project');

            return true;
        }

        const documents = await fastify.db
            .getRepository(TeamAgentDocument)
            .find({ where: { agent_id: agent.id } });

        const allowed = allowedTools(agent.permissions);
        const tools = recipient
            ? allowed
            : allowed.filter((tool) => !PERSONAL_TOOLS.includes(tool.name));

        const roster = agentHasPermission(agent.permissions, 'roster.read')
            ? rosterPrompt(
                  (
                      await fastify.db
                          .getRepository(TeamDocument)
                          .findOneBy({ team_id: task.team_id, name: ROSTER_FILE })
                  )?.content ?? '',
              )
            : '';

        const instructions = [
            buildSystemPrompt(
                documents,
                tools.some((tool) => tool.name === 'document_read'),
            ),
            roster,
        ]
            .filter((part) => part !== '')
            .join('\n\n---\n\n');

        const person =
            recipient ??
            Object.assign(new TelegramUser(), {
                id: 0,
                team_id: task.team_id,
                telegram_id: '0',
                username: '',
                first_name: '',
                last_name: '',
                language_code: '',
                message_count: 0,
                permissions: '',
                last_seen_at: startedAt,
                created_at: startedAt,
            });

        let draftAt = 0;

        const result = await runAgent(fastify, log.child({ taskId: task.id }), {
            teamId: task.team_id,
            agent,
            model,
            user: person,
            messages: taskMessages(
                instructions,
                task,
                recipient ? profileLabel(recipient) : '',
                startedAt,
            ),
            tools,
            trace: (event) => {
                if (event.kind === 'model') {
                    spent.model = event.model;
                    spent.prompt_tokens += event.prompt_tokens;
                    spent.completion_tokens += event.completion_tokens;
                } else {
                    spent.tool_calls += 1;
                }

                note(event);
            },
            onText: (partial) => {
                if (Date.now() - draftAt >= DRAFT_INTERVAL) {
                    draftAt = Date.now();
                    write({ output: partial });
                }
            },
        });

        if (result.unreachable || result.text === undefined) {
            await finish(
                'error',
                '',
                false,
                result.unreachable
                    ? 'the model could not be reached'
                    : result.failure === ''
                      ? 'the model returned no text'
                      : result.failure,
            );

            return true;
        }

        const text = result.text;

        if (!recipient) {
            await finish('ok', text, false, '');

            return true;
        }

        const last = await fastify.db.getRepository(TelegramMessage).findOne({
            where: { team_id: task.team_id, user_id: recipient.id, direction: 'in' },
            order: { id: 'DESC' },
        });
        const bot = last
            ? await fastify.db
                  .getRepository(TeamBot)
                  .findOneBy({ id: last.bot_id, team_id: task.team_id })
            : null;

        if (!last || !bot) {
            note({ kind: 'send', ok: false, to: profileLabel(recipient), bot: '' });

            await finish(
                'error',
                text,
                false,
                'done, but not sent: this person has not written to any bot of this project',
            );

            return true;
        }

        const sent = await telegramText(
            bot.token,
            'sendMessage',
            { chat_id: last.chat_id },
            text.slice(0, TELEGRAM_TEXT_MAX),
        );

        note({ kind: 'send', ok: sent.ok, to: profileLabel(recipient), bot: bot.name });

        if (!sent.ok) {
            await finish('error', text, false, `done, but Telegram refused it (${sent.status})`);

            return true;
        }

        await fastify.db.getRepository(TelegramMessage).save({
            team_id: task.team_id,
            user_id: recipient.id,
            bot_id: bot.id,
            update_id: String(-Date.now()),
            chat_id: last.chat_id,
            text,
            direction: 'out',
            sent_at: new Date(),
        });

        await finish('ok', text, true, '');
    } catch (cause) {
        log.error({ module: 'task', taskId: task.id, err: cause }, 'task run crashed');

        await finish('error', '', false, 'the run stopped on an unexpected error');
    }

    return true;
}
