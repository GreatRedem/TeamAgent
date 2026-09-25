import assert from 'node:assert/strict';

import type { EntityManager } from 'typeorm';
import { PLANS } from '../constant.js';
import { Account } from '../routes/account/account.entity.js';
import { activePlan, projectRoom, teamRoom } from '../routes/account/account.plan.js';
import { TeamAgent } from '../routes/agent/agent.entity.js';
import { TeamTask } from '../routes/task/task.entity.js';
import { Team, TeamBot } from '../routes/team/team.entity.js';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => row[key] === value);
}

async function refusal(run: () => Promise<void>): Promise<string> {
    try {
        await run();
    } catch (cause) {
        return (cause as { result?: string }).result ?? 'thrown';
    }

    return 'allowed';
}

async function main() {
    const past = new Date(Date.now() - 1000);
    const later = new Date(Date.now() + 86_400_000);
    const tables = new Map<unknown, Row[]>([
        [
            Account,
            [
                { id: 1, plan: 'free', plan_until: null },
                { id: 2, plan: 'pro', plan_until: later },
                { id: 3, plan: 'business', plan_until: past },
                { id: 4, plan: 'custom', plan_until: null },
            ],
        ],
        [
            Team,
            [
                { id: 10, account_id: 1 },
                { id: 20, account_id: 2 },
                { id: 30, account_id: 3 },
                { id: 40, account_id: 4 },
            ],
        ],
        [
            TeamAgent,
            [10, 20, 30, 40].flatMap((team) =>
                [1, 2, 3].map((n) => ({ id: team + n, team_id: team })),
            ),
        ],
        [TeamBot, [{ id: 1, team_id: 10 }]],
        [TeamTask, []],
    ]);
    const db = {
        getRepository: (entity: unknown) => {
            const rows = tables.get(entity) ?? [];

            return {
                findOneBy: async (where: Row) => rows.find((row) => matches(row, where)) ?? null,
                countBy: async (where: Row) => rows.filter((row) => matches(row, where)).length,
            };
        },
    } as unknown as Pick<EntityManager, 'getRepository'>;

    assert.deepEqual(
        PLANS.map((plan) => plan.key),
        ['free', 'pro', 'business', 'custom'],
    );
    assert.equal(activePlan({ plan: 'pro', plan_until: null }).key, 'pro', 'no end date');
    assert.equal(activePlan({ plan: 'pro', plan_until: past }).key, 'free', 'a lapsed plan');
    assert.equal(activePlan({ plan: 'gold', plan_until: null }).key, 'free', 'an unknown plan');

    assert.equal(await refusal(() => teamRoom(db, 10, ['agents'])), 'PLAN_LIMIT_AGENTS');
    assert.equal(await refusal(() => teamRoom(db, 10, ['bots'])), 'PLAN_LIMIT_BOTS');
    assert.equal(await refusal(() => teamRoom(db, 10, ['tasks'])), 'allowed');
    assert.equal(await refusal(() => teamRoom(db, 20, ['agents'])), 'allowed', 'pro has room');
    assert.equal(
        await refusal(() => teamRoom(db, 30, ['agents'])),
        'PLAN_LIMIT_AGENTS',
        'a lapsed business plan counts as free',
    );
    assert.equal(await refusal(() => teamRoom(db, 40, ['agents'], 500)), 'allowed', 'custom');
    assert.equal(
        await refusal(() => teamRoom(db, 10, ['agents', 'bots', 'tasks'], 0)),
        'allowed',
        'an import that lands exactly on the limit is kept',
    );

    tables.get(TeamAgent)?.push({ id: 99, team_id: 10 });

    assert.equal(
        await refusal(() => teamRoom(db, 10, ['agents', 'bots', 'tasks'], 0)),
        'PLAN_LIMIT_AGENTS',
        'an import that goes over is refused',
    );

    assert.equal(await refusal(() => projectRoom(db, 1)), 'PLAN_LIMIT_PROJECTS');
    assert.equal(await refusal(() => projectRoom(db, 2)), 'allowed');
    assert.equal(await refusal(() => projectRoom(db, 4)), 'allowed');

    console.log('account.plan: ok');
}

main();
