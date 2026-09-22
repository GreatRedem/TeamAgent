import assert from 'node:assert/strict';

import {
    freeCandidates,
    pickFree,
    REST_BUSY,
    REST_DOWN,
    REST_GONE,
    rest,
    restFor,
    wake,
} from '../routes/model/model.auto.js';
import type { CatalogModel } from '../routes/model/model.provider.js';
import { listingKey } from '../routes/model/model.service.js';

// Self-check for auto-free model switching and the stored-key listing rule. Run with:
// npx tsx --tsconfig backend/tsconfig.json backend/src/tests/model.auto.test.ts

const model = (id: string, context: number, price: number, tools = true): CatalogModel => ({
    id,
    name: id,
    context,
    prompt: price,
    completion: price,
    tools,
});

const catalog = [
    model('paid/large', 1_000_000, 3),
    model('free/small', 32_000, 0),
    model('free/large', 128_000, 0),
    model('free/no-tools', 256_000, 0, false),
];

// Only free models, tool-capable when the agent has tools, largest context first.
assert.deepEqual(
    freeCandidates(catalog, true).map((m) => m.id),
    ['free/large', 'free/small'],
);
assert.deepEqual(
    freeCandidates(catalog, false).map((m) => m.id),
    ['free/no-tools', 'free/large', 'free/small'],
);

// Picking: the first model neither tried this round nor resting.
{
    wake();
    const pool = freeCandidates(catalog, true);
    const now = 1_000_000;

    assert.equal(pickFree(pool, new Set(), now)?.id, 'free/large');
    assert.equal(pickFree(pool, new Set(['free/large']), now)?.id, 'free/small');

    rest('free/large', REST_BUSY, now);
    assert.equal(pickFree(pool, new Set(), now)?.id, 'free/small', 'a resting model is skipped');
    assert.equal(
        pickFree(pool, new Set(), now + REST_BUSY)?.id,
        'free/large',
        'a model is back once its rest is over',
    );

    // Everything resting: the one that wakes soonest, rather than no answer at all.
    rest('free/small', REST_GONE, now);
    assert.equal(pickFree(pool, new Set(), now)?.id, 'free/large');

    // Everything tried this round: nothing left.
    assert.equal(pickFree(pool, new Set(['free/large', 'free/small']), now), null);
    wake();
}

// Failures: the model's own problems switch; ones every model shares do not.
assert.equal(restFor(429, '', false), REST_BUSY, 'rate limited');
assert.equal(restFor(0, '', false), REST_DOWN, 'unreachable');
assert.equal(restFor(503, '', false), REST_DOWN, 'provider down');
assert.equal(restFor(404, '', false), REST_GONE, 'model gone');
assert.equal(restFor(400, 'No endpoints found for free/x', false), REST_GONE, 'no endpoint');
assert.equal(restFor(400, 'tools not supported', true), REST_GONE, 'refuses tools');
assert.equal(restFor(401, '', false), null, 'a rejected key is the same for every model');
assert.equal(restFor(402, '', false), null, 'no credit is the same for every model');
assert.equal(restFor(400, 'messages must not be empty', false), null, 'a bad request is ours');

// Listing with the stored key: only against the origin it was saved for.
{
    const stored = { base_url: 'https://api.example.com/v1', api_key: 'sk-stored' };

    assert.equal(listingKey('sk-typed', 'https://other.example/v1', stored), 'sk-typed');
    assert.equal(listingKey('', 'https://api.example.com/v2', stored), 'sk-stored');
    assert.equal(listingKey('', 'https://evil.example/v1', stored), '', 'never to another host');
    assert.equal(listingKey('', 'http://api.example.com/v1', stored), '', 'nor another scheme');
    assert.equal(listingKey('', 'https://api.example.com/v1', null), '');
}

console.log('model.auto: ok');
