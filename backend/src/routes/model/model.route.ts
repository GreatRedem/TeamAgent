import type { FastifyInstance } from 'fastify';

import { modelCatalog, modelCreate, modelList, modelProbe, modelRemove, modelTest, modelUpdate } from './model.service.js';

export default async function(fastify: FastifyInstance)
{
    // Not under /team: the provider listing is public and identical for every team.
    fastify.get('/model/catalog', modelCatalog());

    fastify.post('/team/:id/model', modelCreate(fastify));
    fastify.get('/team/:id/model', modelList(fastify));
    fastify.patch('/team/:id/model/:modelId', modelUpdate(fastify));
    fastify.delete('/team/:id/model/:modelId', modelRemove(fastify));
    fastify.post('/team/:id/model/:modelId/test', modelTest(fastify));

    // Tests an endpoint the add form has not saved yet, and reports what it
    // lists. Team-scoped, unlike the shared catalog, because the answer
    // depends on the key being entered.
    fastify.post('/team/:id/model/probe', modelProbe(fastify));
}
