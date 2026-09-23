import assert from 'node:assert/strict';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { teamRemove } from '../routes/team/team.service.js';

// Self-check for deleting a project, the one path here that loses data for good. Run with:
// npx tsx --tsconfig backend/tsconfig.json backend/src/tests/team.remove.test.ts

const OWNER = 7;
const TEAM = 42;

// Every table a project owns. A new one must be added here and to teamRemove together.
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
    let transactions = 0;

    const fastify = {
        db: {
            getRepository: () => ({
                findOneBy: async () => ({ id: TEAM, account_id: OWNER, archived_at: archivedAt }),
            }),
            transaction: async (run: (db: unknown) => Promise<void>) => {
                transactions++;
                await run({
                    find: async () => [{ id: 1 }, { id: 2 }],
                    delete: async (entity: { name: string }, where: Record<string, unknown>) => {
                        deleted.push({ entity: entity.name, where });
                    },
                });
            },
        },
    } as unknown as FastifyInstance;

    return { fastify, deleted, transactions: () => transactions };
}

function call(fastify: FastifyInstance) {
    const sent: unknown[] = [];
    const request = {
        params: { id: String(TEAM) },
        account_id: OWNER,
        log: { info: () => {} },
    } as unknown as FastifyRequest;
    const reply = { send: (body: unknown) => sent.push(body) } as unknown as FastifyReply;

    return { run: () => teamRemove(fastify).handler(request, reply), sent };
}

// A project that is not archived is refused, and nothing is touched.
{
    const { fastify, deleted, transactions } = fakeFastify(null);
    const { run, sent } = call(fastify);

    await assert.rejects(run, (error: { result?: string }) => error.result === 'TEAM_NOT_ARCHIVED');
    assert.equal(transactions(), 0);
    assert.equal(deleted.length, 0);
    assert.equal(sent.length, 0);
}

// An archived project goes with everything it owns, in one transaction, the project row last.
{
    const { fastify, deleted, transactions } = fakeFastify(new Date());
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
}

console.log('team.remove: ok');
