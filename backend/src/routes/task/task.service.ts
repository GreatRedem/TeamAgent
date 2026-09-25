import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { In } from 'typeorm';
import { LIST_PAGE, RUN_PAGE } from '../../constant.js';

import { authGuard } from '../../plugins/authentication.js';
import { BadRequestResponse } from '../../utils/response.js';
import { TeamAgent } from '../agent/agent.entity.js';
import { type ActedBy, attribution, audit, changed } from '../audit/audit.log.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TeamBot } from '../team/team.entity.js';
import { TelegramMessage, TelegramUser } from '../telegram/telegram.entity.js';
import { groupTitles } from '../telegram/telegram.service.js';
import { TeamTask, TeamTaskRun } from './task.entity.js';
import { makesLoop, profileLabel, readTaskBody, type TaskBody, TaskError } from './task.plan.js';
import { runTask } from './task.run.js';
import {
    schemaTaskList,
    schemaTaskResult,
    schemaTaskRuns,
    schemaTaskSave,
    schemaTaskStatus,
} from './task.schema.js';

function readLog(stored: string): unknown[] {
    try {
        const parsed: unknown = JSON.parse(stored);

        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function readTaskId(request: FastifyRequest) {
    return readParamId(request, 'taskId', 'TASK_ID_INVALID');
}

async function findOwnedTask(
    fastify: FastifyInstance,
    teamId: number,
    taskId: number,
    accountId: number,
): Promise<TeamTask> {
    await findOwnedTeam(fastify, teamId, accountId);

    const task = await fastify.db
        .getRepository(TeamTask)
        .findOneBy({ id: taskId, team_id: teamId });

    if (!task) {
        throw new BadRequestResponse('TASK_NOT_FOUND');
    }

    return task;
}

export async function taskViews(fastify: FastifyInstance, teamId: number, tasks: TeamTask[]) {
    if (tasks.length === 0) {
        return [];
    }

    const agents = new Map(
        (
            await fastify.db
                .getRepository(TeamAgent)
                .find({ where: { team_id: teamId }, select: { id: true, name: true } })
        ).map((agent) => [agent.id, agent.name]),
    );

    const profileIds = [...new Set(tasks.map((task) => task.profile_id).filter((id) => id > 0))];
    const profiles = new Map(
        (profileIds.length === 0
            ? []
            : await fastify.db
                  .getRepository(TelegramUser)
                  .findBy({ team_id: teamId, id: In(profileIds) })
        ).map((person) => [person.id, profileLabel(person)]),
    );

    const afterIds = [...new Set(tasks.map((task) => task.after_task_id).filter((id) => id > 0))];
    const titles = new Map(
        (afterIds.length === 0
            ? []
            : await fastify.db.getRepository(TeamTask).find({
                  where: { team_id: teamId, id: In(afterIds) },
                  select: { id: true, title: true },
              })
        ).map((task) => [task.id, task.title]),
    );

    const groups = await groupTitles(fastify, teamId, [
        ...new Set(tasks.map((task) => task.group_chat_id).filter((id) => id !== '')),
    ]);

    const tallies = new Map(
        (
            await fastify.db
                .getRepository(TeamTaskRun)
                .createQueryBuilder('r')
                .select('r.task_id', 'task_id')
                .addSelect("COUNT(*) FILTER (WHERE r.outcome = 'ok')", 'ok')
                .addSelect("COUNT(*) FILTER (WHERE r.outcome = 'error')", 'error')
                .where('r.task_id IN (:...ids)', { ids: tasks.map((task) => task.id) })
                .groupBy('r.task_id')
                .getRawMany<{ task_id: number; ok: string; error: string }>()
        ).map((row) => [Number(row.task_id), { ok: Number(row.ok), error: Number(row.error) }]),
    );

    const lastRuns = new Map(
        (
            await fastify.db
                .getRepository(TeamTaskRun)
                .createQueryBuilder('r')
                .distinctOn(['r.task_id'])
                .select(['r.task_id', 'r.outcome'])
                .where('r.task_id IN (:...ids)', { ids: tasks.map((task) => task.id) })
                .orderBy('r.task_id')
                .addOrderBy('r.id', 'DESC')
                .getMany()
        ).map((run) => [run.task_id, run.outcome]),
    );

    return tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        goal: task.goal,
        agent_id: task.agent_id,
        agent_name: agents.get(task.agent_id) ?? '',
        profile_id: task.profile_id,
        profile_name: profiles.get(task.profile_id) ?? '',
        group_bot_id: task.group_bot_id,
        group_chat_id: task.group_chat_id,
        group_title:
            task.group_chat_id === '' ? '' : (groups.get(task.group_chat_id) ?? task.group_chat_id),
        start_at: task.start_at.toISOString(),
        repeat: task.repeat,
        after_task_id: task.after_task_id,
        after_task_title: titles.get(task.after_task_id) ?? '',
        after_outcome: task.after_outcome,
        status: task.status,
        last_run_at: task.last_run_at?.toISOString() ?? null,
        run_count: task.run_count,
        retry_count: task.retry_count,
        retry_at: task.retry_at?.toISOString() ?? null,
        ok_count: tallies.get(task.id)?.ok ?? 0,
        error_count: tallies.get(task.id)?.error ?? 0,
        last_outcome: lastRuns.get(task.id) ?? '',
        created_at: task.created_at.toISOString(),
    }));
}

