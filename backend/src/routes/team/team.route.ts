import type { FastifyInstance } from 'fastify';

import { teamCreate, teamDetails, teamList, teamUpdate } from './team.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.post('/team', teamCreate(fastify));
    fastify.get('/team', teamList(fastify));
    fastify.get('/team/:id', teamDetails(fastify));
    fastify.patch('/team/:id', teamUpdate(fastify));
}
