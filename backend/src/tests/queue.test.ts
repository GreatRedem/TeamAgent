import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { enqueue } from '../utils/queue.js';

async function main() {
    const tests: Array<[string, () => Promise<void>]> = [
        [
            'one key runs its jobs one at a time, in the order they came',
            async () => {
                const queues = new Map<number, Promise<void>>();
                const done: number[] = [];
                let running = 0;
                let most = 0;

                const job = (id: number, ms: number) => async () => {
                    running += 1;
                    most = Math.max(most, running);
                    await sleep(ms);
                    done.push(id);
                    running -= 1;
                };

                await Promise.all([
                    enqueue(queues, 1, job(1, 30)),
                    enqueue(queues, 1, job(2, 5)),
                    enqueue(queues, 1, job(3, 1)),
                ]);

                assert.deepEqual(done, [1, 2, 3]);
                assert.equal(most, 1);
            },
        ],
        [
            'different keys do not wait for each other',
            async () => {
                const queues = new Map<number, Promise<void>>();
                const done: number[] = [];

                await Promise.all([
                    enqueue(queues, 1, async () => {
                        await sleep(30);
                        done.push(1);
                    }),
                    enqueue(queues, 2, async () => {
                        await sleep(1);
                        done.push(2);
                    }),
                ]);

                assert.deepEqual(done, [2, 1]);
            },
        ],
        [
            'a job that throws does not stop the ones behind it',
            async () => {
                const queues = new Map<number, Promise<void>>();
                const done: string[] = [];

                await Promise.all([
                    enqueue(queues, 1, async () => {
                        throw new Error('boom');
                    }),
                    enqueue(queues, 1, async () => {
                        done.push('next');
                    }),
                ]);

                assert.deepEqual(done, ['next']);
            },
        ],
        [
            'the queue is forgotten once it drains',
            async () => {
                const queues = new Map<number, Promise<void>>();
                const first = enqueue(queues, 1, () => sleep(5));
                const second = enqueue(queues, 1, () => sleep(5));

                assert.equal(queues.size, 1);
                await first;
                assert.equal(queues.size, 1, 'still busy with the second');
                await second;
                assert.equal(queues.size, 0);
            },
        ],
    ];

    let failed = 0;

    for (const [title, run] of tests) {
        try {
            await run();

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
