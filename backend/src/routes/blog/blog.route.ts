import type { FastifyInstance } from 'fastify';

import { create, list, remove, findOne } from './blog.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.get('/blog', list(fastify));
    fastify.get('/blog/:slug', findOne(fastify));
    fastify.post('/blog/create', create(fastify));
    fastify.post('/blog/remove', remove(fastify));
}
