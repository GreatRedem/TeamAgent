import type { FastifyInstance } from 'fastify';

import { systemMetrics } from './system.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.get('/system/metrics', systemMetrics(fastify));
}
