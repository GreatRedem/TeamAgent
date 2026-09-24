import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type EntityManager, type EntityTarget, In, MoreThan, type ObjectLiteral } from 'typeorm';
import type { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata.js';
import {
    TRANSFER_FILES_MAX,
    TRANSFER_FORMAT,
    TRANSFER_INSERT_CHUNK,
    TRANSFER_PAGE,
    TRANSFER_UNPACKED_MAX,
    TRANSFER_UPLOAD_MAX,
} from '../../constant.js';

import { authGuard } from '../../plugins/authentication.js';
import { idList } from '../../utils/ids.js';
import { BadRequestResponse } from '../../utils/response.js';
import { packFile, unzip, zip } from '../../utils/zip.js';
import { TeamAgent, TeamAgentDocument, TeamAgentExchange } from '../agent/agent.entity.js';
import { AuditLog } from '../audit/audit.entity.js';
import { audit } from '../audit/audit.log.js';
import { TeamPlugin, TeamPluginCall } from '../plugin/plugin.entity.js';
import { TeamTask, TeamTaskRun } from '../task/task.entity.js';
import { findOwnedTeam, readTeamId } from '../team/team.access.js';
import { TeamBot, TeamDocument, TeamModel } from '../team/team.entity.js';
import {
    TelegramMessage,
    TelegramUser,
    TelegramUserDocument,
} from '../telegram/telegram.entity.js';
import { createWebhookSecret } from '../telegram/telegram.service.js';
import { schemaTeamImport } from './transfer.schema.js';

type Row = Record<string, unknown>;

interface Table {
    file: string;
    entity: EntityTarget<ObjectLiteral>;
    hidden?: string[];
    owner?: { column: string; table: string };
    refs?: Record<string, string>;
    lists?: Record<string, string>;
    required?: string[];
    exportOnly?: boolean;
}

interface Existing {
    models: Map<string, number>;
    people: Map<string, number>;
    teamFiles: Set<string>;
    plugins: Set<string>;
    peopleFiles: Set<string>;
    paused: number;
    keptFiles: string[];
}

function transferTables(): Table[] {
    return [
        { file: 'models', entity: TeamModel, hidden: ['api_key'] },
        { file: 'people', entity: TelegramUser },
        { file: 'agents', entity: TeamAgent, refs: { model_id: 'models' } },
        {
            file: 'agent-files',
            entity: TeamAgentDocument,
            owner: { column: 'agent_id', table: 'agents' },
            refs: { agent_id: 'agents' },
            required: ['agent_id'],
        },
        {
            file: 'bots',
            entity: TeamBot,
            hidden: ['token', 'webhook_secret', 'poll_offset'],
            refs: { agent_id: 'agents' },
            lists: { profiles: 'people' },
        },
        {
            file: 'plugins',
            entity: TeamPlugin,
            hidden: ['secrets', 'hook_secret', 'poll_offset'],
            refs: { hook_agent_id: 'agents' },
            lists: { agents: 'agents' },
        },
        {
            file: 'tasks',
            entity: TeamTask,
            refs: { agent_id: 'agents', profile_id: 'people', group_bot_id: 'bots' },
            required: ['agent_id'],
        },
        {
            file: 'task-runs',
            entity: TeamTaskRun,
            refs: { task_id: 'tasks' },
            required: ['task_id'],
        },
        {
            file: 'people-files',
            entity: TelegramUserDocument,
            owner: { column: 'user_id', table: 'people' },
            refs: { user_id: 'people', agent_id: 'agents' },
            required: ['user_id'],
        },
        {
            file: 'messages',
            entity: TelegramMessage,
            refs: { user_id: 'people', bot_id: 'bots' },
            required: ['user_id', 'bot_id'],
        },
        {
            file: 'exchanges',
            entity: TeamAgentExchange,
            refs: { agent_id: 'agents', model_id: 'models', user_id: 'people' },
            required: ['agent_id'],
        },
        {
            file: 'plugin-calls',
            entity: TeamPluginCall,
            refs: { plugin_id: 'plugins', agent_id: 'agents' },
            required: ['plugin_id'],
        },
        { file: 'team-files', entity: TeamDocument },
        { file: 'audit', entity: AuditLog, exportOnly: true },
    ];
}

async function* once(text: string) {
    yield text;
}

async function* tableJson(
    fastify: FastifyInstance,
    table: Table,
    teamId: number,
    owners: Map<string, number[]>,
    counts: Record<string, number>,
) {
    const repository = fastify.db.getRepository(table.entity);
    const hidden = new Set(['team_id', ...(table.hidden ?? [])]);
    const parents = table.owner ? (owners.get(table.owner.table) ?? []) : [];
    const scope = table.owner ? { [table.owner.column]: In(parents) } : { team_id: teamId };
    let last = 0;
    let count = 0;

    yield '[';

    while (!table.owner || parents.length > 0) {
        const rows = await repository.find({
            where: { ...scope, id: MoreThan(last) },
            order: { id: 'ASC' },
            take: TRANSFER_PAGE,
        });

        if (rows.length === 0) {
            break;
        }

        yield (count === 0 ? '' : ',') +
            rows
                .map((row) =>
                    JSON.stringify(
                        Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.has(key))),
                    ),
                )
                .join(',');

        count += rows.length;
        last = Number(rows[rows.length - 1]?.['id']);

        if (rows.length < TRANSFER_PAGE) {
            break;
        }
    }

    counts[table.file] = count;

    yield ']';
}

