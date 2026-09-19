import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { Like } from 'typeorm';

import { rateLimit } from '../../plugins/ratelimit.js';

import { Shop } from './shop.entity.js';
import { schemaShopList, schemaShopPurchase } from './shop.schema.js';

export function list(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const page = request.getQuery('page').min(1).asNumberDefault(1);
        const limit = request.getQuery('limit').min(5).max(50).asNumberDefault(20);
        const search = request.getQuery('search').max(32).asStringOptional();

        const offset = (page - 1) * limit;

        const [ items, total ] = await fastify.db.getRepository(Shop).findAndCount({
            take: limit,
            skip: offset,
            where: search ? { name: Like(`%${ search }%`) } : { },
            order:
            {
                created_at: 'DESC'
            } });

        reply.send({ total, items: items.map((s) => ({ id: s.id, name: s.name, item: s.item, count: s.count, category: s.category, price: s.price, realmId: s.realm_id, createdAt: s.created_at.toISOString() })) });
    };

    return { schema: schemaShopList, config: { ...rateLimit('shop-list', 30, 1 * 60 * 1000) }, handler };
}

export function purchase(_fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        void request.getQuery('item_id').min(1).asNumber();
        void request.getQuery('realm_id').min(1).asNumber();
        void request.getQuery('character_id').min(1).asNumber();

        // check account Balance
        // check realm id is correct
        // check character is for current account ? and exist ?

        reply.send();
    };

    return { schema: schemaShopPurchase, config: { ...rateLimit('shop-list', 30, 1 * 60 * 1000) }, handler };
}
