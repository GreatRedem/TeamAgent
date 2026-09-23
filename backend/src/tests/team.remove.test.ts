import assert from 'node:assert/strict';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { teamRemove } from '../routes/team/team.service.js';

async function main() {
    const OWNER = 7;
    const TEAM = 42;

    const OWNED = [
        'TeamAgentDocument',
        'TelegramUserDocument',
        'TeamAgentExchange',
        'TeamAgent',
        'TelegramMessage',
        'TelegramUser',
        'TeamBot',
        'TeamModel',
        'TeamDocument',
        'TeamTaskRun',
        'TeamTask',
        'AuditLog',
        'Team',
    ];

    function fakeFastify(archivedAt: Date | null) {
        const deleted: { entity: string; where: Record<string, unknown> }[] = [];
        const audited: Record<string, unknown>[] = [];
        let transactions = 0;

        const fastify = {
            db: {
                getRepository: () => ({
                    findOneBy: async () => ({
                        id: TEAM,
                        account_id: OWNER,
                        name: 'Old project',
                        archived_at: archivedAt,
                    }),
                    save: async (row: Record<string, unknown>) => {
                        audited.push(row);

                        return row;
                    },
                }),
                transaction: async (run: (db: unknown) => Promise<void>) => {
                    transactions++;
                    await run({
                        find: async () => [{ id: 1 }, { id: 2 }],
                        delete: async (
                            entity: { name: string },
                            where: Record<string, unknown>,
                        ) => {
                            deleted.push({ entity: entity.name, where });
                        },
                    });
                },
            },
        } as unknown as FastifyInstance;

        return { fastify, deleted, audited, transactions: () => transactions };
    }

    function call(fastify: FastifyInstance) {
        const sent: unknown[] = [];
        const request = {
            params: { id: String(TEAM) },
            account_id: OWNER,
            log: { info: () => {}, error: () => {} },
        } as unknown as FastifyRequest;
        const reply = { send: (body: unknown) => sent.push(body) } as unknown as FastifyReply;

        return { run: () => teamRemove(fastify).handler(request, reply), sent };
    }

    {
        const { fastify, deleted, transactions } = fakeFastify(null);
        const { run, sent } = call(fastify);

        await assert.rejects(
            run,
            (error: { result?: string }) => error.result === 'TEAM_NOT_ARCHIVED',
        );
        assert.equal(transactions(), 0);
        assert.equal(deleted.length, 0);
        assert.equal(sent.length, 0);
    }

    {
        const { fastify, deleted, audited, transactions } = fakeFastify(new Date());
        const { run, sent } = call(fastify);

        await run();

        assert.equal(transactions(), 1);
        assert.deepEqual(
            deleted.map((d) => d.entity),
            OWNED,
        );
        assert.deepEqual(deleted.at(-1)?.where, { id: TEAM, account_id: OWNER });
        for (const { entity, where } of deleted.slice(2, -1)) {
            assert.deepEqual(where, { team_id: TEAM }, `${entity} is scoped to the project`);
        }
        assert.deepEqual(sent, [{ result: 'OK' }]);
        assert.equal(audited.length, 1);
        assert.equal(audited[0]?.['action'], 'team.remove');
        assert.equal(audited[0]?.['team_id'], TEAM);
        assert.match(String(audited[0]?.['changes']), /"removed":\{"TeamAgentDocument":0/);
    }

    console.log('team.remove: ok');
}

await main();
