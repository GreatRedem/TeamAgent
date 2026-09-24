import assert from 'node:assert/strict';

import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { TeamAgent } from '../routes/agent/agent.entity.js';
import { isSetAside, setAside, wake } from '../routes/model/model.auto.js';
import type { TeamModel } from '../routes/team/team.entity.js';
import type { TelegramUser } from '../routes/telegram/telegram.entity.js';
import { runAgent } from '../routes/telegram/telegram.service.js';

async function main() {
    const realFetch = globalThis.fetch;
    const saved: Record<string, unknown>[] = [];
    const fastify = {
        db: {
            getRepository: () => ({
                save: async (row: Record<string, unknown>) => {
                    saved.push(row);

                    return row;
                },
            }),
        },
    } as unknown as FastifyInstance;
    const calls = () =>
        saved
            .filter((row) => row['action'] === 'model.call')
            .map((row) => JSON.parse(String(row['changes'])) as Record<string, unknown>);
    const log = {
        info() {},
        warn() {},
        error() {},
        debug() {},
        child() {
            return log;
        },
    } as unknown as FastifyBaseLogger;
    const agent = { id: 3, team_id: 1, name: 'Support', permissions: '' } as TeamAgent;
    const user = { id: 5, team_id: 1, permissions: 'chat,model' } as TelegramUser;

    const answer = (text: string) => ({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }],
    });

    async function run(
        rowId: number,
        base: string,
        listed: string[],
        replies: Record<string, { status: number; body: unknown }>,
    ) {
        const asked: string[] = [];

        globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const url = String(input);

            if (url === `${base}/models`) {
                return Response.json({ data: listed.map((id) => ({ id })) });
            }

            const model = String(JSON.parse(String(init?.body))['model']);
            const reply = replies[model] ?? { status: 500, body: {} };

            asked.push(model);

            return Response.json(reply.body, { status: reply.status });
        }) as typeof fetch;

        try {
            const result = await runAgent(fastify, log, {
                teamId: 1,
                agent,
                model: {
                    id: rowId,
                    team_id: 1,
                    model: 'main',
                    base_url: base,
                    api_key: 'sk-test',
                    context_tokens: 0,
                } as TeamModel,
                user,
                messages: [{ role: 'user', content: 'hello' }],
                tools: [],
            });

            return { ...result, asked };
        } finally {
            globalThis.fetch = realFetch;
        }
    }

    const ok = (text: string) => ({ status: 200, body: answer(text) });
    const failing = (status: number) => ({
        status,
        body: { error: { message: `http ${status}` } },
    });

    const tests: Array<[string, () => Promise<void>]> = [
        [
            'a 403 hands the request to the next model the endpoint lists',
            async () => {
                wake();

                const base = 'https://one.example/v1';
                const replies = { main: failing(403), backup: ok('from backup') };
                const first = await run(7, base, ['main', 'backup', 'text-embedding-x'], replies);

                assert.equal(first.text, 'from backup');
                assert.equal(first.served, 'backup');
                assert.deepEqual(first.asked, ['main', 'backup']);
                assert.equal(isSetAside('model:7'), true);
                assert.deepEqual(
                    calls().map((call) => [call['chosen_model'], call['status'], call['why']]),
                    [
                        ['main', 403, 'the saved model'],
                        ['backup', 200, 'fallback, attempt 2'],
                    ],
                    'the audit log names the model each request went to, and why',
                );
                assert.equal(calls()[0]?.['endpoint'], base);
                assert.equal(calls()[0]?.['error'], 'http 403');
                saved.length = 0;

                const second = await run(7, base, ['main', 'backup'], replies);

                assert.deepEqual(second.asked, ['backup'], 'the failed model sits out');

                wake();

                const third = await run(7, base, ['main', 'backup'], {
                    main: ok('main is back'),
                });

                assert.deepEqual(third.asked, ['main'], 'and comes back when its time is up');
                assert.equal(third.text, 'main is back');
            },
        ],
        [
            'with nothing else to try, the saved model is still asked',
            async () => {
                wake();
                setAside('model:8', { kind: 'rest', until: Date.now() + 60_000 });

                const result = await run(8, 'https://two.example/v1', ['main'], {
                    main: ok('only one'),
                });

                assert.deepEqual(result.asked, ['main']);
                assert.equal(result.text, 'only one');
            },
        ],
        [
            'a rejected key does not wander through every model',
            async () => {
                wake();

                const result = await run(9, 'https://three.example/v1', ['main', 'backup'], {
                    main: failing(401),
                    backup: ok('never'),
                });

                assert.deepEqual(result.asked, ['main']);
                assert.equal(result.text, undefined);
                assert.equal(isSetAside('model:9'), false);
            },
        ],
        [
            'when every model fails, the real error comes back',
            async () => {
                wake();

                const result = await run(10, 'https://four.example/v1', ['main', 'backup'], {
                    main: failing(429),
                    backup: failing(503),
                });

                assert.deepEqual(result.asked, ['main', 'backup']);
                assert.equal(result.lastStatus, 503);
                wake();
            },
        ],
    ];

    let failed = 0;

    for (const [title, test] of tests) {
        try {
            await test();

            console.log(`  ok    ${title}`);
        } catch (error) {
            failed += 1;

            console.log(`  FAIL  ${title}`);
            console.log(`        ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log(
        failed === 0 ? `\n${tests.length} passed` : `\n${failed} of ${tests.length} failed`,
    );

    process.exit(failed === 0 ? 0 : 1);
}

await main();
