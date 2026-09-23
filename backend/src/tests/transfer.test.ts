import 'reflect-metadata';
import assert from 'node:assert/strict';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DataSource, FindOperator } from 'typeorm';

import { TeamAgent, TeamAgentDocument, TeamAgentExchange } from '../routes/agent/agent.entity.js';
import { AuditLog } from '../routes/audit/audit.entity.js';
import { TeamPlugin, TeamPluginCall } from '../routes/plugin/plugin.entity.js';
import { TeamTask, TeamTaskRun } from '../routes/task/task.entity.js';
import { Team, TeamBot, TeamDocument, TeamModel } from '../routes/team/team.entity.js';
import {
    TelegramMessage,
    TelegramUser,
    TelegramUserDocument,
} from '../routes/telegram/telegram.entity.js';
import { teamExport, teamImport } from '../routes/transfer/transfer.service.js';
import { packFile, unzip, zip } from '../utils/zip.js';

type Row = Record<string, unknown>;

interface Report {
    from: string;
    imported: Record<string, number>;
    skipped: Record<string, number>;
    notes: string[];
}

async function* once(text: string) {
    yield text;
}

async function main() {
    const source = new DataSource({
        type: 'postgres',
        entities: [
            Team,
            TeamBot,
            TeamDocument,
            TeamModel,
            TeamAgent,
            TeamAgentDocument,
            TeamAgentExchange,
            AuditLog,
            TeamPlugin,
            TeamPluginCall,
            TeamTask,
            TeamTaskRun,
            TelegramMessage,
            TelegramUser,
            TelegramUserDocument,
        ],
    });

    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    const TEAM = 9;
    const quiet = { info() {}, warn() {}, error() {} };

    function project(seed: Map<unknown, Row[]>) {
        const audits: Row[] = [];
        let next = 1000;
        const rowsOf = (entity: unknown) => {
            const rows = seed.get(entity) ?? [];

            seed.set(entity, rows);

            return rows;
        };
        const matches = (row: Row, where: Row = {}) =>
            Object.entries(where).every(([key, value]) => {
                if (value instanceof FindOperator) {
                    return value.type === 'in'
                        ? (value.value as unknown[]).includes(row[key])
                        : Number(row[key]) > Number(value.value);
                }

                return row[key] === value;
            });
        const select = (entity: unknown, options?: { where?: Row; take?: number }) =>
            rowsOf(entity)
                .filter((row) => matches(row, options?.where))
                .sort((a, b) => Number(a['id']) - Number(b['id']))
                .slice(0, options?.take ?? Number.POSITIVE_INFINITY);
        const manager = {
            connection: source,
            find: async (entity: unknown, options?: { where?: Row }) => select(entity, options),
            insert: async (entity: unknown, rows: Row[]) => ({
                identifiers: rows.map((row) => {
                    next += 1;
                    rowsOf(entity).push({ ...row, id: next });

                    return { id: next };
                }),
            }),
        };
        const fastify = {
            log: quiet,
            db: {
                getRepository: (entity: unknown) => ({
                    findOneBy: async () => ({
                        id: TEAM,
                        account_id: 1,
                        name: 'Nura HQ',
                        description: '',
                    }),
                    find: async (options?: { where?: Row; take?: number }) =>
                        select(entity, options),
                    save: async (row: Row) => {
                        audits.push(row);

                        return row;
                    },
                }),
                transaction: async (run: (db: unknown) => Promise<unknown>) => run(manager),
            },
        } as unknown as FastifyInstance;

        return { fastify, rowsOf, audits };
    }

    async function call(
        route: ReturnType<typeof teamImport> | ReturnType<typeof teamExport>,
        body?: unknown,
    ) {
        let sent: unknown;
        const headers: Record<string, string> = {};
        const reply = {
            header(name: string, value: string) {
                headers[name] = value;

                return reply;
            },
            send(payload: unknown) {
                sent = payload;

                return reply;
            },
        };
        const request = { params: { id: String(TEAM) }, account_id: 1, body, log: quiet };

        await route.handler(request as unknown as FastifyRequest, reply as unknown as FastifyReply);

        return { sent, headers };
    }

    const refused = (code: string) => (error: unknown) =>
        (error as { result?: string }).result === code;

    async function archive(files: Record<string, unknown>) {
        return zip(
            await Promise.all(
                Object.entries(files).map(([name, value]) =>
                    packFile(name, once(JSON.stringify(value))),
                ),
            ),
        );
    }

    const when = '2026-09-01T10:00:00.000Z';
    const original = project(
        new Map<unknown, Row[]>([
            [
                TeamModel,
                [
                    {
                        id: 1,
                        team_id: TEAM,
                        name: 'Main',
                        model: 'm1',
                        base_url: 'https://api.one',
                        api_key: 'sk-very-secret',
                        context_tokens: 0,
                        created_at: when,
                        updated_at: when,
                    },
                ],
            ],
            [
                TelegramUser,
                [
                    {
                        id: 3,
                        team_id: TEAM,
                        telegram_id: '555',
                        username: 'sara',
                        first_name: 'Sara',
                        last_name: '',
                        language_code: 'fa',
                        message_count: 2,
                        permissions: 'chat,model',
                        last_seen_at: when,
                        created_at: when,
                    },
                ],
            ],
            [
                TeamAgent,
                [
                    {
                        id: 4,
                        team_id: TEAM,
                        name: 'Support',
                        description: '',
                        model_id: 1,
                        permissions: 'web.fetch',
                        created_at: when,
                        updated_at: when,
                    },
                ],
            ],
            [
                TeamAgentDocument,
                [
                    {
                        id: 5,
                        agent_id: 4,
                        name: 'instructions.md',
                        content: '# Be kind',
                        created_at: when,
                        updated_at: when,
                    },
                ],
            ],
            [
                TeamBot,
                [
                    {
                        id: 6,
                        team_id: TEAM,
                        name: 'Front desk',
                        token: '123456:bot-token-secret',
                        webhook_secret: 'hook-secret',
                        public_url: '',
                        agent_id: 4,
                        groups: true,
                        profiles: '3',
                        username: 'desk_bot',
                        poll_offset: '77',
                        created_at: when,
                    },
                ],
            ],
            [
                TeamPlugin,
                [
                    {
                        id: 7,
                        team_id: TEAM,
                        kind: 'x',
                        name: 'News on X',
                        enabled: true,
                        secrets: '{"api_secret":"x-secret"}',
                        config: '{}',
                        agents: '4',
                        hook_agent_id: 4,
                        hook_url: '',
                        hook_events: '',
                        hook_secret: 'plugin-hook-secret',
                        account: '@nura',
                        poll_offset: '0',
                        created_at: when,
                        updated_at: when,
                    },
                ],
            ],
            [
                TeamTask,
                [
                    {
                        id: 8,
                        team_id: TEAM,
                        agent_id: 4,
                        title: 'Hourly news',
                        description: '',
                        goal: '',
                        profile_id: 3,
                        start_at: when,
                        repeat: 'hourly',
                        status: 'scheduled',
                        last_run_at: null,
                        run_count: 1,
                        retry_count: 0,
                        retry_at: null,
                        created_at: when,
                        updated_at: when,
                    },
                ],
            ],
            [
                TeamTaskRun,
                [
                    {
                        id: 9,
                        task_id: 8,
                        team_id: TEAM,
                        started_at: when,
                        finished_at: when,
                        outcome: 'ok',
                        output: 'posted',
                        delivered: true,
                        reason: '',
                        model: 'm1',
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        tool_calls: 1,
                        log: '[]',
                    },
                ],
            ],
            [
                TelegramUserDocument,
                [
                    {
                        id: 10,
                        user_id: 3,
                        agent_id: 4,
                        name: 'likes.md',
                        content: 'tea',
                        created_at: when,
                        updated_at: when,
                    },
                ],
            ],
            [
                TelegramMessage,
                [
                    {
                        id: 11,
                        team_id: TEAM,
                        user_id: 3,
                        bot_id: 6,
                        update_id: '900',
                        chat_id: '555',
                        text: 'salam',
                        direction: 'in',
                        sent_at: when,
                        created_at: when,
                    },
                ],
            ],
            [
                TeamAgentExchange,
                [
                    {
                        id: 12,
                        team_id: TEAM,
                        agent_id: 4,
                        model_id: 1,
                        user_id: 3,
                        round: 0,
                        request: '{}',
                        response: '{}',
                        tool_calls: 0,
                        prompt_tokens: 1,
                        completion_tokens: 1,
                        tokens_estimated: false,
                        duration_ms: 5,
                        outcome: 'ok',
                        reason: '',
                        created_at: when,
                    },
                ],
            ],
            [
                TeamPluginCall,
                [
                    {
                        id: 13,
                        plugin_id: 7,
                        team_id: TEAM,
                        agent_id: 4,
                        direction: 'tool',
                        action: 'x_post',
                        ok: true,
                        status: 201,
                        duration_ms: 20,
                        thread: '',
                        request: '{}',
                        response: '{}',
                        error: '',
                        created_at: when,
                    },
                ],
            ],
            [
                TeamDocument,
                [
                    {
                        id: 14,
                        team_id: TEAM,
                        name: 'team.json',
                        content: '{"members":[]}',
                        created_at: when,
                        updated_at: when,
                    },
                ],
            ],
            [
                AuditLog,
                [
                    {
                        id: 15,
                        team_id: TEAM,
                        account_id: 1,
                        action: 'agent.create',
                        target: 'agent:4',
                        outcome: 'ok',
                        detail: 'Support',
                        duration_ms: 0,
                        actor: 'owner',
                        created_at: when,
                    },
                ],
            ],
        ]),
    );

    const exported = await call(teamExport(original.fastify));
    const zipped = exported.sent as Buffer;
    const files = unzip(zipped, { files: 64, bytes: 10_000_000 });
    const text = files.map((file) => file.data.toString('utf8')).join('\n');

    const tests: Array<[string, () => Promise<void> | void]> = [
        [
            'an export is a zip with one file per table and a manifest',
            () => {
                assert.equal(exported.headers['content-type'], 'application/zip');
                assert.match(
                    exported.headers['content-disposition'] ?? '',
                    /nura-nura-hq-\d{4}-\d{2}-\d{2}\.zip/,
                );
                assert.ok(files.some((file) => file.name === 'nura.json'));
                assert.ok(files.some((file) => file.name === 'audit.json'));
                assert.equal(files.length, 15);
            },
        ],

        [
            'no secret leaves the project',
            () => {
                for (const secret of [
                    'sk-very-secret',
                    'bot-token-secret',
                    'hook-secret',
                    'x-secret',
                    'plugin-hook-secret',
                ]) {
                    assert.equal(text.includes(secret), false, `${secret} was exported`);
                }
            },
        ],

        [
            'the export is audited with what went out',
            () => {
                const entry = original.audits.find((row) => row['action'] === 'team.export');

                assert.ok(entry);
                assert.match(String(entry['detail']), /agents 1/);
                assert.match(String(entry['detail']), /secrets left out/);
            },
        ],

        [
            'an import into an empty project rebuilds every link',
            async () => {
                const target = project(new Map());
                const { sent } = await call(teamImport(target.fastify), zipped);
                const report = sent as Report;
                const [agent] = target.rowsOf(TeamAgent);
                const [model] = target.rowsOf(TeamModel);
                const [person] = target.rowsOf(TelegramUser);
                const [bot] = target.rowsOf(TeamBot);
                const [plugin] = target.rowsOf(TeamPlugin);
                const [task] = target.rowsOf(TeamTask);

                assert.equal(report.from, 'Nura HQ');
                assert.equal(report.imported['agents'], 1);
                assert.equal(report.imported['messages'], 1);
                assert.equal(target.rowsOf(AuditLog).length, 0);
                assert.equal(model?.['api_key'], '');
                assert.equal(agent?.['model_id'], model?.['id']);
                assert.equal(agent?.['team_id'], TEAM);
                assert.equal(target.rowsOf(TeamAgentDocument)[0]?.['agent_id'], agent?.['id']);
                assert.equal(bot?.['token'], '');
                assert.equal(bot?.['agent_id'], agent?.['id']);
                assert.equal(bot?.['profiles'], String(person?.['id']));
                assert.equal(bot?.['groups'], true);
                assert.notEqual(bot?.['webhook_secret'], '');
                assert.equal(plugin?.['secrets'], '{}');
                assert.equal(plugin?.['enabled'], false);
                assert.equal(plugin?.['agents'], String(agent?.['id']));
                assert.equal(task?.['status'], 'cancelled');
                assert.equal(task?.['profile_id'], person?.['id']);
                assert.equal(target.rowsOf(TeamTaskRun)[0]?.['task_id'], task?.['id']);
                assert.equal(target.rowsOf(TelegramUserDocument)[0]?.['user_id'], person?.['id']);
                assert.equal(target.rowsOf(TelegramMessage)[0]?.['bot_id'], bot?.['id']);
                assert.equal(target.rowsOf(TeamAgentExchange)[0]?.['model_id'], model?.['id']);
                assert.equal(target.rowsOf(TeamPluginCall)[0]?.['plugin_id'], plugin?.['id']);
                assert.ok(report.notes.some((note) => /token/.test(note)));
                assert.ok(report.notes.some((note) => /cancelled/.test(note)));
                assert.match(
                    String(
                        target.audits.find((row) => row['action'] === 'team.import')?.['detail'],
                    ),
                    /from "Nura HQ".*agents 1/,
                );
            },
        ],

        [
            'an import adds alongside and never changes what is there',
            async () => {
                const target = project(
                    new Map<unknown, Row[]>([
                        [
                            TeamModel,
                            [
                                {
                                    id: 50,
                                    team_id: TEAM,
                                    base_url: 'https://api.one',
                                    model: 'm1',
                                    api_key: 'mine',
                                },
                            ],
                        ],
                        [
                            TelegramUser,
                            [
                                {
                                    id: 51,
                                    team_id: TEAM,
                                    telegram_id: '555',
                                    first_name: 'Sara mine',
                                },
                            ],
                        ],
                        [TeamPlugin, [{ id: 52, team_id: TEAM, name: 'News on X' }]],
                        [
                            TeamDocument,
                            [{ id: 53, team_id: TEAM, name: 'team.json', content: 'mine' }],
                        ],
                    ]),
                );
                const { sent } = await call(teamImport(target.fastify), zipped);
                const report = sent as Report;

                assert.equal(target.rowsOf(TeamModel).length, 1);
                assert.equal(target.rowsOf(TeamModel)[0]?.['api_key'], 'mine');
                assert.equal(target.rowsOf(TeamAgent)[0]?.['model_id'], 50);
                assert.equal(target.rowsOf(TelegramUser).length, 1);
                assert.equal(target.rowsOf(TelegramMessage)[0]?.['user_id'], 51);
                assert.deepEqual(
                    target.rowsOf(TeamPlugin).map((row) => row['name']),
                    ['News on X', 'News on X 2'],
                );
                assert.equal(target.rowsOf(TeamDocument).length, 1);
                assert.equal(target.rowsOf(TeamDocument)[0]?.['content'], 'mine');
                assert.ok(report.notes.some((note) => /team\.json/.test(note)));
            },
        ],

        [
            'hostile values are cut to fit and orphans are dropped',
            async () => {
                const target = project(new Map());
                const { sent } = await call(
                    teamImport(target.fastify),
                    await archive({
                        'nura.json': { format: 1, team: { name: 'Crafted' } },
                        'agents.json': [
                            {
                                id: 1,
                                name: `${'A'.repeat(500)}\u0000`,
                                model_id: 404,
                                permissions: 'basics',
                            },
                        ],
                        'agent-files.json': [
                            { id: 1, agent_id: 99, name: 'orphan.md', content: 'x' },
                        ],
                        'tasks.json': [
                            {
                                id: 1,
                                agent_id: 1,
                                title: 'Run',
                                start_at: 'not a date',
                                run_count: 1e12,
                            },
                        ],
                        'bots.json': [{ id: 1, name: 'B', token: '1:leaked', profiles: '1,x,-3' }],
                        'people.json': ['not a row', null],
                    }),
                );
                const report = sent as Report;
                const [agent] = target.rowsOf(TeamAgent);
                const [task] = target.rowsOf(TeamTask);

                assert.equal(String(agent?.['name']).length, 64);
                assert.equal(String(agent?.['name']).includes('\u0000'), false);
                assert.equal(agent?.['model_id'], 0);
                assert.equal(report.skipped['agent-files'], 1);
                assert.equal(report.skipped['people'], 2);
                assert.ok(task?.['start_at'] instanceof Date);
                assert.equal(task?.['run_count'], 2147483647);
                assert.equal(target.rowsOf(TeamBot)[0]?.['token'], '');
                assert.equal(target.rowsOf(TeamBot)[0]?.['profiles'], '');
            },
        ],

        [
            'what is not an export is refused',
            async () => {
                const target = project(new Map());
                const route = teamImport(target.fastify);

                await assert.rejects(call(route, 'text'), refused('IMPORT_FILE_REQUIRED'));
                await assert.rejects(
                    call(route, Buffer.from('hello')),
                    refused('IMPORT_ZIP_INVALID'),
                );
                await assert.rejects(
                    call(route, await archive({ 'agents.json': [] })),
                    refused('IMPORT_FORMAT_UNKNOWN'),
                );
                assert.equal(target.rowsOf(TeamAgent).length, 0);
            },
        ],
    ];

    let failed = 0;

    for (const [title, run] of tests) {
        try {
            await run();

            console.log(`  ok    ${title}`);
        } catch (error) {
            failed += 1;

            console.log(`  FAIL  ${title}`);
            console.log(`        ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log(`\n${tests.length - failed} passed`);

    if (failed > 0) {
        process.exit(1);
    }
}

void main();
