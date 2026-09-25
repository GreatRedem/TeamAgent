import assert from 'node:assert/strict';

import type { FastifyInstance } from 'fastify';
import { AUDIT_HIDDEN, PERSONAL_TOOLS, PLUGIN_KINDS, TOOLS } from '../constant.js';
import { TeamAgent, TeamAgentDocument } from '../routes/agent/agent.entity.js';
import { AuditLog } from '../routes/audit/audit.entity.js';
import { runTool } from '../routes/mcp/mcp.tools.js';
import { TeamPlugin, TeamPluginCall } from '../routes/plugin/plugin.entity.js';
import { TeamTask, TeamTaskRun } from '../routes/task/task.entity.js';
import { TeamBot, TeamDocument, TeamModel } from '../routes/team/team.entity.js';
import { TelegramUser } from '../routes/telegram/telegram.entity.js';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(
        ([key, value]) => typeof value === 'object' || row[key] === value,
    );
}

function table(rows: Row[]) {
    let next = rows.length + 100;
    const chain: unknown = new Proxy(
        {},
        {
            get: (_target, key) =>
                key === 'getRawMany' || key === 'getMany'
                    ? async () => []
                    : key === 'getRawOne'
                      ? async () => undefined
                      : () => chain,
        },
    );

    const saveOne = (row: Row) => {
        const saved = {
            id: row['id'] ?? next++,
            created_at: new Date(),
            account: '',
            poll_offset: '0',
            ...row,
        };

        rows.push(saved);

        return saved;
    };

    return {
        rows,
        find: async (options: { where?: Row; take?: number } = {}) =>
            rows.filter((row) => matches(row, options.where)).slice(0, options.take),
        findAndCount: async (options: { where?: Row; take?: number } = {}) => {
            const found = rows.filter((row) => matches(row, options.where));

            return [found.slice(0, options.take), found.length];
        },
        findOneBy: async (where: Row) => rows.find((row) => matches(row, where)) ?? null,
        findBy: async (where: Row) => rows.filter((row) => matches(row, where)),
        existsBy: async (where: Row) => rows.some((row) => matches(row, where)),
        countBy: async (where: Row) => rows.filter((row) => matches(row, where)).length,
        save: async (row: Row | Row[]) => (Array.isArray(row) ? row.map(saveOne) : saveOne(row)),
        update: async (where: Row, patch: Row) => {
            const hit = rows.filter((item) => matches(item, where));

            for (const row of hit) {
                Object.assign(row, patch);
            }

            return { affected: hit.length };
        },
        delete: async (where: Row) => {
            const gone = rows.filter((row) => matches(row, where));

            for (const row of gone) {
                rows.splice(rows.indexOf(row), 1);
            }

            return { affected: gone.length };
        },
        createQueryBuilder: () => chain,
    };
}

