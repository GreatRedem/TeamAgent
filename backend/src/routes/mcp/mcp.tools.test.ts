/* eslint-disable no-console -- this file is a CLI self-check; its output is the report. */

import assert from 'node:assert/strict';

import { readToolCalls } from '../agent/agent.reply.js';
import { DOCUMENT_NAME_PATTERN, TOOLS, allowedTools, toOpenAITools } from './mcp.tools.js';
import { AGENT_PERMISSIONS, DEFAULT_AGENT_PERMISSIONS, serializeAgentPermissions } from '../agent/agent.permission.js';
import { PERMISSIONS as PROFILE_PERMISSIONS } from '../telegram/telegram.permission.js';

const call = (id: string, name: string, args: unknown) => ({
    choices: [ { message: { tool_calls: [ { id, type: 'function', function: { name, arguments: args } } ] } } ]
});

const tests: Array<[ string, () => void ]> = [
    [ 'an agent with no capabilities gets no tools at all', () =>
    {
        assert.deepEqual(allowedTools(''), [ ]);
    } ],

    [ 'capabilities belong to the agent, not to the person', () =>
    {
        const profileKeys = PROFILE_PERMISSIONS.map((p) => p.key);

        assert.equal(profileKeys.includes('prefs.read'), false);
        assert.equal(profileKeys.includes('prefs.write'), false);

        for (const tool of TOOLS)
        {
            assert.ok(AGENT_PERMISSIONS.some((p) => p.key === tool.permission), `${ tool.name } needs an agent capability`);
        }
    } ],

    [ 'read permission exposes only read tools', () =>
    {
        const names = allowedTools(serializeAgentPermissions([ 'prefs.read' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'preferences_list', 'preferences_read', 'profile_get' ]);
    } ],

    [ 'write permission does not imply read', () =>
    {
        const names = allowedTools(serializeAgentPermissions([ 'prefs.write' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'preferences_append', 'preferences_write' ]);
        assert.equal(names.includes('preferences_read'), false);
    } ],

    [ 'no tool can touch permissions', () =>
    {
        const keys = AGENT_PERMISSIONS.map((p) => p.key);

        for (const tool of TOOLS)
        {
            assert.equal(/permission|grant|revoke/i.test(tool.name), false, `${ tool.name } looks like it edits permissions`);
            assert.ok(keys.includes(tool.permission), `${ tool.name } requires an unknown permission`);
        }
    } ],

    [ 'seeing the team is a separate capability from seeing the person in front of you', () =>
    {
        const prefs = allowedTools(serializeAgentPermissions([ 'prefs.read' ])).map((t) => t.name);

        for (const name of [ 'team_members', 'team_member_read', 'team_member_note' ])
        {
            assert.equal(prefs.includes(name), false, `prefs.read exposed ${ name }`);
        }
    } ],

    [ 'team.read lists and reads but cannot record', () =>
    {
        const names = allowedTools(serializeAgentPermissions([ 'team.read' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'team_member_read', 'team_members' ]);
    } ],

    [ 'team.write records but does not imply reading the roster', () =>
    {
        const names = allowedTools(serializeAgentPermissions([ 'team.write' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'team_member_note' ]);
    } ],

    [ 'the team file is a separate capability from the profile notes', () =>
    {
        const notes = allowedTools(serializeAgentPermissions([ 'team.read', 'team.write' ])).map((t) => t.name);
        const roster = allowedTools(serializeAgentPermissions([ 'roster.read', 'roster.write' ])).map((t) => t.name);

        assert.equal(notes.some((name) => name.startsWith('roster_')), false, 'team.* reached the roster file');
        assert.equal(roster.some((name) => name.startsWith('team_member')), false, 'roster.* reached the profile notes');
    } ],

    [ 'reading the team file does not imply editing it', () =>
    {
        const names = allowedTools(serializeAgentPermissions([ 'roster.read' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'roster_read' ]);
    } ],

    [ 'editing the team file cannot replace the whole of it', () =>
    {
        const names = allowedTools(serializeAgentPermissions([ 'roster.write' ])).map((t) => t.name).sort();

        assert.deepEqual(names, [ 'roster_member_remove', 'roster_member_set' ]);
    } ],

    [ 'the team file is off for a new agent', () =>
    {
        const names = allowedTools(serializeAgentPermissions(DEFAULT_AGENT_PERMISSIONS)).map((t) => t.name);

        assert.equal(names.some((name) => name.startsWith('roster_')), false);
    } ],

    [ 'nothing can overwrite what the team remembers about someone', () =>
    {
        const write = TOOLS.filter((t) => t.permission === 'team.write');

        assert.equal(write.length, 1);
        assert.equal(write[0].name, 'team_member_note');
        assert.match(write[0].description, /appends/i);
    } ],

    [ 'a member is addressed by the id the roster hands out', () =>
    {
        for (const name of [ 'team_member_read', 'team_member_note' ])
        {
            const tool = TOOLS.find((t) => t.name === name);

            assert.ok(tool, `${ name } missing`);
            assert.ok(tool.inputSchema.required.includes('member_id'), `${ name } does not require member_id`);
            assert.equal(tool.inputSchema.required.includes('telegram_id'), false);
        }
    } ],

    [ 'the team capabilities are off for a new agent', () =>
    {
        for (const key of [ 'team.read', 'team.write' ])
        {
            assert.equal(DEFAULT_AGENT_PERMISSIONS.includes(key), false, `${ key } is on by default`);
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
        const adapted = toOpenAITools(allowedTools(serializeAgentPermissions([ 'prefs.read' ])));

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
