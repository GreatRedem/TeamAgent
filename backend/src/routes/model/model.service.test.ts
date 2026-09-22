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
import { AGENTROUTER_URL, OPENROUTER_URL, PROVIDERS, readCatalog, readContextLength } from './model.provider.js';

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
    [ 'every provider preset is usable by the add form', async() =>
    {
        assert.ok(PROVIDERS.length >= 2);

        for (const preset of PROVIDERS)
        {
            assert.notEqual(preset.key, '', 'a preset with no key cannot be selected');
            assert.notEqual(preset.label, '', `${ preset.key } has no label`);

            // A blank url means "type your own"; anything else has to be a url
            // the base-url check would accept.
            if (preset.url !== '')
            {
                assert.doesNotThrow(() => new URL(preset.url), `${ preset.key } url is not parseable`);
                assert.ok(/^https?:$/.test(new URL(preset.url).protocol), `${ preset.key } is not http(s)`);
            }
        }

        const keys = PROVIDERS.map((preset) => preset.key);

        assert.equal(new Set(keys).size, keys.length, `duplicate provider key in ${ keys.join(', ') }`);
        assert.ok(keys.includes('agentrouter'), 'agentrouter is missing');
        assert.equal(keys.includes('9router'), false, '9router was not fully removed');
    } ],

    [ 'only a listing that is the same for everyone is catalogued', async() =>
    {
        // The catalog route is not team-scoped and caches in process, so a
        // provider whose listing depends on the caller's key or plan must not
        // be served from it -- one team's answer would be handed to another.
        // Everything else is either probed with the caller's own key or served
        // from the names it documents.
        for (const preset of PROVIDERS.filter((candidate) => candidate.catalog))
        {
            assert.equal(preset.url, OPENROUTER_URL, `${ preset.key } claims a catalog that is not fetched`);
        }
    } ],

    [ 'a plain http preset is loopback, which is all readBaseUrl allows', async() =>
    {
        // A hosted provider must never be plain http: the key travels on that
        // request. `readBaseUrl` permits http only for loopback, so a preset
        // that is not loopback and not https would be rejected on save anyway.
        for (const preset of PROVIDERS.filter((candidate) => candidate.url.startsWith('http://')))
        {
            const host = new URL(preset.url).hostname;

            assert.ok([ 'localhost', '127.0.0.1', '::1', '[::1]' ].includes(host), `${ preset.key } sends a key in clear text to ${ host }`);
        }

        assert.ok(AGENTROUTER_URL.startsWith('https://'), AGENTROUTER_URL);
    } ],

    [ 'a provider that serves no listing still offers models to pick from', async() =>
    {
        // AgentRouter documents its models rather than publishing /v1/models,
        // so without these the add form would have nothing to suggest and the
        // window would fall back to a default far below what it actually holds.
        const agentrouter = PROVIDERS.find((preset) => preset.key === 'agentrouter');

        assert.ok(agentrouter);
        assert.equal(agentrouter.catalog, false, 'its listing is not the same for everyone');
        assert.ok(agentrouter.models.length > 0, 'nothing to suggest for a provider with no listing');
        assert.ok(agentrouter.models.some((entry) => entry.id === 'gpt-5.5'));

        // Its Claude models answer on Anthropic's protocol at the bare origin,
        // not on the OpenAI-compatible root this codebase talks to.
        assert.equal(agentrouter.models.some((entry) => entry.id.startsWith('claude')), false, 'a model this url cannot reach was suggested');
    } ],

    [ 'a documented model never claims a window it was not given', async() =>
    {
        for (const preset of PROVIDERS)
        {
            for (const entry of preset.models)
            {
                assert.notEqual(entry.id, '', `${ preset.key } lists a nameless model`);
                assert.ok(Number.isInteger(entry.context) && entry.context >= 0, `${ preset.key }/${ entry.id } has a nonsense window`);
            }
        }
    } ],

    [ 'a context window is read from whichever field the server uses', async() =>
    {
        // There is no field for this in the OpenAI spec, so every compatible
        // server invented its own. These are the names they actually send.
        const cases: Array<[ unknown, number ]> = [
            [ { context_length: 200000 }, 200000 ],                 // OpenRouter, Together
            [ { max_model_len: 32768 }, 32768 ],                    // vLLM
            [ { max_context_length: 8192 }, 8192 ],                 // LM Studio
            [ { context_window: 16384 }, 16384 ],                   // assorted gateways
            [ { meta: { n_ctx_train: 4096 } }, 4096 ],              // llama.cpp
            [ { id: 'plain', owned_by: 'openai' }, 0 ],             // the spec shape says nothing
            [ { context_length: -1 }, 0 ],                          // a placeholder, not a window
            [ { context_length: 'lots' }, 0 ],
            [ { context_length: 1.5 }, 0 ],
            [ null, 0 ],
            [ 'nonsense', 0 ]
        ];

        for (const [ entry, expected ] of cases)
        {
            assert.equal(readContextLength(entry), expected, JSON.stringify(entry));
        }
    } ],

    [ 'a probe reports the window the endpoint declares for that model', async() =>
    {
        await withFetch(json(200, { data: [ { id: 'other', max_model_len: 999 }, { id: 'gpt-4o-mini', max_model_len: 32768 } ] }), async() =>
        {
            const probe = await probeModel('https://api.example.com/v1', 'k'.repeat(12), 'gpt-4o-mini');

            // The matched model's window, not the first one in the listing.
            assert.equal(probe.context, 32768);
            assert.equal(probe.found, true);
        });
    } ],

    [ 'an endpoint that publishes no window reports zero, not a guess', async() =>
    {
        await withFetch(json(200, listing), async() =>
        {
            assert.equal((await probeModel('https://api.example.com/v1', '', 'gpt-4o-mini')).context ?? 0, 0);
        });
    } ],

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
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o-mini'), { ok: true, models: 3, found: true, ids: [ 'gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small' ] });

            assert.equal(calls.length, 1);
            assert.equal(calls[0].url, `${ BASE }/models`);
            assert.equal(calls[0].auth, `Bearer ${ KEY }`);
        });
    } ],

    [ 'a model missing from the listing is reachable but not found', async() =>
    {
        await withFetch(json(200, listing), async() =>
        {
            assert.deepEqual(await probeModel(BASE, KEY, 'llama-3'), { ok: true, models: 3, found: false, ids: [ 'gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small' ] });
        });
    } ],

    [ 'a refused client is not reported as a bad key', async() =>
    {
        // A provider that admits only certain client applications answers 401
        // for everything else. Reporting that as a bad key sends someone to
        // re-paste a credential that was working -- observed against a real
        // provider whose body carries type `unauthorized_client_error`.
        const bodies = [
            { type: 'unauthorized_client_error', message: 'UNAUTHENTICATED' },
            { error: { type: 'unauthorized_client_error' } }
        ];

        for (const body of bodies)
        {
            await withFetch(json(401, body), async() =>
            {
                assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_CLIENT_REJECTED' });
            });
        }
    } ],

    [ 'a 401 that says nothing about the client is still a bad key', async() =>
    {
        for (const body of [ { error: { message: 'invalid api key' } }, { }, 'not json at all' ])
        {
            await withFetch(json(401, body), async() =>
            {
                assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: false, reason: 'MODEL_KEY_REJECTED' });
            });
        }
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
            assert.deepEqual(await probeModel(BASE, KEY, 'gpt-4o'), { ok: true, models: 5, found: true, ids: [ 'gpt-4o' ] });
        });
    } ],

    [ 'an empty key sends no authorization header at all', async() =>
    {
        await withFetch(json(200, listing), async(calls) =>
        {
            // A local endpoint that wants no key: `Bearer ` with nothing after
            // it is worse than sending nothing, and some servers reject it.
            assert.deepEqual(await probeModel(BASE, '', 'gpt-4o'), { ok: true, models: 3, found: true, ids: [ 'gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small' ] });

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
