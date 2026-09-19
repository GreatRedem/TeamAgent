/**
 * Self-check for the internal tool protocol. No framework, no network, no
 * database -- only the pure parts: which tools a permission set exposes, how
 * they adapt to the vendor format, and how tool calls are parsed.
 *
 *     cd backend && npx tsx src/routes/mcp/mcp.tools.test.ts
 */

/* eslint-disable no-console -- this file is a CLI self-check; its output is the report. */

import assert from 'node:assert/strict';

import { readToolCalls } from '../agent/agent.reply.js';
import { DOCUMENT_NAME_PATTERN, TOOLS, allowedTools, toOpenAITools } from './mcp.tools.js';
import { PERMISSIONS, serializePermissions } from '../telegram/telegram.permission.js';

const call = (id: string, name: string, args: unknown) => ({
    choices: [ { message: { tool_calls: [ { id, type: 'function', function: { name, arguments: args } } ] } } ]
});

const tests: Array<[ string, () => void ]> = [
    [ 'no permissions exposes no tools at all', () =>
    {
        // Deny-by-default has to hold here too: an agent talking to someone who
        // granted nothing must not be handed a single tool.
        assert.deepEqual(allowedTools(''), [ ]);
    } ],

    [ 'chat alone does not unlock tools', () =>
    {
        assert.deepEqual(allowedTools(serializePermissions([ 'chat', 'model' ])), [ ]);
    } ],

    [ 'read permission exposes only read tools', () =>
    {
        const names = allowedTools(serializePermissions([ 'prefs.read' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'preferences_list', 'preferences_read', 'profile_get' ]);
    } ],

    [ 'write permission does not imply read', () =>
    {
        const names = allowedTools(serializePermissions([ 'prefs.write' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'preferences_append', 'preferences_write' ]);
        assert.equal(names.includes('preferences_read'), false);
    } ],

    [ 'no tool can touch permissions', () =>
    {
        // An agent that could grant its own access would make the whole
        // permission model decorative.
        const keys = PERMISSIONS.map((p) => p.key);

        for (const tool of TOOLS)
        {
            assert.equal(/permission|grant|revoke/i.test(tool.name), false, `${ tool.name } looks like it edits permissions`);
            assert.ok(keys.includes(tool.permission), `${ tool.name } requires an unknown permission`);
        }
    } ],

    [ 'every tool declares a permission and a schema', () =>
    {
        for (const tool of TOOLS)
        {
            assert.ok(tool.permission !== '', `${ tool.name } has no permission`);
            assert.equal(tool.inputSchema.type, 'object');
            assert.ok(Array.isArray(tool.inputSchema.required));
        }
    } ],

    [ 'definitions adapt to the vendor tool format', () =>
    {
        const adapted = toOpenAITools(allowedTools(serializePermissions([ 'prefs.read' ])));

        assert.equal(adapted.length, 3);
        assert.equal(adapted[0].type, 'function');
        assert.ok(typeof adapted[0].function.name === 'string');
        assert.equal(adapted[0].function.parameters.type, 'object');
    } ],

    [ 'filenames must be plain markdown', () =>
    {
        for (const good of [ 'preferences.md', 'notes-2026.md', 'a.md' ])
        {
            assert.ok(DOCUMENT_NAME_PATTERN.test(good), good);
        }

        for (const bad of [ '../etc/passwd', 'notes.txt', '/abs.md', 'a b.md', '.hidden.md', '', 'no-extension' ])
        {
            assert.equal(DOCUMENT_NAME_PATTERN.test(bad), false, `accepted ${ bad }`);
        }
    } ],

    [ 'tool calls with string arguments are parsed', () =>
    {
        const calls = readToolCalls(call('c1', 'preferences_write', '{"name":"preferences.md","content":"hi"}'));

        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0], { id: 'c1', name: 'preferences_write', arguments: { name: 'preferences.md', content: 'hi' } });
    } ],

    [ 'a call with unparseable arguments is dropped, not thrown on', () =>
    {
        assert.deepEqual(readToolCalls(call('c1', 'preferences_read', '{not json')), [ ]);
    } ],

    [ 'a call with no arguments parses as empty', () =>
    {
        const calls = readToolCalls(call('c1', 'preferences_list', ''));

        assert.deepEqual(calls[0].arguments, { });
    } ],

    [ 'a plain answer yields no tool calls', () =>
    {
        assert.deepEqual(readToolCalls({ choices: [ { message: { content: 'hello' } } ] }), [ ]);

        for (const payload of [ undefined, null, 'x', 42, { }, { choices: [ ] } ])
        {
            assert.deepEqual(readToolCalls(payload), [ ], `accepted ${ JSON.stringify(payload) }`);
        }
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
