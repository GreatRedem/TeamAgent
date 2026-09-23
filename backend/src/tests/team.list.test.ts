import assert from 'node:assert/strict';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { teamList } from '../routes/team/team.service.js';

async function main() {
    async function listed(query: Record<string, unknown>) {
        let where: Record<string, unknown> = {};

        const fastify = {
            db: {
                getRepository: () => ({
                    findAndCount: async (options: { where: Record<string, unknown> }) => {
                        where = options.where;

                        return [[], 0];
                    },
                }),
            },
        } as unknown as FastifyInstance;

        const request = { query, account_id: 7 } as unknown as FastifyRequest;
        const reply = { send: () => undefined } as unknown as FastifyReply;

        await teamList(fastify).handler(request, reply);

        return (where['archived_at'] as { _type?: string })._type;
    }

    assert.equal(await listed({ archived: 'true' }), 'not', 'archived=true as the server gets it');
    assert.equal(await listed({ archived: true }), 'not');
    assert.equal(await listed({}), 'isNull', 'the default list is the active one');
    assert.equal(await listed({ archived: 'false' }), 'isNull');

    console.log('team.list: ok');
}

await main();
