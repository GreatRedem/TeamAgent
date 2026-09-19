/**
 * Self-check for the model connectivity probe. No framework and no network:
 *
 *     cd backend && npx tsx src/routes/model/model.service.test.ts
 *
 * It reads `.env`, because importing the service pulls in `utils/config.ts`
 * through the auth plugin, which throws on a missing variable at import time.
 */

/* eslint-disable no-console -- this file is a CLI self-check; its output is the report. */

import assert from 'node:assert/strict';

import { probeModel } from './model.service.js';
import { readCatalog } from './model.provider.js';

const BASE = 'https://api.example.com/v1';
const KEY = 'sk-test-abcdef0123456789';

const realFetch = globalThis.fetch;

async function withFetch(stub: () => Promise<Response>, run: (calls: { url: string; auth: string | null }[]) => Promise<void>)
{
    const calls: { url: string; auth: string | null }[] = [ ];

    globalThis.fetch = ((input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) =>
    {
        const headers = new Headers(init?.headers);

        calls.push({ url: String(input), auth: headers.get('authorization') });

        return stub();
    }) as typeof globalThis.fetch;

    try
    {
        await run(calls);
    }
    finally
    {
        globalThis.fetch = realFetch;
    }
}

const json = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const listing = { data: [ { id: 'gpt-4o-mini' }, { id: 'gpt-4o' }, { id: 'text-embedding-3-small' } ] };

const tests: Array<[ string, () => Promise<void> ]> = [
    [ 'the provider catalog keeps only what the add form shows', async() =>
    {
        const models = readCatalog({ data: [
            { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, description: 'x'.repeat(4000) }
        ] });

        // Per-token on the wire, per-million on screen.
        assert.deepEqual(models, [ { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', context: 200000, prompt: 3, completion: 15 } ]);
    } ],

    [ 'models that cannot answer with text are left out', async() =>
    {
        const models = readCatalog({ data: [
            { id: 'openai/text-embedding-3-small', architecture: { output_modalities: [ 'embeddings' ] } },
            { id: 'black-forest-labs/flux', architecture: { output_modalities: [ 'image' ] } },
            { id: 'openai/gpt-4o', architecture: { output_modalities: [ 'text' ] } },
            { id: 'google/gemini-3', architecture: { output_modalities: [ 'text', 'image' ] } },
            { id: 'legacy/no-architecture' }
        ] });

        // The entry with no architecture is kept: refusing everything an older
        // listing does not describe would be worse than one wrong suggestion.
        assert.deepEqual(models.map((entry) => entry.id), [ 'google/gemini-3', 'legacy/no-architecture', 'openai/gpt-4o' ]);
    } ],

    [ 'unusable prices and entries are dropped rather than passed through', async() =>
    {
        const models = readCatalog({ data: [
            { id: '' },
            null,
            'not an object',
            { name: 'no id at all' },
            { id: 'free/model', pricing: { prompt: '0', completion: '0' } },
            { id: 'variable/model', pricing: { prompt: '-1', completion: 'unknown' } }
        ] });

        assert.deepEqual(models.map((entry) => entry.id), [ 'free/model', 'variable/model' ]);

        // Never NaN: the response schema would drop it and leave the field undefined.
        for (const entry of models)
        {
            assert.equal(entry.prompt, 0);
            assert.equal(entry.completion, 0);
            assert.equal(entry.context, 0);
        }
    } ],

    [ 'a payload that is not a listing yields an empty catalog', async() =>
    {
        for (const payload of [ undefined, null, { }, { data: 'nope' }, { error: { code: 500 } } ])
        {
            assert.deepEqual(readCatalog(payload), [ ]);
        }
    } ],

    [ 'a reachable endpoint reports its model count', async() =>
    {
        await withFetch(json(200, listing), async(calls) =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o-mini'), { ok: true, models: 3, found: true });

            assert.equal(calls.length, 1);
            assert.equal(calls[0].url, `${ BASE }/models`);
            assert.equal(calls[0].auth, `Bearer ${ KEY }`);
        });
    } ],

    [ 'a model missing from the listing is reachable but not found', async() =>
    {
        await withFetch(json(200, listing), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'llama-3'), { ok: true, models: 3, found: false });
        });
    } ],

    [ 'a rejected key is reported as such', async() =>
    {
        for (const status of [ 401, 403 ])
        {
            await withFetch(json(status, { error: 'nope' }), async() =>
            {
                assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_KEY_REJECTED' });
            });
        }
    } ],

    [ 'a server error is an endpoint problem, not a key problem', async() =>
    {
        await withFetch(json(500, { error: 'boom' }), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_ENDPOINT_REJECTED' });
        });
    } ],

    [ 'a 200 that is not the compatible shape is rejected', async() =>
    {
        await withFetch(json(200, { models: [ 'a' ] }), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_RESPONSE_UNEXPECTED' });
        });
    } ],

    [ 'a body that is not json is rejected rather than thrown', async() =>
    {
        await withFetch(() => Promise.resolve(new Response('<html>502</html>', { status: 200 })), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_RESPONSE_UNEXPECTED' });
        });
    } ],

    [ 'a network failure is unreachable', async() =>
    {
        await withFetch(() => Promise.reject(new Error('getaddrinfo ENOTFOUND api.example.com')), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_UNREACHABLE' });
        });
    } ],

    [ 'a timeout is unreachable', async() =>
    {
        await withFetch(() => Promise.reject(new DOMException('aborted', 'TimeoutError')), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_UNREACHABLE' });
        });
    } ],

    [ 'malformed listing entries are skipped, not thrown on', async() =>
    {
        await withFetch(json(200, { data: [ null, 'x', { }, { id: 42 }, { id: 'gpt-4o' } ] }), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: true, models: 5, found: true });
        });
    } ],

    [ 'an empty key sends no authorization header at all', async() =>
    {
        await withFetch(json(200, listing), async(calls) =>
        {
            // A local endpoint that wants no key: `Bearer ` with nothing after
            // it is worse than sending nothing, and some servers reject it.
            assert.deepEqual(await probeModel(BASE, '', 'gpt-4o'), { ok: true, models: 3, found: true });

            assert.equal(calls.length, 1);
            assert.equal(calls[0].auth, null);
        });
    } ],

    [ 'no outcome carries the api key back to the caller', async() =>
    {
        const stubs = [
            json(200, { data: [ { id: `echo-${ KEY }` } ] }),
            json(401, { error: `bad key ${ KEY }` }),
            () => Promise.reject(new Error(`failed to reach ${ BASE }/models with ${ KEY }`))
        ];

        for (const stub of stubs)
        {
            await withFetch(stub, async() =>
            {
                const probe = await probeModel(BASE, KEY, 'gpt-4o');

                assert.equal(JSON.stringify(probe).includes(KEY), false, `key leaked: ${ JSON.stringify(probe) }`);
            });
        }
    } ]
];

let failed = 0;

for (const [ title, run ] of tests)
{
    try
    {
        await run();

        console.log(`  ok    ${ title }`);
    }
    catch (error)
    {
        failed += 1;

        console.log(`  FAIL  ${ title }`);
        console.log(`        ${ error instanceof Error ? error.message : String(error) }`);
    }
}

console.log(failed === 0 ? `\n${ tests.length } passed` : `\n${ failed } of ${ tests.length } failed`);

process.exit(failed === 0 ? 0 : 1);
