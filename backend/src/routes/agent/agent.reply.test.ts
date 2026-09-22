/* eslint-disable no-console -- this file is a CLI self-check; its output is the report. */

import assert from 'node:assert/strict';

import {
    ALWAYS_INLINE,
    DEFAULT_CONTEXT_TOKENS,
    DOCUMENT_INLINE_MAX,
    ERROR_TEXT_MAX,
    HISTORY_LIMIT,
    MAX_COMPLETION_TOKENS,
    TELEGRAM_TEXT_MAX,
    buildMessages,
    buildSystemPrompt,
    completionCap,
    contextBudget,
    earlierTurns,
    fitToContext,
    isToolRefusal,
    readCompletion,
    readError,
} from './agent.reply.js';

const docs = [
    { name: 'knowledge.md', content: '# Knowledge\nFacts.' },
    { name: 'guardrails.md', content: '# Guardrails\nLimits.' },
    { name: 'instructions.md', content: '# Instructions\nBe terse.' },
];

const tests: Array<[string, () => void]> = [
    [
        'history comes back oldest-first without the message being answered',
        () => {
            const rows = [
                { id: 3, direction: 'in', text: 'three' },
                { id: 2, direction: 'out', text: 'two' },
                { id: 1, direction: 'in', text: 'one' },
            ];

            assert.deepEqual(
                earlierTurns(rows, 3).map((m) => m.text),
                ['one', 'two'],
            );
        },
    ],

    [
        'a message that arrived while the reply was composing is kept',
        () => {
            const rows = [
                { id: 9, direction: 'in', text: 'and also this' },
                { id: 8, direction: 'in', text: 'answer me' },
                { id: 7, direction: 'out', text: 'earlier reply' },
            ];

            const earlier = earlierTurns(rows, 8);

            assert.deepEqual(
                earlier.map((m) => m.text),
                ['earlier reply', 'and also this'],
            );
            assert.equal(
                earlier.some((m) => m.id === 8),
                false,
                'the answered message was replayed',
            );
        },
    ],

    [
        'the answered message is removed wherever it sits',
        () => {
            const rows = [
                { id: 5, direction: 'in', text: 'e' },
                { id: 4, direction: 'in', text: 'd' },
                { id: 3, direction: 'in', text: 'c' },
            ];

            for (const id of [3, 4, 5]) {
                assert.equal(earlierTurns(rows, id).length, 2, `id ${id} not removed`);
                assert.equal(
                    earlierTurns(rows, id).some((m) => m.id === id),
                    false,
                );
            }
        },
    ],

    [
        'an id that is not in the window leaves the history intact',
        () => {
            const rows = [
                { id: 3, direction: 'in', text: 'c' },
                { id: 2, direction: 'in', text: 'b' },
            ];

            assert.deepEqual(
                earlierTurns(rows, 99).map((m) => m.text),
                ['b', 'c'],
            );
        },
    ],

    [
        'the rows handed in are not reordered in place',
        () => {
            const rows = [
                { id: 2, direction: 'in', text: 'b' },
                { id: 1, direction: 'in', text: 'a' },
            ];

            earlierTurns(rows, 2);

            assert.deepEqual(
                rows.map((m) => m.id),
                [2, 1],
            );
        },
    ],

    [
        'instructions.md leads the system prompt',
        () => {
            const prompt = buildSystemPrompt(docs);

            assert.ok(prompt.startsWith('# Instructions'), prompt.slice(0, 40));
            assert.ok(
                prompt.indexOf('# Guardrails') < prompt.indexOf('# Knowledge'),
                'the rest follow in name order',
            );
        },
    ],

    [
        'prompt order does not depend on row order',
        () => {
            assert.equal(buildSystemPrompt(docs), buildSystemPrompt([...docs].reverse()));
        },
    ],

    [
        'a deferred document is listed by name instead of being sent',
        () => {
            const big = 'x'.repeat(DOCUMENT_INLINE_MAX + 1);
            const prompt = buildSystemPrompt([...docs, { name: 'manual.md', content: big }], true);

            assert.ok(!prompt.includes(big), 'the body was sent anyway');
            assert.ok(prompt.includes('manual.md'), 'the name was not listed');
            assert.ok(prompt.includes('document_read'), 'nothing told the model how to open it');
            assert.ok(prompt.includes(String(big.length)), 'the size was not given');
        },
    ],

    [
        'instructions and guardrails are sent however large they are',
        () => {
            const bulky = ALWAYS_INLINE.map((name) => ({
                name,
                content: `# ${name}\n${'y'.repeat(DOCUMENT_INLINE_MAX * 2)}`,
            }));
            const prompt = buildSystemPrompt(bulky, true);

            for (const document of bulky) {
                assert.ok(prompt.includes(document.content), `${document.name} was deferred`);
            }

            assert.ok(
                !prompt.includes('# Your reference files'),
                'nothing was deferred, so there is no list',
            );
        },
    ],

    [
        'a short document is sent rather than deferred',
        () => {
            const prompt = buildSystemPrompt([{ name: 'note.md', content: 'Short.' }], true);

            assert.equal(prompt, 'Short.');
        },
    ],

    [
        'lazy is off by default, so every document is still sent',
        () => {
            const big = [{ name: 'manual.md', content: 'z'.repeat(DOCUMENT_INLINE_MAX + 1) }];

            assert.ok(buildSystemPrompt(big).includes('z'.repeat(DOCUMENT_INLINE_MAX + 1)));
            assert.ok(!buildSystemPrompt(big).includes('document_read'));
        },
    ],

    [
        'a conversation that fits is left alone',
        () => {
            const messages = [
                { role: 'system' as const, content: 'You are terse.' },
                { role: 'user' as const, content: 'hello' },
                { role: 'assistant' as const, content: 'hi' },
                { role: 'user' as const, content: 'again' },
            ];

            assert.deepEqual(fitToContext(messages, 128_000), messages);
        },
    ],

    [
        'history is dropped oldest-first to fit the window',
        () => {
            const filler = (at: number) => ({
                role: 'user' as const,
                content: `${at}:${'x'.repeat(8000)}`,
            });

            const messages = [
                { role: 'system' as const, content: 'SYSTEM' },
                filler(1),
                filler(2),
                filler(3),
                filler(4),
                { role: 'user' as const, content: 'the question' },
            ];

            const fitted = fitToContext(messages, 8192);

            assert.ok(fitted.length < messages.length, 'nothing was trimmed');
            assert.equal(fitted[0].content, 'SYSTEM', 'the system prompt was dropped');
            assert.equal(
                fitted[fitted.length - 1].content,
                'the question',
                'the turn being answered was dropped',
            );

            const kept = fitted.slice(1, -1).map((message) => message.content.split(':')[0]);

            assert.deepEqual(kept, kept.slice().sort(), 'order was not preserved');
            assert.ok(
                !kept.includes('1'),
                'the oldest turn survived while newer ones were dropped',
            );
        },
    ],

    [
        'the trimmed result actually fits the budget',
        () => {
            const filler = () => ({ role: 'user' as const, content: 'x'.repeat(4000) });

            for (const window of [2048, 4096, 8192, 32_000]) {
                const messages = [
                    { role: 'system' as const, content: 'S'.repeat(2000) },
                    filler(),
                    filler(),
                    filler(),
                    filler(),
                    filler(),
                    { role: 'user' as const, content: 'the question' },
                ];

                const total = fitToContext(messages, window).reduce(
                    (sum, message) => sum + Math.ceil(message.content.length / 4) + 4,
                    0,
                );

                assert.ok(
                    total <= contextBudget(window),
                    `window ${window}: ${total} > ${contextBudget(window)}`,
                );
                assert.ok(
                    contextBudget(window) + completionCap(window) <= window,
                    `window ${window}: budget plus reply overruns`,
                );
            }
        },
    ],

    [
        'a tool result is never left without the call it answers',
        () => {
            const messages = [
                { role: 'system' as const, content: 'S' },
                { role: 'assistant' as const, content: '', tool_calls: [{ id: 'a' }] },
                { role: 'tool' as const, tool_call_id: 'a', content: 'y'.repeat(20_000) },
                { role: 'tool' as const, tool_call_id: 'b', content: 'z'.repeat(20_000) },
                { role: 'user' as const, content: 'and now?' },
            ];

            const fitted = fitToContext(messages, 4096);

            assert.equal(
                fitted.some((message) => message.role === 'tool'),
                false,
                'an orphan tool result survived',
            );
        },
    ],

    [
        'a prompt too large for the window on its own is cut, not sent',
        () => {
            const messages = [
                { role: 'system' as const, content: 'S'.repeat(200_000) },
                { role: 'user' as const, content: 'the question' },
            ];

            const fitted = fitToContext(messages, 8192);
            const total = fitted.reduce(
                (sum, message) => sum + Math.ceil(message.content.length / 4) + 4,
                0,
            );

            assert.ok(total <= contextBudget(8192), `${total} > ${contextBudget(8192)}`);
            assert.equal(
                fitted[fitted.length - 1].content,
                'the question',
                'the question was cut instead of the prompt',
            );
        },
    ],

    [
        'an unrecorded window falls back to the conservative default',
        () => {
            assert.equal(contextBudget(0), contextBudget(DEFAULT_CONTEXT_TOKENS));
            assert.equal(completionCap(0), completionCap(DEFAULT_CONTEXT_TOKENS));
        },
    ],

    [
        'a small model never asks for a reply it cannot afford',
        () => {
            for (const window of [512, 1024, 2048, 4096, 8192, 200_000]) {
                assert.ok(completionCap(window) <= Math.max(256, window / 2), `window ${window}`);
                assert.ok(
                    completionCap(window) <= MAX_COMPLETION_TOKENS,
                    `window ${window} exceeded the ceiling`,
                );
            }
        },
    ],

    [
        'empty documents are dropped, not joined as blanks',
        () => {
            const prompt = buildSystemPrompt([
                { name: 'a.md', content: '   ' },
                { name: 'instructions.md', content: 'Hi.' },
            ]);

            assert.equal(prompt, 'Hi.');
        },
    ],

    [
        'an agent with no documents yields no system message',
        () => {
            const messages = buildMessages(buildSystemPrompt([]), [], 'hello');

            assert.deepEqual(messages, [{ role: 'user', content: 'hello' }]);
        },
    ],

    [
        "the agent's own replies come back as assistant, not user",
        () => {
            const messages = buildMessages(
                'S',
                [
                    { direction: 'in', text: 'hi' },
                    { direction: 'out', text: 'hello' },
                ],
                'again',
            );

            assert.deepEqual(
                messages.map((m) => m.role),
                ['system', 'user', 'assistant', 'user'],
            );
            assert.equal(messages[3].content, 'again');
        },
    ],

    [
        'history is capped and keeps the most recent turns',
        () => {
            const history = Array.from({ length: 40 }, (_, i) => ({
                direction: 'in',
                text: `m${i}`,
            }));

            const messages = buildMessages('S', history, 'now');

            assert.equal(messages.length, 1 + HISTORY_LIMIT + 1);
            assert.equal(messages[1].content, 'm28', 'oldest kept turn');
            assert.equal(messages[messages.length - 1].content, 'now');
        },
    ],

    [
        'a normal completion is read',
        () => {
            assert.equal(
                readCompletion({ choices: [{ message: { content: '  Hello there  ' } }] }),
                'Hello there',
            );
        },
    ],

    [
        'unusable completions return undefined rather than throwing',
        () => {
            for (const payload of [
                undefined,
                null,
                'text',
                42,
                {},
                { choices: [] },
                { choices: [{}] },
                { choices: [{ message: {} }] },
                { choices: [{ message: { content: '' } }] },
                { choices: [{ message: { content: '   ' } }] },
                { choices: [{ message: { content: 42 } }] },
            ]) {
                assert.equal(
                    readCompletion(payload),
                    undefined,
                    `accepted ${JSON.stringify(payload)}`,
                );
            }
        },
    ],

    [
        'an overlong completion is cut to what Telegram accepts',
        () => {
            const text = readCompletion({ choices: [{ message: { content: 'x'.repeat(9000) } }] });

            assert.equal(text?.length, TELEGRAM_TEXT_MAX);
        },
    ],

    [
        'a refusal about tools is told apart from every other refusal',
        () => {
            const refusals = [
                {
                    error: {
                        message:
                            'No endpoints found that support tool use. Try disabling "preferences_list".',
                        code: 404,
                    },
                },
                { error: { message: 'This model does not support tool calling' } },
                { error: { message: 'tool_use is not supported by this deployment' } },
                { error: { message: 'Tools are not available for the selected model' } },
            ];

            for (const payload of refusals) {
                assert.equal(isToolRefusal(payload), true, JSON.stringify(payload));
            }
        },
    ],

    [
        'an ordinary failure never costs an agent its tools',
        () => {
            const others = [
                { error: { message: 'No endpoints found for openai/gpt-4o-mini', code: 404 } },
                { error: { message: 'This request requires more credits', code: 402 } },
                { error: { message: 'Invalid API key provided' } },
                { error: { message: 'context length exceeded' } },
                { error: 'upstream timeout' },
                { choices: [{ message: { content: 'here is a tool you could use' } }] },
                {},
                undefined,
                null,
                'not an object',
            ];

            for (const payload of others) {
                assert.equal(isToolRefusal(payload), false, JSON.stringify(payload));
            }
        },
    ],

    [
        'a provider error message is the reason a completion was unusable',
        () => {
            assert.equal(
                readError({ error: { message: 'This model is unavailable for free', code: 404 } }),
                'This model is unavailable for free',
            );

            assert.equal(readError({ error: 'flat string' }), 'flat string');
            assert.equal(readError({ error: { message: 'x'.repeat(500) } }).length, ERROR_TEXT_MAX);
        },
    ],

    [
        'anything that is not an error envelope contributes no reason',
        () => {
            for (const payload of [
                undefined,
                null,
                'text',
                42,
                {},
                { error: null },
                { error: 42 },
                { error: {} },
                { error: { message: 42 } },
                { choices: [{ message: { content: 'hi' } }] },
            ]) {
                assert.equal(
                    readError(payload),
                    '',
                    `read a reason out of ${JSON.stringify(payload)}`,
                );
            }
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
