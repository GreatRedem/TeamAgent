/**
 * Self-check for prompt composition. No framework, no network, no database:
 *
 *     cd backend && npx tsx src/routes/agent/agent.reply.test.ts
 */

/* eslint-disable no-console -- this file is a CLI self-check; its output is the report. */

import assert from 'node:assert/strict';

import { HISTORY_LIMIT, TELEGRAM_TEXT_MAX, buildMessages, buildSystemPrompt, readCompletion } from './agent.reply.js';

const docs = [
    { name: 'knowledge.md', content: '# Knowledge\nFacts.' },
    { name: 'guardrails.md', content: '# Guardrails\nLimits.' },
    { name: 'instructions.md', content: '# Instructions\nBe terse.' }
];

const tests: Array<[ string, () => void ]> = [
    [ 'instructions.md leads the system prompt', () =>
    {
        // A model weights the opening of a system prompt most; the document
        // that says what the agent *is* has to come first.
        const prompt = buildSystemPrompt(docs);

        assert.ok(prompt.startsWith('# Instructions'), prompt.slice(0, 40));
        assert.ok(prompt.indexOf('# Guardrails') < prompt.indexOf('# Knowledge'), 'the rest follow in name order');
    } ],

    [ 'prompt order does not depend on row order', () =>
    {
        assert.equal(buildSystemPrompt(docs), buildSystemPrompt([ ...docs ].reverse()));
    } ],

    [ 'empty documents are dropped, not joined as blanks', () =>
    {
        const prompt = buildSystemPrompt([ { name: 'a.md', content: '   ' }, { name: 'instructions.md', content: 'Hi.' } ]);

        assert.equal(prompt, 'Hi.');
    } ],

    [ 'an agent with no documents yields no system message', () =>
    {
        const messages = buildMessages(buildSystemPrompt([ ]), [ ], 'hello');

        assert.deepEqual(messages, [ { role: 'user', content: 'hello' } ]);
    } ],

    [ 'the agent\'s own replies come back as assistant, not user', () =>
    {
        // Feeding its own words back as `user` would make the agent answer
        // itself and drift after a couple of turns.
        const messages = buildMessages('S', [ { direction: 'in', text: 'hi' }, { direction: 'out', text: 'hello' } ], 'again');

        assert.deepEqual(messages.map((m) => m.role), [ 'system', 'user', 'assistant', 'user' ]);
        assert.equal(messages[3].content, 'again');
    } ],

    [ 'history is capped and keeps the most recent turns', () =>
    {
        const history = Array.from({ length: 40 }, (_, i) => ({ direction: 'in', text: `m${ i }` }));

        const messages = buildMessages('S', history, 'now');

        assert.equal(messages.length, 1 + HISTORY_LIMIT + 1);
        assert.equal(messages[1].content, 'm28', 'oldest kept turn');
        assert.equal(messages[messages.length - 1].content, 'now');
    } ],

    [ 'a normal completion is read', () =>
    {
        assert.equal(readCompletion({ choices: [ { message: { content: '  Hello there  ' } } ] }), 'Hello there');
    } ],

    [ 'unusable completions return undefined rather than throwing', () =>
    {
        for (const payload of [ undefined, null, 'text', 42, { }, { choices: [ ] }, { choices: [ { } ] },
            { choices: [ { message: { } } ] }, { choices: [ { message: { content: '' } } ] },
            { choices: [ { message: { content: '   ' } } ] }, { choices: [ { message: { content: 42 } } ] } ])
        {
            assert.equal(readCompletion(payload), undefined, `accepted ${ JSON.stringify(payload) }`);
        }
    } ],

    [ 'an overlong completion is cut to what Telegram accepts', () =>
    {
        const text = readCompletion({ choices: [ { message: { content: 'x'.repeat(9000) } } ] });

        assert.equal(text?.length, TELEGRAM_TEXT_MAX);
    } ]
];

let failed = 0;

for (const [ title, run ] of tests)
{
    try
    {
        run();

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
