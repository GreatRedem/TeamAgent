import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { In } from 'typeorm';
import { LIST_PAGE, RUN_PAGE } from '../../constant.js';

import { authGuard } from '../../plugins/authentication.js';
import { BadRequestResponse } from '../../utils/response.js';
import { TeamAgent } from '../agent/agent.entity.js';
import { audit } from '../audit/audit.log.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TelegramUser } from '../telegram/telegram.entity.js';
import { TeamTask, TeamTaskRun } from './task.entity.js';
import { profileLabel, readTaskBody, type TaskBody, TaskError } from './task.plan.js';
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

async function taskViews(fastify: FastifyInstance, teamId: number, tasks: TeamTask[]) {
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
        start_at: task.start_at.toISOString(),
        repeat: task.repeat,
        status: task.status,
        last_run_at: task.last_run_at?.toISOString() ?? null,
        run_count: task.run_count,
        ok_count: tallies.get(task.id)?.ok ?? 0,
        error_count: tallies.get(task.id)?.error ?? 0,
        last_outcome: lastRuns.get(task.id) ?? '',
        created_at: task.created_at.toISOString(),
    }));
}

async function readCheckedBody(
    fastify: FastifyInstance,
    request: FastifyRequest,
    teamId: number,
): Promise<TaskBody> {
    let body: TaskBody;

    try {
        body = readTaskBody(request.body);
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

    return body;
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

        const body = await readCheckedBody(fastify, request, teamId);

        const saved = await fastify.db
            .getRepository(TeamTask)
            .save({ team_id: teamId, ...body, status: 'scheduled' });

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'task.create',
            target: `task:${saved.id}`,
            detail: `${saved.title} · agent ${saved.agent_id} · ${saved.repeat}`,
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

        if (task.status === 'running') {
            throw new BadRequestResponse('TASK_RUNNING');
        }

        const body = await readCheckedBody(fastify, request, teamId);

        const status = task.status === 'cancelled' ? 'cancelled' : 'scheduled';

        await fastify.db.getRepository(TeamTask).update({ id: task.id }, { ...body, status });

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'task.update',
            target: `task:${task.id}`,
            detail: body.title,
        });

        const saved = (await fastify.db
            .getRepository(TeamTask)
            .findOneBy({ id: task.id })) as TeamTask;
        const [view] = await taskViews(fastify, teamId, [saved]);

        reply.send(view);
    };

    return { schema: schemaTaskSave(), config: { ...authGuard() }, handler };
}

export function taskStatus(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const task = await findOwnedTask(fastify, teamId, readTaskId(request), request.account_id);
        const { status } = request.body as { status: 'scheduled' | 'cancelled' };

        if (task.status === 'running') {
            throw new BadRequestResponse('TASK_RUNNING');
        }

        await fastify.db.getRepository(TeamTask).update({ id: task.id }, { status });

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: status === 'cancelled' ? 'task.cancel' : 'task.schedule',
            target: `task:${task.id}`,
            detail: task.title,
        });

        const [view] = await taskViews(fastify, teamId, [{ ...task, status }]);

        reply.send(view);
    };

    return { schema: schemaTaskStatus(), config: { ...authGuard() }, handler };
}

export function taskRemove(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const task = await findOwnedTask(fastify, teamId, readTaskId(request), request.account_id);

        await fastify.db.getRepository(TeamTaskRun).delete({ task_id: task.id });
        await fastify.db.getRepository(TeamTask).delete({ id: task.id });

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'task.remove',
            target: `task:${task.id}`,
            detail: task.title,
        });

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

        if (task.status !== 'scheduled') {
            await fastify.db
                .getRepository(TeamTask)
                .update({ id: task.id, status: task.status }, { status: 'scheduled' });
        }

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'task.run_now',
            target: `task:${task.id}`,
            detail: task.title,
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
