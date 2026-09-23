import assert from 'node:assert/strict';

import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { AUDIT_CHANGES_MAX } from '../constant.js';

import { audit, changed } from '../routes/audit/audit.log.js';

async function main() {
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
    const log = { error() {} } as unknown as FastifyBaseLogger;
    const stored = async (changes: unknown) => {
        await audit(fastify, log, { action: 'test', changes });

        return String(saved.at(-1)?.['changes']);
    };

    const tests: Array<[string, () => Promise<void> | void]> = [
        [
            'only the fields that moved are recorded, with both values',
            () => {
                assert.deepEqual(
                    changed(
                        { name: 'Old', groups: false, profiles: '1,2', untouched: 5 },
                        { name: 'New', groups: false, profiles: '1' },
                    ),
                    {
                        name: { from: 'Old', to: 'New' },
                        profiles: { from: '1,2', to: '1' },
                    },
                );
                assert.deepEqual(changed({ a: [1] }, { a: [1] }), {});
            },
        ],

        [
            'secrets never reach the log, at any depth',
            async () => {
                const text = await stored({
                    token: '123:abc',
                    api_key: 'sk-1',
                    secrets: '{"x":"y"}',
                    nested: { hook_secret: 'h', webhook_secret: 'w', keep: 'visible' },
                    list: [{ token: 't' }],
                    diff: changed({ token: 'old' }, { token: 'new' }),
                    prompt_tokens: 12,
                });

                for (const secret of [
                    '123:abc',
                    'sk-1',
                    '"x"',
                    '"h"',
                    '"w"',
                    '"t"',
                    'old',
                    'new',
                ]) {
                    assert.equal(text.includes(secret), false, `${secret} leaked`);
                }

                assert.match(text, /"keep":"visible"/);
                assert.match(text, /"prompt_tokens":12/);
                assert.match(text, /"token":"\[hidden\]"/);
            },
        ],

        [
            'an empty secret stays visibly empty, so a cleared key is still readable',
            async () => {
                assert.match(await stored({ api_key: '' }), /"api_key":""/);
            },
        ],

        [
            'no changes means an empty column, and a huge one is capped',
            async () => {
                await audit(fastify, log, { action: 'plain' });

                assert.equal(saved.at(-1)?.['changes'], '');
                assert.equal(
                    (await stored({ text: 'x'.repeat(AUDIT_CHANGES_MAX * 2) })).length,
                    AUDIT_CHANGES_MAX,
                );
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

    console.log(`\n${tests.length - failed} passed`);

    if (failed > 0) {
        process.exit(1);
    }
}

void main();
