import assert from 'node:assert/strict';

import {
    DEFAULT_PERMISSIONS,
    hasPermission,
    isKnownPermission,
    PERMISSIONS,
    parsePermissions,
    serializePermissions,
} from '../routes/telegram/telegram.permission.js';

const tests: Array<[string, () => void]> = [
    [
        'an empty column grants nothing, rather than everything',
        () => {
            assert.deepEqual(parsePermissions(''), []);
            assert.equal(hasPermission('', 'chat'), false);
            assert.equal(hasPermission('', 'model'), false);
        },
    ],

    [
        'granted keys round-trip',
        () => {
            const stored = serializePermissions(['chat', 'model']);

            assert.deepEqual(parsePermissions(stored), ['chat', 'model']);
            assert.equal(hasPermission(stored, 'chat'), true);
            assert.equal(hasPermission(stored, 'model'), true);
        },
    ],

    [
        'one permission does not imply another',
        () => {
            const stored = serializePermissions(['chat']);

            assert.equal(hasPermission(stored, 'chat'), true);
            assert.equal(hasPermission(stored, 'model'), false);
        },
    ],

    [
        "storage order is the catalog order, not the caller's",
        () => {
            assert.equal(
                serializePermissions(['model', 'chat']),
                serializePermissions(['chat', 'model']),
            );
        },
    ],

    [
        'duplicates collapse',
        () => {
            assert.equal(serializePermissions(['chat', 'chat', 'chat']), 'chat');
        },
    ],

    [
        'unknown keys never survive serialisation',
        () => {
            assert.equal(serializePermissions(['chat', 'admin', 'root']), 'chat');
            assert.equal(isKnownPermission('admin'), false);
        },
    ],

    [
        'unknown keys already in a row are ignored on read',
        () => {
            assert.deepEqual(parsePermissions('chat,retired_permission'), ['chat']);
        },
    ],

    [
        'whitespace and empty segments are tolerated',
        () => {
            assert.deepEqual(parsePermissions(' chat , , model '), ['chat', 'model']);
        },
    ],

    [
        'the default grant is chat only',
        () => {
            assert.deepEqual(DEFAULT_PERMISSIONS, ['chat']);

            const stored = serializePermissions(DEFAULT_PERMISSIONS);

            assert.equal(hasPermission(stored, 'chat'), true);
            assert.equal(
                hasPermission(stored, 'model'),
                false,
                'a new profile must not reach the model by default',
            );
        },
    ],

    [
        'the whole catalog fits the column',
        () => {
            const everything = serializePermissions(PERMISSIONS.map((p) => p.key));

            assert.ok(everything.length < 512, `catalog serialises to ${everything.length} chars`);
            assert.deepEqual(
                parsePermissions(everything),
                PERMISSIONS.map((p) => p.key),
            );
        },
    ],
];

let failed = 0;

for (const [title, run] of tests) {
    try {
        run();

        console.log(`  ok    ${title}`);
    } catch (error) {
        failed += 1;

        console.log(`  FAIL  ${title}`);
        console.log(`        ${error instanceof Error ? error.message : String(error)}`);
    }
}

console.log(failed === 0 ? `\n${tests.length} passed` : `\n${failed} of ${tests.length} failed`);

process.exit(failed === 0 ? 0 : 1);
