import type { FastifyInstance } from 'fastify';

import { list, purchase } from './shop.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.get('/shop', list(fastify));
    fastify.post('/shop/purchase', purchase(fastify));
}