export function teamExport(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const team = await findOwnedTeam(fastify, teamId, request.account_id);
        const startedAt = Date.now();
        const idsOf = async (entity: EntityTarget<{ id: number; team_id: number }>) =>
            (
                await fastify.db
                    .getRepository(entity)
                    .find({ where: { team_id: teamId }, select: { id: true } })
            ).map((row) => row.id);
        const owners = new Map([
            ['agents', await idsOf(TeamAgent)],
            ['people', await idsOf(TelegramUser)],
        ]);
        const tables = transferTables();
        const counts: Record<string, number> = {};
        const files = [
            await packFile(
                'nura.json',
                once(
                    JSON.stringify({
                        format: TRANSFER_FORMAT,
                        exported_at: new Date().toISOString(),
                        team: { name: team.name, description: team.description },
                        secrets: 'left out: model API keys, bot tokens and plugin secrets',
                    }),
                ),
            ),
        ];

        for (const table of tables) {
            files.push(
                await packFile(
                    `${table.file}.json`,
                    tableJson(fastify, table, teamId, owners, counts),
                ),
            );
        }

        const archive = zip(files);
        const slug = team.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const name = `nura-${slug || 'project'}-${new Date().toISOString().slice(0, 10)}.zip`;

        request.log.info(
            { module: 'transfer', teamId, bytes: archive.length, counts },
            'project exported',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'team.export',
            target: `team:${teamId}`,
            durationMs: Date.now() - startedAt,
            detail: `${name} - ${archive.length} bytes - ${Object.entries(counts)
                .map(([file, count]) => `${file} ${count}`)
                .join(', ')} - secrets left out`,
            changes: { file: name, bytes: archive.length, rows: counts },
        });

        reply
            .header('content-type', 'application/zip')
            .header('content-disposition', `attachment; filename="${name}"`)
            .send(archive);
    };

    return { config: { ...authGuard() }, handler };
}

function cleanRow(columns: ColumnMetadata[], raw: unknown): Row | undefined {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return undefined;
    }

    const source = raw as Row;
    const clean: Row = {};

    for (const column of columns) {
        const key = column.propertyName;
        const type = String(column.type).toLowerCase();
        const kind =
            column.isCreateDate || column.isUpdateDate || /time|date/.test(type)
                ? 'date'
                : type === 'boolean'
                  ? 'boolean'
                  : type === 'int' || type === 'integer'
                    ? 'int'
                    : type === 'bigint'
                      ? 'bigint'
                      : 'text';
        const value = source[key];

        if (column.isPrimary || key === 'team_id') {
            continue;
        }

        if (value === undefined) {
            if (
                column.default === undefined &&
                !column.isNullable &&
                !column.isCreateDate &&
                !column.isUpdateDate
            ) {
                clean[key] = { date: new Date(), boolean: false, int: 0, bigint: '0', text: '' }[
                    kind
                ];
            }

            continue;
        }

        if (kind === 'date') {
            const date = new Date(String(value));

            clean[key] =
                value !== null && !Number.isNaN(date.getTime())
                    ? date
                    : column.isNullable
                      ? null
                      : new Date();
        } else if (kind === 'boolean') {
            clean[key] = value === true;
        } else if (kind === 'int') {
            const number = Math.trunc(Number(value));

            clean[key] = Number.isFinite(number)
                ? Math.max(-2147483648, Math.min(2147483647, number))
                : 0;
        } else if (kind === 'bigint') {
            clean[key] = /^-?\d{1,18}$/.test(String(value)) ? String(value) : '0';
        } else {
            const text = (typeof value === 'string' ? value : String(value ?? '')).replaceAll(
                '\u0000',
                '',
            );

            clean[key] = column.length === '' ? text : text.slice(0, Number(column.length));
        }
    }

    return clean;
}