async function readCheckedBody(
    fastify: FastifyInstance,
    raw: unknown,
    teamId: number,
    selfId = 0,
): Promise<TaskBody> {
    let body: TaskBody;

    try {
        body = readTaskBody(raw);
    } catch (cause) {
        throw new BadRequestResponse(cause instanceof TaskError ? cause.code : 'TASK_INVALID');
    }

    if (
        !(await fastify.db
            .getRepository(TeamAgent)
            .existsBy({ id: body.agent_id, team_id: teamId }))
    ) {
        throw new BadRequestResponse('TASK_AGENT_NOT_FOUND');
    }

    if (
        body.profile_id !== 0 &&
        !(await fastify.db
            .getRepository(TelegramUser)
            .existsBy({ id: body.profile_id, team_id: teamId }))
    ) {
        throw new BadRequestResponse('TASK_PROFILE_NOT_FOUND');
    }

    if (
        body.group_chat_id !== '' &&
        !(
            (await fastify.db
                .getRepository(TeamBot)
                .existsBy({ id: body.group_bot_id, team_id: teamId })) &&
            (await fastify.db.getRepository(TelegramMessage).existsBy({
                team_id: teamId,
                bot_id: body.group_bot_id,
                chat_id: body.group_chat_id,
            }))
        )
    ) {
        throw new BadRequestResponse('TASK_GROUP_NOT_FOUND');
    }

    if (body.after_task_id > 0) {
        const chain = await fastify.db
            .getRepository(TeamTask)
            .find({ where: { team_id: teamId }, select: { id: true, after_task_id: true } });
        const parents = new Map(chain.map((task) => [task.id, task.after_task_id]));

        if (!parents.has(body.after_task_id)) {
            throw new BadRequestResponse('TASK_AFTER_NOT_FOUND');
        }

        if (makesLoop(selfId, body.after_task_id, parents)) {
            throw new BadRequestResponse('TASK_AFTER_LOOP');
        }
    }

    return body;
}

function restingStatus(body: { after_task_id: number }): 'scheduled' | 'waiting' {
    return body.after_task_id > 0 ? 'waiting' : 'scheduled';
}

export async function createTask(
    fastify: FastifyInstance,
    teamId: number,
    raw: unknown,
    by: ActedBy,
): Promise<TeamTask> {
    const body = await readCheckedBody(fastify, raw, teamId);
    const credit = attribution(by);

    const status = restingStatus(body);
    const saved = await fastify.db
        .getRepository(TeamTask)
        .save({ team_id: teamId, ...body, status });

    await audit(fastify, by.log, {
        teamId,
        ...credit.who,
        action: 'task.create',
        target: `task:${saved.id}`,
        detail: `${saved.title} · agent ${saved.agent_id} · ${saved.repeat}${credit.note}`,
        changes: { ...body, status, ...credit.changes },
    });

    return saved;
}

export async function updateTask(
    fastify: FastifyInstance,
    task: TeamTask,
    raw: unknown,
    by: ActedBy,
): Promise<TeamTask> {
    if (task.status === 'running') {
        throw new BadRequestResponse('TASK_RUNNING');
    }

    const body = await readCheckedBody(fastify, raw, task.team_id, task.id);
    const credit = attribution(by);
    const status = task.status === 'cancelled' ? 'cancelled' : restingStatus(body);
    const diff = changed(task, { ...body, status, retry_count: 0, retry_at: null });

    await fastify.db
        .getRepository(TeamTask)
        .update({ id: task.id }, { ...body, status, retry_count: 0, retry_at: null });

    await audit(fastify, by.log, {
        teamId: task.team_id,
        ...credit.who,
        action: 'task.update',
        target: `task:${task.id}`,
        detail: `${body.title} · changed ${Object.keys(diff).join(', ') || 'nothing'}${credit.note}`,
        changes: { ...diff, ...credit.changes },
    });

    return (await fastify.db.getRepository(TeamTask).findOneBy({ id: task.id })) as TeamTask;
}

