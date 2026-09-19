/**
 * Self-check for the Telegram probe. There is no test framework in this repo;
 * run it directly:
 *
 *     cd backend && npx tsx src/routes/team/team.service.test.ts
 *
 * It stubs `fetch`, so it never reaches the network and needs no bot token. It
 * does read `.env`, because importing the service pulls in `utils/config.ts`,
 * which throws on a missing variable at import time.
 */

/* eslint-disable no-console -- this file is a CLI self-check; its output is the report. */

import assert from 'node:assert/strict';

import { probeTelegram } from './team.service.js';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

const realFetch = globalThis.fetch;

/** Runs `probeTelegram` against a canned response, capturing the url it built. */
async function withFetch(stub: () => Promise<Response> | never, run: (urls: string[]) => Promise<void>)
{
    const urls: string[] = [ ];

    // Typed off the global rather than naming `RequestInfo`, which the backend
    // tsconfig does not pull in (`types: ["node"]`, no DOM lib).
    globalThis.fetch = ((input: Parameters<typeof globalThis.fetch>[0]) =>
    {
        urls.push(String(input));

        return stub() as Promise<Response>;
    }) as typeof globalThis.fetch;

    try
    {
        await run(urls);
    }
    finally
    {
        globalThis.fetch = realFetch;
    }
}

const json = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const tests: Array<[ string, () => Promise<void> ]> = [
    [ 'a live bot reports its username', async() =>
    {
        await withFetch(json(200, { ok: true, result: { username: 'support_bot' } }), async(urls) =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: true, username: 'support_bot' });

            // getMe on the token, and nothing else.
            assert.equal(urls.length, 1);
            assert.equal(urls[0], `https://api.telegram.org/bot${ TOKEN }/getMe`);
        });
    } ],

    [ 'a live bot without a username still passes', async() =>
    {
        await withFetch(json(200, { ok: true, result: { } }), async() =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: true, username: '' });
        });
    } ],

    [ 'a revoked token (401) is rejected', async() =>
    {
        await withFetch(json(401, { ok: false, description: 'Unauthorized' }), async() =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: false, reason: 'BOT_TOKEN_REJECTED' });
        });
    } ],

    [ 'an unknown token (404) is rejected', async() =>
    {
        await withFetch(json(404, { ok: false }), async() =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: false, reason: 'BOT_TOKEN_REJECTED' });
        });
    } ],

    [ 'a 200 carrying ok:false is rejected', async() =>
    {
        await withFetch(json(200, { ok: false }), async() =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: false, reason: 'BOT_TOKEN_REJECTED' });
        });
    } ],

    [ 'a body that is not json is rejected rather than thrown', async() =>
    {
        await withFetch(() => Promise.resolve(new Response('<html>502</html>', { status: 502 })), async() =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: false, reason: 'BOT_TOKEN_REJECTED' });
        });
    } ],

    [ 'a network failure is unreachable, not rejected', async() =>
    {
        await withFetch(() => Promise.reject(new Error('getaddrinfo ENOTFOUND api.telegram.org')), async() =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: false, reason: 'BOT_UNREACHABLE' });
        });
    } ],

    [ 'a timeout is unreachable', async() =>
    {
        await withFetch(() => Promise.reject(new DOMException('The operation was aborted', 'TimeoutError')), async() =>
        {
            assert.deepEqual(await probeTelegram(TOKEN), { ok: false, reason: 'BOT_UNREACHABLE' });
        });
    } ],

    [ 'no outcome carries the token back to the caller', async() =>
    {
        const stubs = [
            json(200, { ok: true, result: { username: 'support_bot' } }),
            json(401, { ok: false, description: `Unauthorized for ${ TOKEN }` }),
            () => Promise.reject(new Error(`failed to reach https://api.telegram.org/bot${ TOKEN }/getMe`))
        ];

        for (const stub of stubs)
        {
            await withFetch(stub, async() =>
            {
                const probe = await probeTelegram(TOKEN);

                // Telegram echoing the token, or an error naming the url, must
                // not end up in the payload the client receives.
                assert.equal(JSON.stringify(probe).includes(TOKEN), false, `token leaked: ${ JSON.stringify(probe) }`);
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
