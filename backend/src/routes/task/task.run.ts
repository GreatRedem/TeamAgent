import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { In, Not } from 'typeorm';
import {
    DRAFT_INTERVAL,
    TASK_MEMORY,
    TASK_MODEL_REST,
    TASK_RETRY_DELAYS,
    TELEGRAM_TEXT_MAX,
} from '../../constant.js';

import { TeamAgent } from '../agent/agent.entity.js';
import { audit, changed } from '../audit/audit.log.js';
import { agentTools } from '../mcp/mcp.tools.js';
import { isAutoFree, rest } from '../model/model.auto.js';
import { TeamBot, TeamModel } from '../team/team.entity.js';
import { TelegramMessage, TelegramUser } from '../telegram/telegram.entity.js';
import {
    agentInstructions,
    groupTitles,
    placeholderUser,
    runAgent,
    runFailure,
    telegramText,
} from '../telegram/telegram.service.js';
import { TeamTask, TeamTaskRun } from './task.entity.js';
import {
    follows,
    nextStart,
    profileLabel,
    retryAt,
    sendRetryable,
    type TaskBefore,
    type TaskRepeat,
    taskMessages,
} from './task.plan.js';

export async function deliverTask(
    fastify: FastifyInstance,
    task: TeamTask,
    recipient: TelegramUser | null,
    group: string,
    text: string,
    note: (event: Record<string, unknown>) => void,
): Promise<{ delivered: number; failures: string[]; retryable: boolean }> {
    const targets: { botId: number; chatId: string; to: string; userId: number }[] = [];
    const failures: string[] = [];
    let delivered = 0;
    let retryable = false;

    if (task.group_chat_id !== '') {
        targets.push({
            botId: task.group_bot_id,
            chatId: task.group_chat_id,
            to: group,
            userId: 0,
        });
    }

    if (recipient) {
        const last = await fastify.db.getRepository(TelegramMessage).findOne({
            where: {
                team_id: task.team_id,
                user_id: recipient.id,
                direction: 'in',
                chat_id: recipient.telegram_id,
            },
            order: { id: 'DESC' },
        });

        if (last) {
            targets.push({
                botId: last.bot_id,
                chatId: last.chat_id,
                to: profileLabel(recipient),
                userId: recipient.id,
            });
        } else {
            note({ kind: 'send', ok: false, to: profileLabel(recipient), bot: '' });
            failures.push(
                `${profileLabel(recipient)} has never messaged a bot of this project privately, and results only go to them by direct message`,
            );
        }
    }

    for (const target of targets) {
        const bot = await fastify.db
            .getRepository(TeamBot)
            .findOneBy({ id: target.botId, team_id: task.team_id });

        if (!bot || bot.token === '') {
            note({ kind: 'send', ok: false, to: target.to, bot: bot?.name ?? '' });
            failures.push(`the bot for ${target.to} is no longer connected to this project`);
            continue;
        }

        const sent = await telegramText(
            bot.token,
            'sendMessage',
            { chat_id: target.chatId },
            text.slice(0, TELEGRAM_TEXT_MAX),
        );

        note({ kind: 'send', ok: sent.ok, to: target.to, bot: bot.name });

        if (!sent.ok) {
            failures.push(`Telegram refused it for ${target.to} (${sent.status})`);
            retryable ||= sendRetryable(sent.status);
            continue;
        }

        delivered += 1;

        if (target.userId !== 0) {
            await fastify.db.getRepository(TelegramMessage).save({
                team_id: task.team_id,
                user_id: target.userId,
                bot_id: bot.id,
                update_id: String(-Date.now()),
                chat_id: target.chatId,
                text,
                direction: 'out',
                sent_at: new Date(),
            });
        }
    }

    return { delivered, failures, retryable: retryable && delivered === 0 };
}

async function earlierOutputs(
    fastify: FastifyInstance,
    taskId: number,
    runId: number,
): Promise<{ at: string; output: string }[]> {
    const runs = await fastify.db.getRepository(TeamTaskRun).find({
        where: { task_id: taskId, outcome: 'ok', id: Not(runId) },
        order: { id: 'DESC' },
        take: TASK_MEMORY,
        select: { id: true, started_at: true, output: true },
    });

    return runs
        .filter((earlier) => earlier.output.trim() !== '')
        .map((earlier) => ({ at: earlier.started_at.toISOString(), output: earlier.output }));
}

