import assert from 'node:assert/strict';

import { readInboundMessage } from './telegram.service.js';

const pm = (overrides: Record<string, unknown> = {}, from: Record<string, unknown> = {}) => ({
    update_id: 812490001,
    message: {
        message_id: 42,
        from: {
            id: 7123456789012345,
            is_bot: false,
            first_name: 'Sara',
            last_name: 'K',
            username: 'sara_k',
            language_code: 'fa',
            ...from,
        },
        chat: { id: 7123456789012345, type: 'private', first_name: 'Sara' },
        date: 1_700_000_000,
        text: 'hello there',
        ...overrides,
    },
});

const tests: Array<[string, () => void]> = [
    [
        'a private message is parsed',
        () => {
            const inbound = readInboundMessage(pm());

            assert.ok(inbound);
            assert.equal(inbound.text, 'hello there');
            assert.equal(inbound.updateId, '812490001');
            assert.equal(inbound.from.username, 'sara_k');
            assert.equal(inbound.from.firstName, 'Sara');
            assert.equal(inbound.from.languageCode, 'fa');
            assert.equal(inbound.sentAt.toISOString(), new Date(1_700_000_000_000).toISOString());
        },
    ],

    [
        'a large telegram id keeps full precision as a string',
        () => {
            const inbound = readInboundMessage(pm());

            assert.equal(inbound?.from.id, '7123456789012345');
            assert.equal(inbound?.chatId, '7123456789012345');
        },
    ],

    [
        'a group message is ignored',
        () => {
            assert.equal(
                readInboundMessage(pm({ chat: { id: -100123, type: 'group', title: 'Team' } })),
                undefined,
            );
        },
    ],

    [
        'a supergroup message is ignored',
        () => {
            assert.equal(
                readInboundMessage(
                    pm({ chat: { id: -100123, type: 'supergroup', title: 'Team' } }),
                ),
                undefined,
            );
        },
    ],

    [
        'another bot is ignored',
        () => {
            assert.equal(readInboundMessage(pm({}, { is_bot: true })), undefined);
        },
    ],

    [
        'a message with no text (a photo) is ignored',
        () => {
            const update = pm();

            delete (update.message as Record<string, unknown>)['text'];

            assert.equal(readInboundMessage(update), undefined);
        },
    ],

    [
        'an empty text is ignored',
        () => {
            assert.equal(readInboundMessage(pm({ text: '' })), undefined);
        },
    ],

    [
        'an update with no message (an edit) is ignored',
        () => {
            assert.equal(
                readInboundMessage({ update_id: 1, edited_message: { text: 'x' } }),
                undefined,
            );
        },
    ],

    [
        'a body that is not an update is ignored',
        () => {
            for (const body of [undefined, null, 'string', 42, [], {}]) {
                assert.equal(
                    readInboundMessage(body),
                    undefined,
                    `accepted ${JSON.stringify(body)}`,
                );
            }
        },
    ],

    [
        'missing name fields become empty strings, not undefined',
        () => {
            const inbound = readInboundMessage(
                pm({}, { username: undefined, last_name: undefined, language_code: undefined }),
            );

            assert.ok(inbound);
            assert.equal(inbound.from.username, '');
            assert.equal(inbound.from.lastName, '');
            assert.equal(inbound.from.languageCode, '');
        },
    ],

    [
        'a hostile oversized name is truncated to the column width',
        () => {
            const inbound = readInboundMessage(
                pm(
                    { text: 'x'.repeat(20000) },
                    { first_name: 'A'.repeat(5000), username: 'b'.repeat(500) },
                ),
            );

            assert.ok(inbound);
            assert.equal(inbound.from.firstName.length, 128);
            assert.equal(inbound.from.username.length, 64);
            assert.equal(inbound.text.length, 8192);
        },
    ],

    [
        'a missing date falls back to now rather than the epoch',
        () => {
            const update = pm();

            delete (update.message as Record<string, unknown>)['date'];

            const inbound = readInboundMessage(update);

            assert.ok(inbound);
            assert.ok(
                Date.now() - inbound.sentAt.getTime() < 5000,
                `got ${inbound.sentAt.toISOString()}`,
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
