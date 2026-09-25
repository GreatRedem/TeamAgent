import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { IsNull, LessThanOrEqual } from 'typeorm';
import { BATCH, LOGGER, TICK } from '../constant.js';

import { TeamTask, TeamTaskRun } from '../routes/task/task.entity.js';
import { nextStart, type TaskRepeat } from '../routes/task/task.plan.js';
import { runTask } from '../routes/task/task.run.js';

export default fastifyPlugin(async (fastify: FastifyInstance) => {
    const log = LOGGER.child({ module: 'task-runner' });

    let timer: ReturnType<typeof setInterval> | undefined;
    let busy = false;

    const tick = async () => {
        if (busy) {
            return;
        }

        busy = true;

        try {
            const due = await fastify.db.getRepository(TeamTask).find({
                where: [
                    { status: 'scheduled', retry_at: LessThanOrEqual(new Date()) },
                    {
                        status: 'scheduled',
                        retry_at: IsNull(),
                        start_at: LessThanOrEqual(new Date()),
                    },
                ],
                order: { start_at: 'ASC' },
                take: BATCH,
                select: { id: true },
            });

            for (const task of due) {
                await runTask(fastify, fastify.log, task.id);
            }
        } catch (cause) {
            log.error({ err: cause }, 'task tick failed');
        } finally {
            busy = false;
        }
    };

    fastify.addHook('onReady', async () => {
        const now = new Date();
        const stuck = await fastify.db.getRepository(TeamTask).findBy({ status: 'running' });

        for (const task of stuck) {
            const next = nextStart(task.start_at, task.repeat as TaskRepeat, now);

            await fastify.db
                .getRepository(TeamTask)
                .update(
                    { id: task.id },
                    task.after_task_id > 0
                        ? { status: 'waiting' }
                        : next === null
                          ? { status: 'failed' }
                          : { status: 'scheduled', start_at: next },
                );
        }

        await fastify.db
            .getRepository(TeamTaskRun)
            .update(
                { outcome: 'running' },
                { outcome: 'error', finished_at: now, reason: 'interrupted by a server restart' },
            );

        if (stuck.length > 0) {
            log.warn({ tasks: stuck.length }, 'closed task runs a restart interrupted');
        }

        timer = setInterval(() => void tick(), TICK);
    });

    fastify.addHook('onClose', async () => {
        clearInterval(timer);
    });
});
