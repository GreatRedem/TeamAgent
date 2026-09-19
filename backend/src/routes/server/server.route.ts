import type { FastifyInstance } from 'fastify';

import { realmList, characterList, characterChange } from './server.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.get('/server/realm', realmList());
    fastify.get('/server/character', characterList());
    fastify.post('/server/character', characterChange(fastify));
}
