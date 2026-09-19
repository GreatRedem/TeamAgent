import type { FastifyInstance } from 'fastify';

import { modelCatalog, modelCreate, modelList, modelRemove, modelTest, modelUpdate } from './model.service.js';

export default async function(fastify: FastifyInstance)
{
    // Not under /team: the provider listing is public and identical for every team.
    fastify.get('/model/catalog', modelCatalog());

    fastify.post('/team/:id/model', modelCreate(fastify));
    fastify.get('/team/:id/model', modelList(fastify));
    fastify.patch('/team/:id/model/:modelId', modelUpdate(fastify));
    fastify.delete('/team/:id/model/:modelId', modelRemove(fastify));
    fastify.post('/team/:id/model/:modelId/test', modelTest(fastify));
}
