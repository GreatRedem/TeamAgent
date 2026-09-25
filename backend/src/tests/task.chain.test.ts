import assert from 'node:assert/strict';

import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { AuditLog } from '../routes/audit/audit.entity.js';
import { TeamTask, TeamTaskRun } from '../routes/task/task.entity.js';
import {
    follows,
    makesLoop,
    readTaskBody,
    TaskError,
    taskMessages,
} from '../routes/task/task.plan.js';
import { runTask } from '../routes/task/task.run.js';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(
        ([key, value]) => typeof value === 'object' || row[key] === value,
    );
}

function table(rows: Row[]) {
    let next = 500;

    return {
        rows,
        find: async (options: { where?: Row } = {}) =>
            rows.filter((row) => matches(row, options.where)),
        findOne: async () => null,
        findOneBy: async (where: Row) => rows.find((row) => matches(row, where)) ?? null,
        save: async (row: Row) => {
            const saved = { id: next++, ...row };

            rows.push(saved);

            return saved;
        },
        update: async (where: Row, patch: Row) => {
            const hit = rows.filter((row) => matches(row, where));

            for (const row of hit) {
                Object.assign(row, patch);
            }

            return { affected: hit.length };
        },
    };
}

function code(run: () => unknown): string {
    try {
        run();

        return 'ok';
    } catch (cause) {
        return cause instanceof TaskError ? cause.code : String(cause);
    }
}

async function main() {
    const base = { title: 'Follow up', agent_id: 1, start_at: '2026-09-25T10:00:00Z' };
    const chained = readTaskBody({
        title: 'Summary',
        agent_id: 1,
        after_task_id: 7,
        after_outcome: 'error',
        repeat: 'daily',
    });

    assert.equal(chained.after_task_id, 7);
    assert.equal(chained.after_outcome, 'error');
    assert.equal(chained.repeat, 'none', 'a follower does not repeat on its own');
    assert.equal(readTaskBody(base).after_outcome, '', 'a timed task follows nothing');
    assert.equal(
        code(() => readTaskBody({ ...base, after_task_id: 7 })),
        'TASK_AFTER_INVALID',
    );
    assert.equal(
        code(() => readTaskBody({ ...base, after_task_id: 7, after_outcome: 'maybe' })),
        'TASK_AFTER_INVALID',
    );
    assert.equal(
        code(() => readTaskBody({ ...base, after_task_id: -1 })),
        'TASK_AFTER_INVALID',
    );

    assert.deepEqual(
        [
            follows('ok', 'ok'),
            follows('ok', 'error'),
            follows('error', 'error'),
            follows('any', 'ok'),
        ],
        [true, false, true, true],
    );

    const parents = new Map([
        [1, 0],
        [2, 1],
        [3, 2],
    ]);

    assert.equal(makesLoop(1, 3, parents), true, 'the first task cannot follow the last');
    assert.equal(makesLoop(4, 3, parents), false, 'a new link at the end is fine');
    assert.equal(makesLoop(0, 3, parents), false, 'a new task cannot close a loop');
    assert.equal(makesLoop(5, 5, parents), true, 'a task cannot follow itself');

    const [system] = taskMessages(
        'Be brief.',
        { title: 'Summary', description: '', goal: '' },
        '',
        new Date('2026-09-25T10:00:00Z'),
        [],
        '',
        {
            title: 'Collect news',
            outcome: 'ok',
            output: 'Five headlines about NuraChain.',
            reason: '',
        },
    );

    assert.match(system?.content ?? '', /"Collect news" just succeeded/);
    assert.match(system?.content ?? '', /Five headlines about NuraChain\./);

    const tasks = table([
        {
            id: 1,
            team_id: 1,
            title: 'Collect news',
            agent_id: 99,
            status: 'scheduled',
            start_at: new Date(),
            repeat: 'daily',
            after_task_id: 0,
            after_outcome: '',
            run_count: 0,
            retry_count: 0,
        },
        {
            id: 2,
            team_id: 1,
            title: 'On success',
            agent_id: 99,
            status: 'waiting',
            start_at: new Date(0),
            repeat: 'none',
            after_task_id: 1,
            after_outcome: 'ok',
            run_count: 0,
            retry_count: 0,
        },
        {
            id: 3,
            team_id: 1,
            title: 'On failure',
            agent_id: 99,
            status: 'waiting',
            start_at: new Date(0),
            repeat: 'none',
            after_task_id: 1,
            after_outcome: 'error',
            run_count: 0,
            retry_count: 0,
        },
        {
            id: 4,
            team_id: 1,
            title: 'Either way',
            agent_id: 99,
            status: 'waiting',
            start_at: new Date(0),
            repeat: 'none',
            after_task_id: 1,
            after_outcome: 'any',
            run_count: 0,
            retry_count: 0,
        },
        {
            id: 5,
            team_id: 1,
            title: 'Paused',
            agent_id: 99,
            status: 'cancelled',
            start_at: new Date(0),
            repeat: 'none',
            after_task_id: 1,
            after_outcome: 'any',
            run_count: 0,
            retry_count: 0,
        },
    ]);
    const runs = table([]);
    const audits = table([]);
    const fastify = {
        db: {
            getRepository: (entity: unknown) =>
                entity === TeamTask
                    ? tasks
                    : entity === TeamTaskRun
                      ? runs
                      : entity === AuditLog
                        ? audits
                        : table([]),
        },
    } as unknown as FastifyInstance;
    const log = {
        info() {},
        warn() {},
        error() {},
        child: () => log,
    } as unknown as FastifyBaseLogger;
    const status = (id: number) => tasks.rows.find((row) => row['id'] === id)?.['status'];

    assert.equal(await runTask(fastify, log, 1), true);
    assert.equal(runs.rows[0]?.['outcome'], 'error', 'its agent is gone, so the run fails');
    assert.equal(status(1), 'scheduled', 'a daily task is scheduled for tomorrow');
    assert.equal(status(2), 'waiting', 'the success follower keeps waiting');
    assert.equal(status(3), 'scheduled', 'the failure follower is started');
    assert.equal(status(4), 'scheduled', 'the either-way follower is started');
    assert.equal(status(5), 'cancelled', 'a paused follower stays paused');
    assert.match(
        String(runs.rows[0]?.['log']),
        /"kind":"chain","started":\["On failure","Either way"\]/,
    );
    assert.match(String(audits.rows.at(-1)?.['detail']), /started On failure, Either way/);

    assert.equal(await runTask(fastify, log, 3), true);
    assert.equal(status(3), 'waiting', 'after its run, a follower waits for the next trigger');

    console.log('task.chain: ok');
}

main();
