import type { FastifyInstance } from 'fastify';

import {
    pluginCalls,
    pluginCatalog,
    pluginCreate,
    pluginList,
    pluginRemove,
    pluginTest,
    pluginUpdate,
} from './plugin.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.get('/team/:id/plugin/catalog', pluginCatalog(fastify));
    fastify.get('/team/:id/plugin', pluginList(fastify));
    fastify.post('/team/:id/plugin', pluginCreate(fastify));
    fastify.patch('/team/:id/plugin/:pluginId', pluginUpdate(fastify));
    fastify.delete('/team/:id/plugin/:pluginId', pluginRemove(fastify));
    fastify.post('/team/:id/plugin/:pluginId/test', pluginTest(fastify));
    fastify.get('/team/:id/plugin/:pluginId/call', pluginCalls(fastify));
}
