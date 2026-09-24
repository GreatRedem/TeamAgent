import assert from 'node:assert/strict';
import { REST_BUSY, REST_DOWN, REST_GONE } from '../constant.js';

import {
    freeCandidates,
    freeQuotaUntil,
    isSetAside,
    judge,
    pickFree,
    pickNext,
    rest,
    setAside,
    wake,
} from '../routes/model/model.auto.js';
import type { CatalogModel } from '../routes/model/model.provider.js';
import { listingKey } from '../routes/model/model.service.js';

function main() {
    const model = (
        id: string,
        rank: number,
        context: number,
        price: number,
        tools = true,
        text = true,
    ): CatalogModel => ({
        id,
        name: id,
        context,
        prompt: price,
        completion: price,
        tools,
        text,
        rank,
    });

    const catalog = [
        model('paid/large', 0, 1_000_000, 3),
        model('free/small', 1, 32_000, 0),
        model('free/large', 4, 128_000, 0),
        model('free/no-tools', 2, 256_000, 0, false),
        model('free/image-maker', 3, 512_000, 0, true, false),
    ];

    assert.deepEqual(
        freeCandidates(catalog, true).map((m) => m.id),
        ['free/small', 'free/large'],
        'the most used free model first, tool-capable when tools are needed',
    );
    assert.deepEqual(
        freeCandidates(catalog, false).map((m) => m.id),
        ['free/small', 'free/no-tools', 'free/large'],
        'text generation only: the image model never comes back',
    );

    {
        wake();
        const pool = freeCandidates(catalog, true);
        const now = 1_000_000;

        assert.equal(pickFree(pool, new Set(), now)?.id, 'free/small');
        assert.equal(pickFree(pool, new Set(['free/small']), now)?.id, 'free/large');

        rest('free/small', REST_BUSY, now);
        assert.equal(pickFree(pool, new Set(), now)?.id, 'free/large', 'a resting model waits');
        assert.equal(
            pickFree(pool, new Set(), now + REST_BUSY)?.id,
            'free/small',
            'it is back once its rest is over',
        );

        rest('free/large', REST_GONE, now);
        assert.equal(
            pickFree(pool, new Set(), now),
            null,
            'a limited model is out of the rotation until its limit ends',
        );

        wake();
        setAside('model:7:gpt-x', { kind: 'rest', until: now + REST_DOWN });
        setAside('free/small', { kind: 'quota', until: now + 3_600_000 });
        assert.equal(
            pickNext(
                [
                    { id: 'gpt-x', key: 'model:7:gpt-x' },
                    { id: 'glm', key: 'model:7:glm' },
                ],
                new Set(),
                now,
            )?.id,
            'glm',
            'an endpoint model is set aside under its own key, and the free quota is not its concern',
        );
        assert.equal(
            pickNext([{ id: 'gpt-x', key: 'model:8:gpt-x' }], new Set(), now)?.id,
            'gpt-x',
            'the same model id on another saved model is unaffected',
        );

        wake();
        setAside('model:7', { kind: 'rest', until: now + REST_BUSY });
        assert.equal(isSetAside('model:7', now), true, 'a failed fixed model is skipped');
        assert.equal(isSetAside('model:8', now), false, 'only that model row');
        assert.equal(isSetAside('model:7', now + REST_BUSY), false, 'and it comes back');

        wake();
        setAside('free/small', { kind: 'hide', until: now + 60_000 });
        assert.equal(pickFree(pool, new Set(), now)?.id, 'free/large', 'a hidden model is gone');
        setAside('free/large', { kind: 'hide', until: now + 60_000 });
        assert.equal(pickFree(pool, new Set(), now), null, 'hidden models are never a last resort');
        assert.equal(pickFree(pool, new Set(), now + 60_000)?.id, 'free/small', 'back after reset');

        wake();
        setAside('free/small', { kind: 'quota', until: now + 3_600_000 });
        assert.equal(
            pickFree(pool, new Set(), now),
            null,
            'no free model while the quota is spent',
        );
        assert.equal(freeQuotaUntil(now), now + 3_600_000);
        assert.equal(pickFree(pool, new Set(), now + 3_600_000)?.id, 'free/small');
        wake();
    }

    {
        const now = Date.parse('2026-09-23T10:00:00.000Z');
        const perDay = (headers: object) => ({
            error: {
                message: 'Rate limit exceeded: free-models-per-day.',
                metadata: { headers },
            },
        });

        assert.deepEqual(judge(429, perDay({ 'X-RateLimit-Reset': '1790208000000' }), false, now), {
            kind: 'quota',
            until: 1790208000000,
        });
        assert.deepEqual(judge(429, perDay({}), false, now), {
            kind: 'quota',
            until: Date.parse('2026-09-24T00:00:00.000Z'),
        });
        assert.deepEqual(judge(429, { error: { message: 'rate limited upstream' } }, false, now), {
            kind: 'rest',
            until: now + REST_BUSY,
        });
        assert.deepEqual(
            judge(
                429,
                {
                    error: {
                        message: 'rate limited',
                        metadata: { headers: { 'X-RateLimit-Reset': String(now / 1000 + 600) } },
                    },
                },
                false,
                now,
            ),
            { kind: 'rest', until: now + 600_000 },
            'a limit that says when it ends is kept until then, in seconds or milliseconds',
        );
        assert.deepEqual(judge(402, {}, false, now), { kind: 'hide', until: now + REST_GONE });
        assert.deepEqual(judge(404, {}, false, now), { kind: 'hide', until: now + REST_GONE });
        assert.deepEqual(
            judge(400, { error: { message: 'No endpoints found for free/x' } }, false, now),
            { kind: 'hide', until: now + REST_GONE },
        );
        assert.deepEqual(judge(400, {}, true, now), { kind: 'hide', until: now + REST_GONE });
        assert.deepEqual(judge(503, {}, false, now), { kind: 'rest', until: now + REST_DOWN });
        assert.deepEqual(judge(0, {}, false, now), { kind: 'rest', until: now + REST_DOWN });
        assert.deepEqual(
            judge(403, { error: { message: 'forbidden' } }, false, now),
            { kind: 'rest', until: now + REST_DOWN },
            'a forbidden model hands over to the next',
        );
        assert.deepEqual(judge(413, {}, false, now), { kind: 'rest', until: now + REST_DOWN });
        assert.equal(
            judge(401, {}, false, now),
            null,
            'a rejected key is the same for every model',
        );
        assert.equal(
            judge(400, { error: { message: 'messages must not be empty' } }, false, now),
            null,
            'a bad request is ours',
        );
    }

    {
        const stored = { base_url: 'https://api.example.com/v1', api_key: 'sk-stored' };

        assert.equal(listingKey('sk-typed', 'https://other.example/v1', stored), 'sk-typed');
        assert.equal(listingKey('', 'https://api.example.com/v2', stored), 'sk-stored');
        assert.equal(
            listingKey('', 'https://evil.example/v1', stored),
            '',
            'never to another host',
        );
        assert.equal(listingKey('', 'http://api.example.com/v1', stored), '', 'nor another scheme');
        assert.equal(listingKey('', 'https://api.example.com/v1', null), '');
    }

    console.log('model.auto: ok');
}

main();
