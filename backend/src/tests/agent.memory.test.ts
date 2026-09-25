import assert from 'node:assert/strict';

import type { FastifyInstance } from 'fastify';
import { DOCUMENT_INLINE_MAX, MEMORY_MAX, PERSONAL_TOOLS } from '../constant.js';
import { type TeamAgent, TeamAgentDocument } from '../routes/agent/agent.entity.js';
import { buildSystemPrompt, toolGuidance } from '../routes/agent/agent.reply.js';
import { AuditLog } from '../routes/audit/audit.entity.js';
import { runTool } from '../routes/mcp/mcp.tools.js';
import type { TelegramUser } from '../routes/telegram/telegram.entity.js';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => row[key] === value);
}

function table() {
    const rows: Row[] = [];

    return {
        rows,
        findOneBy: async (where: Row) => rows.find((row) => matches(row, where)) ?? null,
        save: async (row: Row) => {
            rows.push({ id: rows.length + 1, ...row });

            return row;
        },
        update: async (where: Row, patch: Row) => {
            for (const row of rows.filter((item) => matches(item, where))) {
                Object.assign(row, patch);
            }
        },
    };
}

async function main() {
    const tables = new Map<unknown, ReturnType<typeof table>>([
        [TeamAgentDocument, table()],
        [AuditLog, table()],
    ]);
    const fastify = {
        log: { error() {}, warn() {}, info() {} },
        db: { getRepository: (entity: unknown) => tables.get(entity) ?? table() },
    } as unknown as FastifyInstance;
    const agent = { id: 3, team_id: 1, name: 'Scribe', permissions: 'memory.write' } as TeamAgent;
    const nobody = { id: 0, team_id: 1 } as TelegramUser;
    const memory = () =>
        String(
            tables.get(TeamAgentDocument)?.rows.find((row) => row['name'] === 'memory.md')?.[
                'content'
            ],
        );

    assert.ok(
        !PERSONAL_TOOLS.includes('memory_remember'),
        'a scheduled task can remember what it did',
    );

    assert.equal(
        (
            await runTool(fastify, agent, nobody, 'memory_remember', {
                note: 'Launch moved to March.',
            })
        ).ok,
        true,
    );
    assert.equal(
        (
            await runTool(fastify, agent, nobody, 'memory_remember', {
                note: 'Posted  the\nweekly recap.',
            })
        ).ok,
        true,
    );
    assert.match(
        memory(),
        /^- \d{4}-\d{2}-\d{2}: Launch moved to March\.\n- \d{4}-\d{2}-\d{2}: Posted the weekly recap\.\n$/,
    );
    assert.equal(tables.get(AuditLog)?.rows.at(-1)?.['action'], 'agent.memory');
    assert.equal(
        (await runTool(fastify, agent, nobody, 'memory_remember', { note: '  ' })).ok,
        false,
    );

    const full = await runTool(fastify, agent, nobody, 'memory_remember', {
        note: 'x'.repeat(MEMORY_MAX),
    });

    assert.equal(full.ok, false, 'a full memory has to be condensed first');
    assert.match(full.content, /memory_rewrite/);

    assert.equal(
        (
            await runTool(fastify, agent, nobody, 'memory_rewrite', {
                content: '# Kept\n- March launch',
            })
        ).ok,
        true,
    );
    assert.equal(memory(), '# Kept\n- March launch\n');
    assert.equal(
        (await runTool(fastify, agent, nobody, 'memory_rewrite', { content: '' })).ok,
        true,
    );
    assert.equal(memory(), '', 'an empty rewrite forgets everything');

    assert.equal(
        (
            await runTool(
                fastify,
                { ...agent, permissions: '' } as TeamAgent,
                nobody,
                'memory_remember',
                { note: 'x' },
            )
        ).ok,
        false,
        'memory is off unless granted',
    );

    const long = `- ${'fact '.repeat(DOCUMENT_INLINE_MAX)}`;
    const prompt = buildSystemPrompt(
        [
            { name: 'instructions.md', content: 'Be helpful.' },
            { name: 'memory.md', content: long },
            { name: 'knowledge.md', content: long },
        ],
        true,
    );

    assert.match(prompt, /# Your memory\n\nNotes you chose to keep/, 'memory is framed as notes');
    assert.ok(prompt.includes(long.trim()), 'memory is always inline, however long');
    assert.match(prompt, /- knowledge\.md \(/, 'other long files are still deferred');
    assert.ok(!buildSystemPrompt([{ name: 'memory.md', content: '' }]).includes('# Your memory'));
    assert.match(toolGuidance(['memory_remember', 'memory_rewrite']), /# Remembering/);
    assert.equal(toolGuidance([]), '');

    console.log('agent.memory: ok');
}

main();