function remap(row: Row, table: Table, ids: Map<string, Map<number, number>>): boolean {
    for (const [column, target] of Object.entries(table.refs ?? {})) {
        const old = Number(row[column]) || 0;
        const mapped = old === 0 ? 0 : (ids.get(target)?.get(old) ?? 0);

        if (mapped === 0 && table.required?.includes(column)) {
            return false;
        }

        row[column] = mapped;
    }

    for (const [column, target] of Object.entries(table.lists ?? {})) {
        row[column] = idList(String(row[column] ?? ''))
            .flatMap((old) => ids.get(target)?.get(old) ?? [])
            .join(',');
    }

    return true;
}

function prepare(file: string, row: Row, existing: Existing): 'insert' | 'skip' | number {
    if (file === 'models' || file === 'people') {
        const key =
            file === 'models' ? `${row['base_url']}|${row['model']}` : String(row['telegram_id']);
        const known = file === 'models' ? existing.models : existing.people;
        const found = known.get(key);

        if (found !== undefined) {
            return found === 0 ? 'skip' : found;
        }

        known.set(key, 0);

        if (file === 'models') {
            row['api_key'] = '';
        }
    }

    if (file === 'bots') {
        Object.assign(row, {
            token: '',
            webhook_secret: createWebhookSecret(),
            public_url: '',
            poll_offset: '0',
        });
    }

    if (file === 'plugins') {
        const base = String(row['name']).slice(0, 56);
        let name = String(row['name']);

        for (let copy = 2; existing.plugins.has(name); copy += 1) {
            name = `${base} ${copy}`;
        }

        existing.plugins.add(name);

        Object.assign(row, {
            name,
            secrets: '{}',
            hook_secret: randomBytes(24).toString('hex'),
            enabled: false,
            account: '',
            poll_offset: '0',
        });
    }

    if (file === 'tasks' && (row['status'] === 'scheduled' || row['status'] === 'running')) {
        existing.paused += 1;

        Object.assign(row, { status: 'cancelled', retry_at: null, retry_count: 0 });
    }

    if (file === 'team-files') {
        const name = String(row['name']);

        if (existing.teamFiles.has(name)) {
            existing.keptFiles.push(name);

            return 'skip';
        }

        existing.teamFiles.add(name);
    }

    if (file === 'people-files') {
        const key = `${row['user_id']}|${row['agent_id']}|${row['name']}`;

        if (existing.peopleFiles.has(key)) {
            return 'skip';
        }

        existing.peopleFiles.add(key);
    }

    return 'insert';
}

async function existingOf(manager: EntityManager, teamId: number): Promise<Existing> {
    const models = await manager.find(TeamModel, { where: { team_id: teamId } });
    const people = await manager.find(TelegramUser, { where: { team_id: teamId } });
    const teamFiles = await manager.find(TeamDocument, { where: { team_id: teamId } });
    const plugins = await manager.find(TeamPlugin, { where: { team_id: teamId } });
    const peopleFiles =
        people.length === 0
            ? []
            : await manager.find(TelegramUserDocument, {
                  where: { user_id: In(people.map((person) => person.id)) },
              });

    return {
        models: new Map(models.map((model) => [`${model.base_url}|${model.model}`, model.id])),
        people: new Map(people.map((person) => [person.telegram_id, person.id])),
        teamFiles: new Set(teamFiles.map((document) => document.name)),
        plugins: new Set(plugins.map((plugin) => plugin.name)),
        peopleFiles: new Set(
            peopleFiles.map(
                (document) => `${document.user_id}|${document.agent_id}|${document.name}`,
            ),
        ),
        paused: 0,
        keptFiles: [],
    };
}

