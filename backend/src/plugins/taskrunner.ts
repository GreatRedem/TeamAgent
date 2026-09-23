import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { LessThanOrEqual } from 'typeorm';

import { TeamTask, TeamTaskRun } from '../routes/task/task.entity.js';
import { nextStart, type TaskRepeat } from '../routes/task/task.plan.js';
import { runTask } from '../routes/task/task.run.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('task-runner');

const TICK = 30_000;

const BATCH = 5;

// Runs tasks when their time comes. Every tick it takes the tasks that are due, oldest first, and
// runs them one after another; a tick that finds the last one still busy waits for the next.
export default fastifyPlugin(async (fastify: FastifyInstance) => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let busy = false;

    const tick = async () => {
        if (busy) {
            return;
        }

        busy = true;

        try {
            const due = await fastify.db.getRepository(TeamTask).find({
                where: { status: 'scheduled', start_at: LessThanOrEqual(new Date()) },
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
        // A run a restart cut short is closed, not retried: its agent may already have sent
        // something. A repeating task goes on to its next time; any other is marked failed.
        const now = new Date();
        const stuck = await fastify.db.getRepository(TeamTask).findBy({ status: 'running' });

        for (const task of stuck) {
            const next = nextStart(task.start_at, task.repeat as TaskRepeat, now);

            await fastify.db
                .getRepository(TeamTask)
                .update(
                    { id: task.id },
                    next === null ? { status: 'failed' } : { status: 'scheduled', start_at: next },
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
