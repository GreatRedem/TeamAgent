import type { FastifyInstance } from 'fastify';

import { auditHeatmap, auditList } from './audit.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.get('/team/:id/audit', auditList(fastify));
    fastify.get('/team/:id/audit/heatmap', auditHeatmap(fastify));
}
