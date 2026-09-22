import type { FastifyInstance } from 'fastify';

import { modelCatalog, modelCreate, modelList, modelProbe, modelRemove, modelTest, modelUpdate } from './model.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.get('/model/catalog', modelCatalog());

    fastify.post('/team/:id/model', modelCreate(fastify));
    fastify.get('/team/:id/model', modelList(fastify));
    fastify.patch('/team/:id/model/:modelId', modelUpdate(fastify));
    fastify.delete('/team/:id/model/:modelId', modelRemove(fastify));
    fastify.post('/team/:id/model/:modelId/test', modelTest(fastify));

    fastify.post('/team/:id/model/probe', modelProbe(fastify));
}
