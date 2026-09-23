import type { FastifyInstance } from 'fastify';

import { pluginHookReceive, pluginHookVerify } from './plugin.hook.js';

export default async function (fastify: FastifyInstance) {
    fastify.addContentTypeParser(
        'application/json',
        { parseAs: 'string' },
        (_request, body, done) => done(null, body),
    );

    fastify.get('/plugin/:pluginId/hook', pluginHookVerify(fastify));
    fastify.post('/plugin/:pluginId/hook', pluginHookReceive(fastify));
}
