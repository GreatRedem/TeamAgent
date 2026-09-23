import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { TeamAgent, TeamAgentDocument } from '../agent/agent.entity.js';
import { agentHasPermission } from '../agent/agent.permission.js';
import { buildSystemPrompt, TELEGRAM_TEXT_MAX } from '../agent/agent.reply.js';
import { audit } from '../audit/audit.log.js';
import { allowedTools, PERSONAL_TOOLS } from '../mcp/mcp.tools.js';
import { TeamBot, TeamDocument, TeamModel } from '../team/team.entity.js';
import { ROSTER_FILE, rosterPrompt } from '../team/team.roster.js';
import { TelegramMessage, TelegramUser } from '../telegram/telegram.entity.js';
import { runAgent, telegramText } from '../telegram/telegram.service.js';
import { TeamTask, TeamTaskRun } from './task.entity.js';
import { nextStart, profileLabel, type TaskRepeat, taskMessages } from './task.plan.js';

// Runs one task now, if it is still waiting: claims it so it runs once even when the scheduler
// and a "Run now" meet, runs its agent, sends the result to its person, records the run and
// schedules the next one for a repeating task. Returns false when someone else had claimed it.
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

    const finish = async (
        outcome: 'ok' | 'error',
        output: string,
        delivered: boolean,
        reason: string,
    ) => {
        const now = new Date();
        const next = nextStart(task.start_at, task.repeat as TaskRepeat, now);

        await runs.update(
            { id: run.id },
            { finished_at: now, outcome, output, delivered, reason: reason.slice(0, 240) },
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

        const recipient =
            task.profile_id === 0
                ? null
                : await fastify.db
                      .getRepository(TelegramUser)
                      .findOneBy({ id: task.profile_id, team_id: task.team_id });

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

        // A task for nobody in particular still runs as someone; its personal tools are withheld,
        // so this stand-in is never read or written.
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

        // Sent through the bot this person last wrote to; a bot can only message someone who
        // has written to it.
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
