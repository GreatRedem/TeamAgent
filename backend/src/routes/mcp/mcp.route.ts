import type { FastifyInstance } from 'fastify';

import { mcpTools, profileFiles } from './mcp.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.get('/team/:id/mcp/tools', mcpTools(fastify));
    fastify.get('/team/:id/profile/:profileId/file', profileFiles(fastify));
}
