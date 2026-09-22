/**
 * Self-check for stream assembly. No framework, no network, no database:
 *
 *     cd backend && npx tsx src/routes/agent/agent.transport.test.ts
 *
 * A streamed answer has to end up as exactly the payload an unstreamed one
 * would have produced, because everything downstream reads only that. The
 * expensive failure here is silent: a tool call whose arguments were assembled
 * wrong is valid JSON right up until the tool runs on the wrong input.
 */

/* eslint-disable no-console -- this file is a CLI self-check; its output is the report. */

import assert from 'node:assert/strict';

import { createAssembler, isOpenRouter } from './agent.transport.js';
import { readCompletion, readToolCalls } from './agent.reply.js';

const tests: Array<[ string, () => void ]> = [
    [ 'content fragments become one answer', () =>
    {
        const assembler = createAssembler();

        assembler.chunk({ role: 'assistant' }, undefined, undefined);
        assembler.chunk({ content: 'The answer ' }, undefined, undefined);
        assembler.chunk({ content: 'is forty' }, undefined, undefined);
        assembler.chunk({ content: '-two.' }, undefined, 'stop');

        assert.equal(readCompletion(assembler.payload()), 'The answer is forty-two.');
    } ],

    [ 'every step of the answer is offered as it arrives', () =>
    {
        const frames: string[] = [ ];
        const assembler = createAssembler((text) => frames.push(text));

        assembler.chunk({ content: 'one ' }, undefined, undefined);
        assembler.chunk({ }, undefined, undefined);
        assembler.chunk({ content: 'two' }, undefined, undefined);

        // Each call carries the whole answer so far, not the delta, so a caller
        // can render it without keeping its own copy. A chunk with no content
        // is not an update and must not produce a frame.
        assert.deepEqual(frames, [ 'one ', 'one two' ]);
    } ],

    [ 'a tool call split across chunks is rebuilt whole', () =>
    {
        // The regression this guards: arguments are streamed a few characters
        // at a time, and a call assembled wrong is valid JSON that means
        // something else.
        const assembler = createAssembler();

        assembler.chunk({ tool_calls: [ { index: 0, id: 'call_a', type: 'function', function: { name: 'team_mem', arguments: '' } } ] }, undefined, undefined);
        assembler.chunk({ tool_calls: [ { index: 0, function: { name: 'bers', arguments: '{"que' } } ] }, undefined, undefined);
        assembler.chunk({ tool_calls: [ { index: 0, function: { arguments: 'ry":"al' } } ] }, undefined, undefined);
        assembler.chunk({ tool_calls: [ { index: 0, function: { arguments: 'ex"}' } } ] }, undefined, 'tool_calls');

        const calls = readToolCalls(assembler.payload());

        assert.equal(calls.length, 1);
        assert.equal(calls[0].id, 'call_a');
        assert.equal(calls[0].name, 'team_members');
        assert.deepEqual(calls[0].arguments, { query: 'alex' });
    } ],

    [ 'two calls at different indexes stay two calls', () =>
    {
        const assembler = createAssembler();

        assembler.chunk({ tool_calls: [ { index: 0, id: 'a', function: { name: 'time_now', arguments: '{}' } } ] }, undefined, undefined);
        assembler.chunk({ tool_calls: [ { index: 1, id: 'b', function: { name: 'roster_read', arguments: '{}' } } ] }, undefined, undefined);
        assembler.chunk({ tool_calls: [ { index: 0, function: { arguments: '' } } ] }, undefined, undefined);

        const calls = readToolCalls(assembler.payload());

        assert.deepEqual(calls.map((call) => call.name), [ 'time_now', 'roster_read' ]);
        assert.deepEqual(calls.map((call) => call.id), [ 'a', 'b' ]);
    } ],

    [ 'the SDK spelling of tool calls is understood too', () =>
    {
        // The SDK decodes `tool_calls` into `toolCalls`; the fragments inside
        // keep the same names. One assembler has to take both or the SDK path
        // silently loses every tool call.
        const assembler = createAssembler();

        assembler.chunk({ toolCalls: [ { index: 0, id: 'x', function: { name: 'time_now', arguments: '{}' } } ] }, undefined, 'tool_calls');

        assert.deepEqual(readToolCalls(assembler.payload()).map((call) => call.name), [ 'time_now' ]);
    } ],

    [ 'a provider that omits index does not weld its calls together', () =>
    {
        const assembler = createAssembler();

        assembler.chunk({ tool_calls: [
            { id: 'a', function: { name: 'time_now', arguments: '{}' } },
            { id: 'b', function: { name: 'roster_read', arguments: '{}' } }
        ] }, undefined, undefined);

        assert.equal(readToolCalls(assembler.payload()).length, 2);
    } ],

    [ 'usage from the final chunk survives', () =>
    {
        const assembler = createAssembler();

        assembler.chunk({ content: 'hi' }, undefined, undefined);
        assembler.chunk(undefined, { total_tokens: 11 }, undefined);

        assert.deepEqual((assembler.payload() as { usage?: unknown }).usage, { total_tokens: 11 });
    } ],

    [ 'a plain answer carries no tool_calls field at all', () =>
    {
        // Some compatible servers reject an assistant turn that has an empty
        // tool_calls array, and the turn is replayed verbatim on the next round.
        const assembler = createAssembler();

        assembler.chunk({ content: 'just words' }, undefined, 'stop');

        const message = (assembler.payload() as { choices: Array<{ message: Record<string, unknown> }> }).choices[0].message;

        assert.equal('tool_calls' in message, false);
    } ],

    [ 'junk chunks are skipped rather than thrown on', () =>
    {
        const assembler = createAssembler();

        for (const junk of [ undefined, null, 'text', 42, { tool_calls: 'nope' }, { tool_calls: [ null, 'x' ] } ])
        {
            assert.doesNotThrow(() => assembler.chunk(junk, undefined, undefined), JSON.stringify(junk));
        }

        assert.equal(readCompletion(assembler.payload()), undefined);
    } ],

    [ 'only OpenRouter itself is routed through the vendor SDK', () =>
    {
        for (const url of [ 'https://openrouter.ai/api/v1', 'https://OpenRouter.ai/api/v1', 'https://api.openrouter.ai/v1' ])
        {
            assert.equal(isOpenRouter(url), true, url);
        }

        // The near-misses: a host that merely contains the name would send
        // someone else's traffic, and their key, to the wrong client.
        for (const url of [
            'https://agentrouter.org/v1',
            'http://localhost:1234/v1',
            'https://openrouter.ai.example.com/v1',
            'https://notopenrouter.ai/v1',
            'not a url',
            ''
        ])
        {
            assert.equal(isOpenRouter(url), false, url);
        }
    } ]
];

let failed = 0;

for (const [ label, run ] of tests)
{
    try
    {
        run();

        console.log(`  ok    ${ label }`);
    }
    catch (cause)
    {
        failed += 1;

        console.log(`  FAIL  ${ label }`);
        console.log(`        ${ cause instanceof Error ? cause.message : String(cause) }`);
    }
}

console.log(failed === 0 ? `\n${ tests.length } passed` : `\n${ failed } of ${ tests.length } failed`);

process.exit(failed === 0 ? 0 : 1);