export async function removeTask(fastify: FastifyInstance, task: TeamTask, by: ActedBy) {
    if (
        await fastify.db
            .getRepository(TeamTask)
            .existsBy({ team_id: task.team_id, after_task_id: task.id })
    ) {
        throw new BadRequestResponse('TASK_HAS_FOLLOWERS');
    }

    const credit = attribution(by);
    const runs = await fastify.db.getRepository(TeamTaskRun).delete({ task_id: task.id });

    await fastify.db.getRepository(TeamTask).delete({ id: task.id });

    await audit(fastify, by.log, {
        teamId: task.team_id,
        ...credit.who,
        action: 'task.remove',
        target: `task:${task.id}`,
        detail: `${task.title} · ${runs.affected ?? 0} run records removed${credit.note}`,
        changes: { task, runs_removed: runs.affected ?? 0, ...credit.changes },
    });

    return runs.affected ?? 0;
}

export function taskList(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { limit, offset } = readPage(request, LIST_PAGE);

        const [rows, total] = await fastify.db.getRepository(TeamTask).findAndCount({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        reply.send({
            limit,
            offset,
            has_more,
            total,
            tasks: await taskViews(fastify, teamId, items),
        });
    };

    return { schema: schemaTaskList(), config: { ...authGuard() }, handler };
}

export function taskCreate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const saved = await createTask(fastify, teamId, request.body, {
            log: request.log,
            accountId: request.account_id,
        });
        const [view] = await taskViews(fastify, teamId, [saved]);

        reply.send(view);
    };

    return { schema: schemaTaskSave(), config: { ...authGuard() }, handler };
}

export function taskUpdate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const task = await findOwnedTask(fastify, teamId, readTaskId(request), request.account_id);
        const saved = await updateTask(fastify, task, request.body, {
            log: request.log,
            accountId: request.account_id,
        });
        const [view] = await taskViews(fastify, teamId, [saved]);

        reply.send(view);
    };

    return { schema: schemaTaskSave(), config: { ...authGuard() }, handler };
}

export function taskStatus(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const task = await findOwnedTask(fastify, teamId, readTaskId(request), request.account_id);
        const asked = (request.body as { status: 'scheduled' | 'cancelled' }).status;
        const status = asked === 'scheduled' ? restingStatus(task) : 'cancelled';

        if (task.status === 'running') {
            throw new BadRequestResponse('TASK_RUNNING');
        }

        await fastify.db
            .getRepository(TeamTask)
            .update({ id: task.id }, { status, retry_count: 0, retry_at: null });

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: status === 'cancelled' ? 'task.cancel' : 'task.schedule',
            target: `task:${task.id}`,
            detail: `${task.title} · ${task.status} -> ${status}`,
            changes: changed(task, { status, retry_count: 0, retry_at: null }),
        });

        const [view] = await taskViews(fastify, teamId, [
            { ...task, status, retry_count: 0, retry_at: null },
        ]);

        reply.send(view);
    };

    return { schema: schemaTaskStatus(), config: { ...authGuard() }, handler };
}

export function taskRemove(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const task = await findOwnedTask(fastify, teamId, readTaskId(request), request.account_id);

        await removeTask(fastify, task, { log: request.log, accountId: request.account_id });

        reply.send({ result: 'removed' });
    };

    return { schema: schemaTaskResult(), config: { ...authGuard() }, handler };
}

export function taskRunNow(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const task = await findOwnedTask(fastify, teamId, readTaskId(request), request.account_id);

        if (task.status === 'running') {
            throw new BadRequestResponse('TASK_RUNNING');
        }

        if (task.status === 'cancelled') {
            throw new BadRequestResponse('TASK_CANCELLED');
        }

        await fastify.db
            .getRepository(TeamTask)
            .update(
                { id: task.id, status: task.status },
                { status: 'scheduled', retry_count: 0, retry_at: null },
            );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'task.run_now',
            target: `task:${task.id}`,
            detail: `${task.title} · ${task.status} -> scheduled now`,
            changes: changed(task, { status: 'scheduled', retry_count: 0, retry_at: null }),
        });

        void runTask(fastify, request.log, task.id).catch((cause: unknown) =>
            request.log.error({ module: 'task', taskId: task.id, err: cause }, 'task run crashed'),
        );

        reply.send({ result: 'started' });
    };

    return { schema: schemaTaskResult(), config: { ...authGuard() }, handler };
}

export function taskRuns(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const task = await findOwnedTask(fastify, teamId, readTaskId(request), request.account_id);

        const { limit, offset } = readPage(request, RUN_PAGE);

        const [rows, total] = await fastify.db.getRepository(TeamTaskRun).findAndCount({
            where: { task_id: task.id },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        reply.send({
            limit,
            offset,
            has_more,
            total,
            runs: items.map((run) => ({
                id: run.id,
                started_at: run.started_at.toISOString(),
                finished_at: run.finished_at?.toISOString() ?? null,
                outcome: run.outcome,
                output: run.output,
                delivered: run.delivered,
                reason: run.reason,
                model: run.model,
                prompt_tokens: run.prompt_tokens,
                completion_tokens: run.completion_tokens,
                tool_calls: run.tool_calls,
                log: readLog(run.log),
            })),
        });
    };

    return { schema: schemaTaskRuns(), config: { ...authGuard() }, handler };
}