async function taskBefore(fastify: FastifyInstance, task: TeamTask): Promise<TaskBefore | null> {
    if (task.after_task_id === 0) {
        return null;
    }

    const parent = await fastify.db
        .getRepository(TeamTask)
        .findOneBy({ id: task.after_task_id, team_id: task.team_id });
    const last = await fastify.db.getRepository(TeamTaskRun).findOne({
        where: { task_id: task.after_task_id, outcome: In(['ok', 'error']) },
        order: { id: 'DESC' },
    });

    return parent === null || last === null
        ? null
        : {
              title: parent.title,
              outcome: last.outcome === 'ok' ? 'ok' : 'error',
              output: last.output,
              reason: last.reason,
          };
}

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
        retryable = false,
    ) => {
        const now = new Date();
        const next = nextStart(task.start_at, task.repeat as TaskRepeat, now);
        const retry = outcome === 'error' && retryable ? retryAt(task.retry_count, now) : null;
        const followers =
            retry === null
                ? (
                      await tasks.find({
                          where: {
                              team_id: task.team_id,
                              after_task_id: task.id,
                              status: 'waiting',
                          },
                          select: { id: true, title: true, after_outcome: true },
                      })
                  ).filter((follower) => follows(follower.after_outcome, outcome))
                : [];

        events.push({ at: now.toISOString(), kind: 'end', outcome, delivered, reason });

        if (followers.length > 0) {
            events.push({
                at: now.toISOString(),
                kind: 'chain',
                started: followers.map((follower) => follower.title),
            });
        }

        if (retry !== null) {
            events.push({
                at: now.toISOString(),
                kind: 'retry',
                attempt: task.retry_count + 1,
                of: TASK_RETRY_DELAYS.length,
                next_at: retry.toISOString(),
            });
        }

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

        const progress = {
            last_run_at: startedAt,
            run_count: task.run_count + 1,
            ...(retry !== null
                ? { status: 'scheduled', retry_count: task.retry_count + 1, retry_at: retry }
                : {
                      retry_count: 0,
                      retry_at: null,
                      ...(task.after_task_id > 0
                          ? { status: 'waiting' }
                          : next === null
                            ? { status: outcome === 'ok' ? 'done' : 'failed' }
                            : { status: 'scheduled', start_at: next }),
                  }),
        };

        await tasks.update({ id: task.id }, progress);

        for (const follower of followers) {
            await tasks.update(
                { id: follower.id, status: 'waiting' },
                { status: 'scheduled', start_at: now, retry_count: 0, retry_at: null },
            );
        }

        await audit(fastify, log, {
            teamId: task.team_id,
            actor: 'agent',
            action: 'task.run',
            target: `task:${task.id}`,
            outcome: outcome === 'ok' ? 'ok' : 'error',
            durationMs: now.getTime() - startedAt.getTime(),
            detail: `${task.title} · agent ${task.agent_id}${delivered ? ' · sent' : ''}${reason === '' ? '' : ` · ${reason}`}${followers.length > 0 ? ` · started ${followers.map((follower) => follower.title).join(', ')}` : ''}`,
            changes: {
                run_id: run.id,
                output,
                delivered,
                reason,
                ...spent,
                task: changed(task, progress),
                ...(followers.length > 0 && {
                    started: followers.map((follower) => ({
                        id: follower.id,
                        title: follower.title,
                    })),
                }),
            },
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

        const group =
            task.group_chat_id === ''
                ? ''
                : ((await groupTitles(fastify, task.team_id, [task.group_chat_id])).get(
                      task.group_chat_id,
                  ) ?? task.group_chat_id);

        if (task.profile_id !== 0 && !recipient) {
            await finish('error', '', false, 'the person it was for is no longer in this project');

            return true;
        }

        const person = recipient ?? placeholderUser(task.team_id, startedAt);

        const tools = await agentTools(fastify, agent, person, false, task);

        const instructions = await agentInstructions(fastify, agent, tools);

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
                task.repeat === 'none' ? [] : await earlierOutputs(fastify, task.id, run.id),
                group,
                await taskBefore(fastify, task),
            ),
            tools,
            task,
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
            if (isAutoFree(model.model) && !isAutoFree(result.served)) {
                rest(result.served, TASK_MODEL_REST);
                note({ kind: 'switch', model: result.served });
            }

            await finish('error', '', false, runFailure(result), true);

            return true;
        }

        const text = result.text;

        if (!recipient && task.group_chat_id === '') {
            await finish('ok', text, false, '');

            return true;
        }

        const sent = await deliverTask(fastify, task, recipient, group, text, note);

        if (sent.failures.length > 0) {
            await finish(
                'error',
                text,
                sent.delivered > 0,
                `done, but ${sent.failures.join('; ')}`,
                sent.retryable,
            );

            return true;
        }

        await finish('ok', text, true, '');
    } catch (cause) {
        log.error({ module: 'task', taskId: task.id, err: cause }, 'task run crashed');

        await finish('error', '', false, 'the run stopped on an unexpected error', true);
    }

    return true;
}
