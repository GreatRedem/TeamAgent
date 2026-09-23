import assert from 'node:assert/strict';
import { AGENTROUTER_URL, OPENROUTER_URL, PROVIDERS } from '../constant.js';

import { readCatalog, readContextLength } from '../routes/model/model.provider.js';
import { probeModel } from '../routes/model/model.service.js';

async function main() {
    const BASE = 'https://api.example.com/v1';
    const KEY = 'sk-test-abcdef0123456789';

    const realFetch = globalThis.fetch;

    async function withFetch(
        stub: () => Promise<Response>,
        run: (calls: { url: string; auth: string | null }[]) => Promise<void>,
    ) {
        const calls: { url: string; auth: string | null }[] = [];

        globalThis.fetch = ((input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
            const headers = new Headers(init?.headers);

            calls.push({ url: String(input), auth: headers.get('authorization') });

            return stub();
        }) as typeof globalThis.fetch;

        try {
            await run(calls);
        } finally {
            globalThis.fetch = realFetch;
        }
    }

    const json = (status: number, body: unknown) => () =>
        Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { 'content-type': 'application/json' },
            }),
        );

    const listing = {
        data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }, { id: 'text-embedding-3-small' }],
    };

    const tests: Array<[string, () => Promise<void>]> = [
        [
            'every provider preset is usable by the add form',
            async () => {
                assert.ok(PROVIDERS.length >= 2);

                for (const preset of PROVIDERS) {
                    assert.notEqual(preset.key, '', 'a preset with no key cannot be selected');
                    assert.notEqual(preset.label, '', `${preset.key} has no label`);

                    if (preset.url !== '') {
                        assert.doesNotThrow(
                            () => new URL(preset.url),
                            `${preset.key} url is not parseable`,
                        );
                        assert.ok(
                            /^https?:$/.test(new URL(preset.url).protocol),
                            `${preset.key} is not http(s)`,
                        );
                    }
                }

                const keys = PROVIDERS.map((preset) => preset.key);

                assert.equal(
                    new Set(keys).size,
                    keys.length,
                    `duplicate provider key in ${keys.join(', ')}`,
                );
                assert.ok(keys.includes('agentrouter'), 'agentrouter is missing');
                assert.equal(keys.includes('9router'), false, '9router was not fully removed');
            },
        ],

        [
            'only a listing that is the same for everyone is catalogued',
            async () => {
                for (const preset of PROVIDERS.filter((candidate) => candidate.catalog)) {
                    assert.equal(
                        preset.url,
                        OPENROUTER_URL,
                        `${preset.key} claims a catalog that is not fetched`,
                    );
                }
            },
        ],

        [
            'a plain http preset is loopback, which is all readBaseUrl allows',
            async () => {
                for (const preset of PROVIDERS.filter((candidate) =>
                    candidate.url.startsWith('http://'),
                )) {
                    const host = new URL(preset.url).hostname;

                    assert.ok(
                        ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host),
                        `${preset.key} sends a key in clear text to ${host}`,
                    );
                }

                assert.ok(AGENTROUTER_URL.startsWith('https://'), AGENTROUTER_URL);
            },
        ],

        [
            'a provider that serves no listing still offers models to pick from',
            async () => {
                const agentrouter = PROVIDERS.find((preset) => preset.key === 'agentrouter');

                assert.ok(agentrouter);
                assert.equal(
                    agentrouter.catalog,
                    false,
                    'its listing is not the same for everyone',
                );
                assert.ok(
                    agentrouter.models.length > 0,
                    'nothing to suggest for a provider with no listing',
                );
                assert.ok(agentrouter.models.some((entry) => entry.id === 'gpt-5.5'));

                assert.equal(
                    agentrouter.models.some((entry) => entry.id.startsWith('claude')),
                    false,
                    'a model this url cannot reach was suggested',
                );
            },
        ],

        [
            'a documented model never claims a window it was not given',
            async () => {
                for (const preset of PROVIDERS) {
                    for (const entry of preset.models) {
                        assert.notEqual(entry.id, '', `${preset.key} lists a nameless model`);
                        assert.ok(
                            Number.isInteger(entry.context) && entry.context >= 0,
                            `${preset.key}/${entry.id} has a nonsense window`,
                        );
                    }
                }
            },
        ],

        [
            'a context window is read from whichever field the server uses',
            async () => {
                const cases: Array<[unknown, number]> = [
                    [{ context_length: 200000 }, 200000],
                    [{ max_model_len: 32768 }, 32768],
                    [{ max_context_length: 8192 }, 8192],
                    [{ context_window: 16384 }, 16384],
                    [{ meta: { n_ctx_train: 4096 } }, 4096],
                    [{ id: 'plain', owned_by: 'openai' }, 0],
                    [{ context_length: -1 }, 0],
                    [{ context_length: 'lots' }, 0],
                    [{ context_length: 1.5 }, 0],
                    [null, 0],
                    ['nonsense', 0],
                ];

                for (const [entry, expected] of cases) {
                    assert.equal(readContextLength(entry), expected, JSON.stringify(entry));
                }
            },
        ],

        [
            'a probe reports the window the endpoint declares for that model',
            async () => {
                await withFetch(
                    json(200, {
                        data: [
                            { id: 'other', max_model_len: 999 },
                            { id: 'gpt-4o-mini', max_model_len: 32768 },
                        ],
                    }),
                    async () => {
                        const probe = await probeModel(
                            'https://api.example.com/v1',
                            'k'.repeat(12),
                            'gpt-4o-mini',
                        );

                        assert.equal(probe.context, 32768);
                        assert.equal(probe.found, true);
                    },
                );
            },
        ],

        [
            'an endpoint that publishes no window reports zero, not a guess',
            async () => {
                await withFetch(json(200, listing), async () => {
                    assert.equal(
                        (await probeModel('https://api.example.com/v1', '', 'gpt-4o-mini'))
                            .context ?? 0,
                        0,
                    );
                });
            },
        ],

        [
            'the provider catalog keeps only what the add form shows',
            async () => {
                const models = readCatalog({
                    data: [
                        {
                            id: 'anthropic/claude-sonnet-4.5',
                            name: 'Claude Sonnet 4.5',
                            context_length: 200000,
                            pricing: { prompt: '0.000003', completion: '0.000015' },
                            supported_parameters: ['tools', 'temperature'],
                            description: 'x'.repeat(4000),
                        },
                    ],
                });

                assert.deepEqual(models, [
                    {
                        id: 'anthropic/claude-sonnet-4.5',
                        name: 'Claude Sonnet 4.5',
                        context: 200000,
                        prompt: 3,
                        completion: 15,
                        tools: true,
                        text: true,
                        rank: 0,
                    },
                ]);
            },
        ],

        [
            'a model that does not list tool support is marked as having none',
            async () => {
                const [model] = readCatalog({
                    data: [{ id: 'free/plain', supported_parameters: ['temperature'] }],
                });

                assert.equal(model.tools, false);
            },
        ],

        [
            'only a model that takes and gives text alone counts as text generation',
            async () => {
                const text = (architecture: object) =>
                    readCatalog({ data: [{ id: 'm', architecture }] })[0]?.text;

                assert.equal(
                    text({ input_modalities: ['text', 'image'], output_modalities: ['text'] }),
                    true,
                );
                assert.equal(
                    text({ input_modalities: ['text'], output_modalities: ['text', 'image'] }),
                    false,
                );
                assert.equal(
                    text({ input_modalities: ['audio'], output_modalities: ['text'] }),
                    false,
                );
                assert.equal(text({ modality: 'text+image->text' }), true);
                assert.equal(text({ modality: 'text->image' }), false);
                assert.equal(text({}), true);
            },
        ],

        [
            'models that cannot answer with text are left out',
            async () => {
                const models = readCatalog({
                    data: [
                        {
                            id: 'openai/text-embedding-3-small',
                            architecture: { output_modalities: ['embeddings'] },
                        },
                        {
                            id: 'black-forest-labs/flux',
                            architecture: { output_modalities: ['image'] },
                        },
                        { id: 'openai/gpt-4o', architecture: { output_modalities: ['text'] } },
                        {
                            id: 'google/gemini-3',
                            architecture: { output_modalities: ['text', 'image'] },
                        },
                        { id: 'legacy/no-architecture' },
                    ],
                });

                assert.deepEqual(
                    models.map((entry) => entry.id),
                    ['google/gemini-3', 'legacy/no-architecture', 'openai/gpt-4o'],
                );
            },
        ],

        [
            'unusable prices and entries are dropped rather than passed through',
            async () => {
                const models = readCatalog({
                    data: [
                        { id: '' },
                        null,
                        'not an object',
                        { name: 'no id at all' },
                        { id: 'free/model', pricing: { prompt: '0', completion: '0' } },
                        { id: 'variable/model', pricing: { prompt: '-1', completion: 'unknown' } },
                    ],
                });

                assert.deepEqual(
                    models.map((entry) => entry.id),
                    ['free/model', 'variable/model'],
                );

                for (const entry of models) {
                    assert.equal(entry.prompt, 0);
                    assert.equal(entry.completion, 0);
                    assert.equal(entry.context, 0);
                }
            },
        ],

        [
            'a payload that is not a listing yields an empty catalog',
            async () => {
                for (const payload of [
                    undefined,
                    null,
                    {},
                    { data: 'nope' },
                    { error: { code: 500 } },
                ]) {
                    assert.deepEqual(readCatalog(payload), []);
                }
            },
        ],

        [
            'a reachable endpoint reports its model count',
            async () => {
                await withFetch(json(200, listing), async (calls) => {
                    assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o-mini'), {
                        ok: true,
                        models: 3,
                        found: true,
                        ids: ['gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small'],
                    });

                    assert.equal(calls.length, 1);
                    assert.equal(calls[0].url, `${BASE}/models`);
                    assert.equal(calls[0].auth, `Bearer ${KEY}`);
                });
            },
        ],

        [
            'a model missing from the listing is reachable but not found',
            async () => {
                await withFetch(json(200, listing), async () => {
                    assert.deepEqual(await probeModel(BASE, KEY, 'llama-3'), {
                        ok: true,
                        models: 3,
                        found: false,
                        ids: ['gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small'],
                    });
                });
            },
        ],

        [
            'a refused client is not reported as a bad key',
            async () => {
                const bodies = [
                    { type: 'unauthorized_client_error', message: 'UNAUTHENTICATED' },
                    { error: { type: 'unauthorized_client_error' } },
                ];

                for (const body of bodies) {
                    await withFetch(json(401, body), async () => {
                        assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                            ok: false,
                            reason: 'MODEL_CLIENT_REJECTED',
                        });
                    });
                }
            },
        ],

        [
            'a 401 that says nothing about the client is still a bad key',
            async () => {
                for (const body of [
                    { error: { message: 'invalid api key' } },
                    {},
                    'not json at all',
                ]) {
                    await withFetch(json(401, body), async () => {
                        assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                            ok: false,
                            reason: 'MODEL_KEY_REJECTED',
                        });
                    });
                }
            },
        ],

        [
            'a rejected key is reported as such',
            async () => {
                for (const status of [401, 403]) {
                    await withFetch(json(status, { error: 'nope' }), async () => {
                        assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                            ok: false,
                            reason: 'MODEL_KEY_REJECTED',
                        });
                    });
                }
            },
        ],

        [
            'a server error is an endpoint problem, not a key problem',
            async () => {
                await withFetch(json(500, { error: 'boom' }), async () => {
                    assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                        ok: false,
                        reason: 'MODEL_ENDPOINT_REJECTED',
                    });
                });
            },
        ],

        [
            'a 200 that is not the compatible shape is rejected',
            async () => {
                await withFetch(json(200, { models: ['a'] }), async () => {
                    assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                        ok: false,
                        reason: 'MODEL_RESPONSE_UNEXPECTED',
                    });
                });
            },
        ],

        [
            'a body that is not json is rejected rather than thrown',
            async () => {
                await withFetch(
                    () => Promise.resolve(new Response('<html>502</html>', { status: 200 })),
                    async () => {
                        assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                            ok: false,
                            reason: 'MODEL_RESPONSE_UNEXPECTED',
                        });
                    },
                );
            },
        ],

        [
            'a network failure is unreachable',
            async () => {
                await withFetch(
                    () => Promise.reject(new Error('getaddrinfo ENOTFOUND api.example.com')),
                    async () => {
                        assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                            ok: false,
                            reason: 'MODEL_UNREACHABLE',
                        });
                    },
                );
            },
        ],

        [
            'a timeout is unreachable',
            async () => {
                await withFetch(
                    () => Promise.reject(new DOMException('aborted', 'TimeoutError')),
                    async () => {
                        assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                            ok: false,
                            reason: 'MODEL_UNREACHABLE',
                        });
                    },
                );
            },
        ],

        [
            'malformed listing entries are skipped, not thrown on',
            async () => {
                await withFetch(
                    json(200, { data: [null, 'x', {}, { id: 42 }, { id: 'gpt-4o' }] }),
                    async () => {
                        assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), {
                            ok: true,
                            models: 5,
                            found: true,
                            ids: ['gpt-4o'],
                        });
                    },
                );
            },
        ],

        [
            'an empty key sends no authorization header at all',
            async () => {
                await withFetch(json(200, listing), async (calls) => {
                    assert.deepEqual(await probeModel(BASE, '', 'gpt-4o'), {
                        ok: true,
                        models: 3,
                        found: true,
                        ids: ['gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small'],
                    });

                    assert.equal(calls.length, 1);
                    assert.equal(calls[0].auth, null);
                });
            },
        ],

        [
            'no outcome carries the api key back to the caller',
            async () => {
                const stubs = [
                    json(200, { data: [{ id: `echo-${KEY}` }] }),
                    json(401, { error: `bad key ${KEY}` }),
                    () => Promise.reject(new Error(`failed to reach ${BASE}/models with ${KEY}`)),
                ];

                for (const stub of stubs) {
                    await withFetch(stub, async () => {
                        const probe = await probeModel(BASE, KEY, 'gpt-4o');

                        assert.equal(
                            JSON.stringify(probe).includes(KEY),
                            false,
                            `key leaked: ${JSON.stringify(probe)}`,
                        );
                    });
                }
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