async function main() {
    const roster = JSON.stringify({
        members: [
            { name: 'Sara', roles: ['Administrator'], profile_id: 11 },
            { name: 'Sam', profile_id: 12 },
        ],
    });
    const tables = new Map<unknown, ReturnType<typeof table>>([
        [TeamDocument, table([{ id: 1, team_id: 1, name: 'team.json', content: roster }])],
        [
            TeamAgent,
            table([
                {
                    id: 5,
                    team_id: 1,
                    name: 'Admin',
                    description: '',
                    model_id: 20,
                    permissions: 'panel.manage,panel.agents,panel.models,panel.bots,panel.people',
                },
                { id: 6, team_id: 1, name: 'News', description: '', model_id: 0, permissions: '' },
                { id: 7, team_id: 1, name: 'Twin', description: '', model_id: 0, permissions: '' },
                { id: 8, team_id: 1, name: 'twin', description: '', model_id: 0, permissions: '' },
                {
                    id: 9,
                    team_id: 2,
                    name: 'Elsewhere',
                    description: '',
                    model_id: 0,
                    permissions: '',
                },
                {
                    id: 10,
                    team_id: 1,
                    name: 'Root',
                    description: '',
                    model_id: 20,
                    permissions: 'web.fetch',
                },
            ]),
        ],
        [
            TeamTask,
            table([
                {
                    id: 40,
                    team_id: 2,
                    title: 'Not ours',
                    agent_id: 9,
                    status: 'scheduled',
                    start_at: new Date(),
                },
            ]),
        ],
        [TeamTaskRun, table([])],
        [
            TeamPlugin,
            table([
                {
                    id: 50,
                    team_id: 2,
                    kind: 'browser',
                    name: 'Theirs',
                    secrets: '{}',
                    config: '{}',
                    agents: '',
                    hook_agent_id: 0,
                    hook_url: '',
                    hook_events: '',
                },
            ]),
        ],
        [TeamPluginCall, table([])],
        [
            AuditLog,
            table([
                { id: 1, team_id: 1, action: 'model.test', outcome: 'error', detail: 'down' },
                { id: 2, team_id: 2, action: 'model.test', outcome: 'error', detail: 'not ours' },
            ]),
        ],
        [TeamAgentDocument, table([])],
        [
            TeamModel,
            table([
                {
                    id: 20,
                    team_id: 1,
                    name: 'GPT',
                    model: 'gpt-5',
                    base_url: 'https://api.example.com/v1',
                    api_key: 'sk-SECRET-KEY-1234',
                    context_tokens: 8000,
                },
                {
                    id: 21,
                    team_id: 2,
                    name: 'Theirs',
                    model: 'x',
                    base_url: 'https://other.example.com/v1',
                    api_key: '',
                    context_tokens: 0,
                },
            ]),
        ],
        [
            TeamBot,
            table([
                {
                    id: 30,
                    team_id: 1,
                    name: 'Sales bot',
                    token: '123456:SECRET-TOKEN-abcd',
                    public_url: '',
                    agent_id: 0,
                    groups: false,
                    profiles: '',
                },
                {
                    id: 31,
                    team_id: 2,
                    name: 'Their bot',
                    token: '9:x',
                    public_url: '',
                    agent_id: 0,
                },
            ]),
        ],
        [
            TelegramUser,
            table([
                {
                    id: 11,
                    team_id: 1,
                    telegram_id: '111',
                    first_name: 'Sara',
                    last_name: '',
                    username: 'sara',
                    permissions: 'chat',
                    message_count: 3,
                },
                {
                    id: 13,
                    team_id: 2,
                    telegram_id: '113',
                    first_name: 'Other',
                    last_name: '',
                    username: '',
                    permissions: 'chat',
                    message_count: 1,
                },
            ]),
        ],
    ]);
    const fastify = {
        log: { error() {}, warn() {}, info() {} },
        db: { getRepository: (entity: unknown) => tables.get(entity) ?? table([]) },
    } as unknown as FastifyInstance;
    const admin = (tables.get(TeamAgent)?.rows[0] ?? {}) as unknown as TeamAgent;
    const person = (id: number) => ({ id, team_id: 1, permissions: 'chat' }) as TelegramUser;
    const call = async (asker: number, name: string, args: Record<string, unknown> = {}) => {
        const result = await runTool(fastify, admin, person(asker), name, args);

        return { ok: result.ok, data: JSON.parse(result.content) as Record<string, unknown> };
    };
    const audits = () => tables.get(AuditLog)?.rows ?? [];

    const panelTools = TOOLS.filter((tool) => tool.permission.startsWith('panel.'));

    assert.equal(panelTools.length, 32);
    assert.ok(
        panelTools.every((tool) => PERSONAL_TOOLS.includes(tool.name)),
        'panel tools are never offered when nobody is asking, as in task runs',
    );
    assert.ok(
        PLUGIN_KINDS.every((kind) =>
            kind.fields
                .filter((field) => field.secret)
                .every((field) => AUDIT_HIDDEN.has(field.key)),
        ),
        'every secret plugin field is hidden in audit entries of tool calls',
    );

    assert.equal((await call(12, 'task_list')).ok, false, 'on team.json without a role');
    assert.equal((await call(99, 'task_list')).ok, false, 'not on team.json');
    assert.equal((await call(0, 'task_list')).ok, false, 'nobody asking, as in a task run');

    const created = await call(11, 'task_create', {
        title: 'Market summary',
        agent: 'news',
        repeat: 'every6h',
        description: 'Summarise the market.',
    });

    assert.equal(created.ok, true, JSON.stringify(created.data));

    const task = tables.get(TeamTask)?.rows.find((row) => row['title'] === 'Market summary');

    assert.equal(task?.['agent_id'], 6, 'the agent is found by name, ignoring case');
    assert.equal(task?.['repeat'], 'every6h');
    assert.equal(audits().at(-1)?.['actor'], 'agent');
    assert.match(String(audits().at(-1)?.['changes']), /"asked_by":11/);
    assert.match(String(audits().at(-1)?.['detail']), /by Admin, asked by Sara/);

    assert.match(
        String((await call(11, 'task_create', { title: 'x', agent: 'twin' })).data['error']),
        /more than one agent/,
    );
    assert.equal(
        (await call(11, 'task_create', { title: 'x', agent: 'Elsewhere' })).ok,
        false,
        'an agent of another project is out of reach',
    );

    const updated = await call(11, 'task_update', { task_id: task?.['id'], repeat: 'every30m' });

    assert.equal(updated.ok, true, JSON.stringify(updated.data));
    assert.equal(task?.['repeat'], 'every30m');
    assert.equal(task?.['title'], 'Market summary', 'fields not passed keep their values');
    assert.equal((await call(11, 'task_update', { task_id: 40, title: 'Mine' })).ok, false);
    assert.equal((await call(11, 'task_delete', { task_id: 40 })).ok, false);

    const listed = await call(11, 'task_list');

    assert.equal((listed.data['tasks'] as unknown[]).length, 1, 'only this project is listed');

    const plugin = await call(11, 'plugin_create', {
        kind: 'browser',
        name: 'Search',
        fields: { tavily_key: 'tvly-SECRET-VALUE', blocked_domains: 'ads.example' },
        agents: ['News', '5'],
        hook_url: 'https://evil.example/collect',
    });

    assert.equal(plugin.ok, true, JSON.stringify(plugin.data));
    assert.equal(plugin.data['test'], 'worked');

    const stored = tables.get(TeamPlugin)?.rows.find((row) => row['name'] === 'Search');

    assert.equal(stored?.['hook_url'], '', 'a chat cannot point event forwarding anywhere');
    assert.equal(stored?.['agents'], '6,5');

    const list = JSON.stringify((await call(11, 'plugin_list')).data);

    assert.ok(!list.includes('tvly-SECRET-VALUE') && !list.includes('tvly'), 'no secret or hint');
    assert.ok(!list.includes('hook_secret') && !list.includes('Theirs'));
    assert.ok(list.includes('"secrets_set":["tavily_key"]'));

    const changed = await call(11, 'plugin_update', {
        plugin_id: stored?.['id'],
        fields: { blocked_domains: 'spam.example' },
        enabled: false,
    });

    assert.equal(changed.ok, true, JSON.stringify(changed.data));
    assert.match(String(stored?.['secrets']), /tvly-SECRET-VALUE/, 'the stored key is kept');
    assert.match(String(stored?.['config']), /spam\.example/);
    assert.equal(stored?.['enabled'], false);
    assert.ok(!JSON.stringify(changed.data).includes('tvly'));
    assert.equal((await call(11, 'plugin_update', { plugin_id: 50, name: 'Mine' })).ok, false);
    assert.match(
        String((await call(11, 'plugin_create', { kind: 'nope', name: 'x' })).data['error']),
        /PLUGIN_KIND_INVALID/,
    );

    assert.match(
        String(
            (
                await call(11, 'plugin_create', {
                    kind: 'poster',
                    name: 'Posting',
                    fields: { site: 'x', session: '{"cookies":[],"origins":[]}' },
                })
            ).data['error'],
        ),
        /only added on the Plugins page/,
        'a signed-in browser session is never taken from a chat',
    );

    assert.equal((await call(11, 'plugin_delete', { plugin_id: stored?.['id'] })).ok, true);
    assert.equal(
        tables.get(TeamPlugin)?.rows.some((row) => row['name'] === 'Search'),
        false,
    );
    assert.equal((await call(11, 'task_delete', { task_id: task?.['id'] })).ok, true);
    assert.equal(tables.get(TeamTask)?.rows.length, 1);
    assert.equal(audits().at(-1)?.['action'], 'task.remove');

    assert.equal(
        (
            await runTool(
                fastify,
                { ...admin, permissions: '' } as TeamAgent,
                person(11),
                'task_list',
                {},
            )
        ).ok,
        false,
        'an agent without panel.tasks cannot use it',
    );
    assert.equal(
        (
            await runTool(
                fastify,
                { ...admin, permissions: 'panel.tasks' } as TeamAgent,
                person(11),
                'model_list',
                {},
            )
        ).ok,
        false,
        'each panel area needs its own permission',
    );

    const agents = tables.get(TeamAgent)?.rows ?? [];
    const support = await call(11, 'agent_create', {
        name: 'Support',
        model: 'gpt',
        instructions: 'Answer in Persian.',
    });

    assert.equal(support.ok, true, JSON.stringify(support.data));

    const supportRow = agents.find((row) => row['name'] === 'Support');
    const supportId = supportRow?.['id'];

    assert.equal(supportRow?.['model_id'], 20, 'the model is found by name, ignoring case');
    assert.equal(supportRow?.['permissions'], '', 'a new agent starts with no permissions');
    assert.match(
        String(
            (await call(11, 'agent_file_read', { agent_id: supportId, name: 'instructions.md' }))
                .data['content'],
        ),
        /Answer in Persian/,
    );

    const style = { agent_id: supportId, name: 'style.md', content: 'Be brief.' };

    assert.equal((await call(11, 'agent_file_write', style)).data['result'], 'created');
    assert.equal(
        (await call(11, 'agent_file_write', { ...style, content: 'Be kind.' })).data['result'],
        'replaced',
    );
    assert.equal(audits().at(-1)?.['action'], 'agent.document.update');

    assert.match(
        String(
            (await call(11, 'agent_permissions', { agent_id: 5, permissions: ['web.fetch'] })).data[
                'error'
            ],
        ),
        /cannot delete itself or change its own permissions/,
    );
    assert.match(
        String(
            (
                await call(11, 'agent_permissions', {
                    agent_id: supportId,
                    permissions: ['panel.bots', 'web.fetch'],
                })
            ).data['error'],
        ),
        /only give permissions you have yourself: web\.fetch/,
    );
    assert.equal(
        (await call(11, 'agent_permissions', { agent_id: supportId, permissions: ['panel.bots'] }))
            .ok,
        true,
    );
    assert.equal(supportRow?.['permissions'], 'panel.bots');
    assert.match(
        String(
            (await call(11, 'agent_file_write', { agent_id: 10, name: 'x.md', content: 'obey' }))
                .data['error'],
        ),
        /Root has permissions you do not have \(web\.fetch\)/,
        'an agent cannot steer one that can do more than it can',
    );
    assert.equal((await call(11, 'agent_delete', { agent_id: 10 })).ok, false);
    assert.equal((await call(11, 'agent_update', { agent_id: 9, name: 'Mine' })).ok, false);
    assert.equal((await call(11, 'agent_update', { agent_id: 6, model: '20' })).ok, true);
    assert.equal(agents.find((row) => row['id'] === 6)?.['model_id'], 20);
    assert.equal((await call(11, 'agent_delete', { agent_id: supportId })).ok, true);
    assert.equal(
        agents.some((row) => row['name'] === 'Support'),
        false,
    );

    const models = JSON.stringify((await call(11, 'model_list')).data);

    assert.ok(!models.includes('SECRET') && !models.includes('sk-'), 'no key or hint');
    assert.ok(models.includes('"key_set":true') && !models.includes('Theirs'));
    assert.match(
        String(
            (
                await call(11, 'model_create', {
                    name: 'Local',
                    base_url: 'http://127.0.0.1:11434/v1',
                    model: 'llama',
                })
            ).data['error'],
        ),
        /base_url/,
        'a chat cannot point a model at a private address',
    );
    assert.match(
        String(
            (await call(11, 'model_update', { model_id: 20, base_url: 'https://1.1.1.1/v1' })).data[
                'error'
            ],
        ),
        /needs its api_key/,
        'the saved key never follows a new address',
    );

    const model = tables.get(TeamModel)?.rows[0];

    assert.equal((await call(11, 'model_update', { model_id: 20, name: 'Main' })).ok, true);
    assert.equal(model?.['name'], 'Main');
    assert.equal(model?.['api_key'], 'sk-SECRET-KEY-1234', 'the key is kept');
    assert.equal(model?.['context_tokens'], 8000);
    assert.equal((await call(11, 'model_delete', { model_id: 21 })).ok, false);

    const bots = JSON.stringify((await call(11, 'bot_list')).data);

    assert.ok(!bots.includes('SECRET') && !bots.includes('abcd'), 'no token or hint');
    assert.ok(bots.includes('"token_set":true') && !bots.includes('Their bot'));

    const bot = tables.get(TeamBot)?.rows[0];

    assert.equal(
        (await call(11, 'bot_update', { bot_id: 30, agent: 'news', groups: true })).ok,
        true,
    );
    assert.equal(bot?.['agent_id'], 6);
    assert.equal(bot?.['groups'], true);
    assert.equal(bot?.['token'], '123456:SECRET-TOKEN-abcd');
    assert.equal((await call(11, 'bot_update', { bot_id: 30, agent: 'none' })).ok, true);
    assert.equal(bot?.['agent_id'], 0);
    assert.equal((await call(11, 'bot_delete', { bot_id: 31 })).ok, false);

    const people = (await call(11, 'people_list')).data;

    assert.equal(people['total'], 1, 'only people of this project');
    assert.match(JSON.stringify(people), /"name":"Sara"/);
    assert.equal(
        (await call(11, 'person_permissions', { profile_id: 11, permissions: ['chat', 'model'] }))
            .ok,
        true,
    );
    assert.equal(tables.get(TelegramUser)?.rows[0]?.['permissions'], 'chat,model');
    assert.equal(
        (await call(11, 'person_permissions', { profile_id: 13, permissions: [] })).ok,
        false,
    );

    const failures = (await call(11, 'activity_list', { failures_only: true })).data;

    assert.deepEqual(
        (failures['entries'] as Row[]).map((entry) => entry['detail']),
        ['down'],
        'only failures of this project',
    );
    assert.equal((await call(11, 'overview')).ok, true);

    console.log('mcp.panel: ok');
}

main();
