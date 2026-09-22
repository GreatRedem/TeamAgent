import type { FastifyRequest, FastifyReply } from 'fastify';

import fastifyPlugin from 'fastify-plugin';

import LRUCache from '../utils/lru.js';

import { STATUS_TOO_MANY_REQUEST } from '../utils/status.js';

const rateLimitCache = new LRUCache<string, { count: number; time: number }>(10000);

export function rateLimit(name: string, count: number, time: number)
{
    return { rateLimit: { name, count, time } };
}

export default fastifyPlugin(async function(fastify)
{
    fastify.addHook('preHandler', async(request: FastifyRequest, reply: FastifyReply) =>
    {
        if (request.account_id !== 0)
        {
            return;
        }

        const routeConfig = request.routeOptions.config?.rateLimit;

        if (routeConfig === undefined)
        {
            return;
        }

        const now = Math.floor(Date.now() / 1000);
        const key = `${ request.ip }:${ routeConfig.name }`;

        let record = rateLimitCache.get(key);

        if (record === undefined || record.time < now)
        {
            record = { count: routeConfig.count, time: now + Math.ceil(routeConfig.time / 1000) };
        }

        rateLimitCache.set(key, record);

        reply.header('X-RateLimit-Limit', routeConfig.count);
        reply.header('X-RateLimit-Reset', record.time);

        if (record.count === 0)
        {
            request.log.warn({ module: 'ratelimit', rule: routeConfig.name, resetAt: record.time }, 'rate limit exceeded');

            reply.header('X-RateLimit-Remaining', 0);

            reply.code(STATUS_TOO_MANY_REQUEST).send();

            return;
        }

        record.count -= 1;

        reply.header('X-RateLimit-Remaining', record.count);
    });
});
