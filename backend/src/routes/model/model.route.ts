import type { FastifyInstance } from 'fastify';

import { modelCreate, modelList, modelRemove, modelTest, modelUpdate } from './model.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.post('/team/:id/model', modelCreate(fastify));
    fastify.get('/team/:id/model', modelList(fastify));
    fastify.patch('/team/:id/model/:modelId', modelUpdate(fastify));
    fastify.delete('/team/:id/model/:modelId', modelRemove(fastify));
    fastify.post('/team/:id/model/:modelId/test', modelTest(fastify));
}
