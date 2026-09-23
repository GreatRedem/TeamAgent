import type { FastifyInstance } from 'fastify';

import { overview } from './overview.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.get('/team/:id/overview', overview(fastify));
}
