import type { FastifyInstance } from 'fastify';

import {
    taskCreate,
    taskList,
    taskRemove,
    taskRunNow,
    taskRuns,
    taskStatus,
    taskUpdate,
} from './task.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.get('/team/:id/task', taskList(fastify));
    fastify.post('/team/:id/task', taskCreate(fastify));
    fastify.patch('/team/:id/task/:taskId', taskUpdate(fastify));
    fastify.post('/team/:id/task/:taskId/status', taskStatus(fastify));
    fastify.delete('/team/:id/task/:taskId', taskRemove(fastify));
    fastify.post('/team/:id/task/:taskId/run', taskRunNow(fastify));
    fastify.get('/team/:id/task/:taskId/run', taskRuns(fastify));
}