async function importTables(
    manager: EntityManager,
    teamId: number,
    rowsOf: (file: string) => unknown[],
) {
    const ids = new Map<string, Map<number, number>>();
    const imported: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const existing = await existingOf(manager, teamId);

    for (const table of transferTables().filter((candidate) => !candidate.exportOnly)) {
        const metadata = manager.connection.getMetadata(table.entity);
        const owned = metadata.columns.some((column) => column.propertyName === 'team_id');
        const map = new Map<number, number>();
        const pending: { old: number; row: Row }[] = [];
        let skip = 0;

        ids.set(table.file, map);

        for (const raw of rowsOf(table.file)) {
            const row = cleanRow(metadata.columns, raw);
            const old = Number((raw as Row | null)?.['id']);

            if (!row || !remap(row, table, ids)) {
                skip += 1;
                continue;
            }

            if (owned) {
                row['team_id'] = teamId;
            }

            const outcome = prepare(table.file, row, existing);

            if (outcome !== 'insert') {
                if (typeof outcome === 'number') {
                    map.set(old, outcome);
                }

                skip += 1;
                continue;
            }

            pending.push({ old, row });
        }

        for (let start = 0; start < pending.length; start += TRANSFER_INSERT_CHUNK) {
            const chunk = pending.slice(start, start + TRANSFER_INSERT_CHUNK);
            const result = await manager.insert(
                table.entity,
                chunk.map((item) => item.row),
            );

            result.identifiers.forEach((identifier, index) => {
                const old = chunk[index]?.old;

                if (old !== undefined && Number.isInteger(old)) {
                    map.set(old, Number(identifier?.['id']));
                }
            });
        }

        imported[table.file] = pending.length;
        skipped[table.file] = skip;
    }

    const notes = [
        (imported['bots'] ?? 0) > 0 &&
            `${imported['bots']} bots came without their token. Paste each token on the Bots tab to switch them back on.`,
        (imported['models'] ?? 0) > 0 &&
            'Imported models have no API key. Add one to each model that needs it.',
        (imported['plugins'] ?? 0) > 0 &&
            'Imported plugins are off until you enter their secrets and switch them on.',
        existing.paused > 0 &&
            `${existing.paused} scheduled tasks came in cancelled, so nothing runs twice. Resume the ones you want.`,
        (skipped['models'] ?? 0) > 0 &&
            'Models this project already had were reused instead of added again.',
        (skipped['people'] ?? 0) > 0 &&
            'People this project already knew were kept as they are, with the imported history added to them.',
        existing.keptFiles.length > 0 &&
            `Kept this project's own ${existing.keptFiles.join(', ')}.`,
        'The audit log stays with the project it was recorded in.',
    ].filter((note): note is string => typeof note === 'string');

    return { imported, skipped, notes };
}

export function teamImport(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        if (!Buffer.isBuffer(request.body)) {
            throw new BadRequestResponse('IMPORT_FILE_REQUIRED');
        }

        const startedAt = Date.now();
        let files: { name: string; data: Buffer }[];

        try {
            files = unzip(request.body, {
                files: TRANSFER_FILES_MAX,
                bytes: TRANSFER_UNPACKED_MAX,
            });
        } catch {
            throw new BadRequestResponse('IMPORT_ZIP_INVALID');
        }

        const read = (name: string): unknown => {
            const file = files.find(
                (candidate) => candidate.name === name || candidate.name.endsWith(`/${name}`),
            );

            if (!file) {
                return undefined;
            }

            try {
                return JSON.parse(file.data.toString('utf8'));
            } catch {
                throw new BadRequestResponse('IMPORT_FILE_INVALID');
            }
        };

        const manifest = read('nura.json') as
            | { format?: unknown; team?: { name?: unknown } }
            | undefined;

        if (manifest?.format !== TRANSFER_FORMAT) {
            throw new BadRequestResponse('IMPORT_FORMAT_UNKNOWN');
        }

        const from = typeof manifest.team?.name === 'string' ? manifest.team.name : '';

        const report = await fastify.db.transaction((manager) =>
            importTables(manager, teamId, (file) => {
                const rows = read(`${file}.json`);

                return Array.isArray(rows) ? rows : [];
            }),
        );

        const list = (counts: Record<string, number>) =>
            Object.entries(counts)
                .filter(([, count]) => count > 0)
                .map(([file, count]) => `${file} ${count}`)
                .join(', ') || 'nothing';

        request.log.info(
            { module: 'transfer', teamId, imported: report.imported, skipped: report.skipped },
            'project imported',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'team.import',
            target: `team:${teamId}`,
            durationMs: Date.now() - startedAt,
            detail: `from "${from}" (${request.body.length} bytes) - added: ${list(report.imported)} - skipped: ${list(report.skipped)}`,
            changes: { from, bytes: request.body.length, ...report },
        });

        reply.send({ from, ...report });
    };

    return {
        schema: schemaTeamImport(),
        config: { ...authGuard() },
        bodyLimit: TRANSFER_UPLOAD_MAX,
        handler,
    };
}
