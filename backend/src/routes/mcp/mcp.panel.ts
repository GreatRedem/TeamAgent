import type { FastifyInstance } from 'fastify';
import { ILike } from 'typeorm';
import {
    ACTIVITY_LIST_DEFAULT,
    PANEL_LIST_MAX,
    PLUGIN_KINDS,
    PLUGIN_STATUS,
    TOOLS,
} from '../../constant.js';

import { BadRequestResponse } from '../../utils/response.js';
import { TeamAgent, TeamAgentDocument } from '../agent/agent.entity.js';
import { isKnownAgentPermission, parseAgentPermissions } from '../agent/agent.permission.js';
import {
    createAgent,
    createAgentDocument,
    modelNames,
    removeAgent,
    removeAgentDocument,
    setAgentPermissions,
    toAgentView,
    updateAgent,
    updateAgentDocument,
} from '../agent/agent.service.js';
import { AuditLog } from '../audit/audit.entity.js';
import type { ActedBy } from '../audit/audit.log.js';
import {
    createModel,
    type ModelProbe,
    removeModel,
    testModel,
    updateModel,
} from '../model/model.service.js';
import { overviewNumbers } from '../overview/overview.service.js';
import type { PluginOutcome } from '../plugin/plugin.common.js';
import { settingsOf } from '../plugin/plugin.common.js';
import { TeamPlugin } from '../plugin/plugin.entity.js';
import { createPlugin, kindOf, removePlugin, updatePlugin } from '../plugin/plugin.service.js';
import { pluginAgents, pluginEvents } from '../plugin/plugin.tools.js';
import { TeamTask } from '../task/task.entity.js';
import { profileLabel } from '../task/task.plan.js';
import { createTask, removeTask, taskViews, updateTask } from '../task/task.service.js';
import { TeamBot, TeamModel } from '../team/team.entity.js';
import {
    createBot,
    profileNames,
    removeBot,
    testBot,
    toBotView,
    updateBot,
} from '../team/team.service.js';
import { TelegramUser } from '../telegram/telegram.entity.js';
import { parsePermissions } from '../telegram/telegram.permission.js';
import { setProfilePermissions } from '../telegram/telegram.service.js';
import { refuse, rosterAsker, type ToolResult } from './mcp.tools.js';
import { checkPublicUrl } from './mcp.web.js';

type Named = { id: number; name: string };

type Picked = { id: number } | { error: string };

function done(value: unknown): ToolResult {
    return { ok: true, content: JSON.stringify(value) };
}

function given(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];

    if (typeof value === 'number') {
        return String(value);
    }

    return typeof value === 'string' ? value.trim() : undefined;
}

export function resolveNamed(items: Named[], value: string, kind = 'agent'): Picked {
    const wanted = value.trim().toLowerCase();
    const byId = /^\d+$/.test(wanted)
        ? items.find((item) => item.id === Number(wanted))
        : undefined;

    if (byId !== undefined) {
        return { id: byId.id };
    }

    const named = items.filter((item) => item.name.toLowerCase() === wanted);

    if (named.length > 1) {
        return { error: `more than one ${kind} is named ${value}; use its id` };
    }

    return named[0] === undefined
        ? { error: `no ${kind} named ${value} in this project` }
        : { id: named[0].id };
}

function pickAnswerer(agents: Named[], value: string | undefined): Picked | undefined {
    if (value === undefined) {
        return undefined;
    }

    return value === '' || value.toLowerCase() === 'none' ? { id: 0 } : resolveNamed(agents, value);
}

export function fieldValues(value: unknown): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value).flatMap(([key, inner]): [string, string][] =>
            typeof inner === 'string' || typeof inner === 'number' ? [[key, String(inner)]] : [],
        ),
    );
}

export function pluginView(plugin: TeamPlugin, names: Map<number, string>) {
    const { secrets, config } = settingsOf(plugin);
    const status = PLUGIN_STATUS.get(plugin.id);
    const named = (id: number) => names.get(id) ?? `agent ${id}`;

    return {
        id: plugin.id,
        kind: plugin.kind,
        name: plugin.name,
        enabled: plugin.enabled,
        account: plugin.account,
        settings: config,
        secrets_set: Object.keys(secrets),
        agents: pluginAgents(plugin).map(named),
        answered_by: plugin.hook_agent_id === 0 ? null : named(plugin.hook_agent_id),
        listening: status?.listening ?? false,
        ...(status?.error && { problem: status.error }),
    };
}

function tested(probe: PluginOutcome | null) {
    return probe === null
        ? {}
        : { test: probe.ok ? 'worked' : `failed: ${probe.error ?? 'unknown'}` };
}

async function taskSummaries(fastify: FastifyInstance, teamId: number, tasks: TeamTask[]) {
    return (await taskViews(fastify, teamId, tasks)).map((task) => ({
        id: task.id,
        title: task.title,
        agent: task.agent_name,
        description: task.description,
        repeat: task.repeat,
        ...(task.after_task_id > 0 && {
            runs_after: {
                task_id: task.after_task_id,
                title: task.after_task_title,
                when: task.after_outcome,
            },
        }),
        status: task.status,
        start_at: task.start_at,
        last_run_at: task.last_run_at,
        last_outcome: task.last_outcome || null,
        runs: task.run_count,
        sends_to: task.profile_name || null,
        group: task.group_title || null,
    }));
}

async function runTaskTool(
    fastify: FastifyInstance,
    teamId: number,
    agents: Named[],
    name: string,
    args: Record<string, unknown>,
    by: ActedBy,
): Promise<ToolResult> {
    const tasks = fastify.db.getRepository(TeamTask);

    if (name === 'task_list') {
        const [rows, total] = await tasks.findAndCount({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            take: PANEL_LIST_MAX,
        });

        return done({
            total,
            shown: rows.length,
            tasks: await taskSummaries(fastify, teamId, rows),
        });
    }

    const agentName = given(args, 'agent');
    const agent = agentName === undefined ? undefined : resolveNamed(agents, agentName);

    if (agent !== undefined && 'error' in agent) {
        return refuse(agent.error);
    }

    if (name === 'task_create') {
        if (agent === undefined) {
            return refuse('agent is required: the name or id of the agent that runs it');
        }

        const saved = await createTask(
            fastify,
            teamId,
            {
                title: given(args, 'title') ?? '',
                description: given(args, 'description') ?? '',
                goal: given(args, 'goal') ?? '',
                agent_id: agent.id,
                profile_id: Number(args['profile_id'] ?? 0),
                start_at: given(args, 'start_at') || new Date().toISOString(),
                repeat: given(args, 'repeat') || 'none',
                after_task_id: Number(args['after_task_id'] ?? 0),
                after_outcome: given(args, 'after_outcome') ?? '',
            },
            by,
        );
        const [view] = await taskSummaries(fastify, teamId, [saved]);

        return done({ result: 'created', task: view });
    }

    const task = await tasks.findOneBy({ id: Number(args['task_id']), team_id: teamId });

    if (!task) {
        return refuse('no such task in this project; get the id from task_list');
    }

    if (name === 'task_delete') {
        const runs = await removeTask(fastify, task, by);

        return done({ result: 'deleted', task_id: task.id, title: task.title, runs_removed: runs });
    }

    const saved = await updateTask(
        fastify,
        task,
        {
            title: given(args, 'title') ?? task.title,
            description: given(args, 'description') ?? task.description,
            goal: given(args, 'goal') ?? task.goal,
            agent_id: agent?.id ?? task.agent_id,
            profile_id:
                args['profile_id'] === undefined ? task.profile_id : Number(args['profile_id']),
            group_bot_id: task.group_bot_id,
            group_chat_id: task.group_chat_id,
            start_at: given(args, 'start_at') || task.start_at.toISOString(),
            repeat: given(args, 'repeat') || task.repeat,
            after_task_id:
                args['after_task_id'] === undefined
                    ? task.after_task_id
                    : Number(args['after_task_id']),
            after_outcome: given(args, 'after_outcome') ?? task.after_outcome,
        },
        by,
    );
    const [view] = await taskSummaries(fastify, teamId, [saved]);

    return done({ result: 'updated', task: view });
}

async function runPluginAdminTool(
    fastify: FastifyInstance,
    teamId: number,
    agents: Named[],
    name: string,
    args: Record<string, unknown>,
    by: ActedBy,
): Promise<ToolResult> {
    const plugins = fastify.db.getRepository(TeamPlugin);
    const names = new Map(agents.map((agent) => [agent.id, agent.name]));

    if (name === 'plugin_kinds') {
        return done({
            kinds: PLUGIN_KINDS.map((kind) => ({
                kind: kind.key,
                label: kind.label,
                description: kind.description,
                answers_messages: kind.inbound !== 'none',
                fields: kind.fields.map((field) => ({
                    key: field.key,
                    label: field.label,
                    required: field.required,
                    secret: field.secret,
                    hint: field.hint,
                })),
            })),
        });
    }

    if (name === 'plugin_list') {
        const rows = await plugins.find({ where: { team_id: teamId }, order: { id: 'ASC' } });

        return done({ plugins: rows.map((plugin) => pluginView(plugin, names)) });
    }

    const listed = Array.isArray(args['agents'])
        ? (args['agents'] as unknown[]).map((item) => resolveNamed(agents, String(item)))
        : undefined;
    const wrong = listed?.find((item) => 'error' in item);

    if (wrong !== undefined && 'error' in wrong) {
        return refuse(wrong.error);
    }

    const agentIds = listed?.flatMap((item) => ('id' in item ? [item.id] : []));
    const answering = pickAnswerer(agents, given(args, 'answered_by'));

    if (answering !== undefined && 'error' in answering) {
        return refuse(answering.error);
    }

    const fields = fieldValues(args['fields']);
    const longSecret = (kindKey: string) =>
        PLUGIN_KINDS.find((kind) => kind.key === kindKey)?.fields.find(
            (field) => field.long === true && field.secret && fields[field.key] !== undefined,
        );

    if (name === 'plugin_create') {
        const kind = kindOf(given(args, 'kind') ?? '');
        const refused = longSecret(kind.key);

        if (refused !== undefined) {
            return refuse(
                `${refused.label} gives full access to the account, so it is only added on the Plugins page, never through a chat`,
            );
        }
        const { plugin, probe } = await createPlugin(
            fastify,
            teamId,
            kind,
            {
                name: given(args, 'name') ?? '',
                enabled: args['enabled'] !== false,
                fields,
                agents: agentIds ?? [],
                hook_agent_id: answering?.id ?? 0,
            },
            by,
        );

        return done({ result: 'created', ...tested(probe), plugin: pluginView(plugin, names) });
    }

    const plugin = await plugins.findOneBy({ id: Number(args['plugin_id']), team_id: teamId });

    if (!plugin) {
        return refuse('no such plugin in this project; get the id from plugin_list');
    }

    const refusedField = longSecret(plugin.kind);

    if (refusedField !== undefined) {
        return refuse(
            `${refusedField.label} gives full access to the account, so it is only changed on the Plugins page, never through a chat`,
        );
    }

    if (name === 'plugin_delete') {
        const requests = await removePlugin(fastify, plugin, by);

        return done({
            result: 'deleted',
            plugin_id: plugin.id,
            name: plugin.name,
            requests_removed: requests,
        });
    }

    const { plugin: saved, probe } = await updatePlugin(
        fastify,
        plugin,
        {
            name: given(args, 'name') || plugin.name,
            enabled: typeof args['enabled'] === 'boolean' ? args['enabled'] : plugin.enabled,
            fields: { ...settingsOf(plugin).config, ...fields },
            agents: agentIds ?? pluginAgents(plugin),
            hook_agent_id: answering?.id ?? plugin.hook_agent_id,
            hook_url: plugin.hook_url,
            hook_events: pluginEvents(plugin),
        },
        by,
    );

    return done({ result: 'updated', ...tested(probe), plugin: pluginView(saved, names) });
}

function lacking(self: TeamAgent, target: TeamAgent): string[] {
    const held = parseAgentPermissions(self.permissions);

    return parseAgentPermissions(target.permissions).filter((key) => !held.includes(key));
}

async function agentSummaries(fastify: FastifyInstance, teamId: number, rows: TeamAgent[]) {
    const models = await modelNames(fastify, teamId);
    const documents = fastify.db.getRepository(TeamAgentDocument);

    return Promise.all(
        rows.map(async (row) =>
            toAgentView(
                row,
                models.get(row.model_id) ?? '',
                await documents.countBy({ agent_id: row.id }),
            ),
        ),
    );
}

async function runAgentTool(
    fastify: FastifyInstance,
    self: TeamAgent,
    agents: TeamAgent[],
    name: string,
    args: Record<string, unknown>,
    by: ActedBy,
): Promise<ToolResult> {
    const teamId = self.team_id;

    if (name === 'agent_list') {
        return done({ agents: await agentSummaries(fastify, teamId, agents) });
    }

    const modelName = given(args, 'model');
    const model =
        modelName === undefined
            ? undefined
            : resolveNamed(
                  await fastify.db.getRepository(TeamModel).findBy({ team_id: teamId }),
                  modelName,
                  'model',
              );

    if (model !== undefined && 'error' in model) {
        return refuse(model.error);
    }

    if (name === 'agent_create') {
        if (model === undefined) {
            return refuse('model is required: the name or id of a model from model_list');
        }

        const instructions = given(args, 'instructions');
        const saved = await createAgent(
            fastify,
            teamId,
            {
                name: given(args, 'name') ?? '',
                description: given(args, 'description') ?? '',
                model_id: model.id,
                ...(instructions !== undefined && { instructions }),
            },
            by,
        );
        const [view] = await agentSummaries(fastify, teamId, [saved]);

        return done({ result: 'created', agent: view });
    }

    const target = agents.find((row) => row.id === Number(args['agent_id']));

    if (target === undefined) {
        return refuse('no such agent in this project; get the id from agent_list');
    }

    const documents = fastify.db.getRepository(TeamAgentDocument);

    if (name === 'agent_files') {
        const rows = await documents.find({
            where: { agent_id: target.id },
            order: { name: 'ASC' },
        });

        return done({
            agent: target.name,
            files: rows.map((row) => ({
                name: row.name,
                chars: row.content.length,
                updated_at: row.updated_at,
            })),
        });
    }

    const fileName = given(args, 'name') ?? '';
    const file = name.startsWith('agent_file_')
        ? await documents.findOneBy({ agent_id: target.id, name: fileName })
        : null;

    if (name.startsWith('agent_file_') && name !== 'agent_file_write' && file === null) {
        return refuse(`${target.name} has no file named ${fileName}; see agent_files`);
    }

    if (name === 'agent_file_read' && file !== null) {
        return done({ agent: target.name, name: file.name, content: file.content });
    }

    if (target.id === self.id && (name === 'agent_delete' || name === 'agent_permissions')) {
        return refuse('an agent cannot delete itself or change its own permissions; ask the owner');
    }

    const above = lacking(self, target);

    if (above.length > 0) {
        return refuse(
            `${target.name} has permissions you do not have (${above.join(', ')}), so only the owner can change it`,
        );
    }

    if (name === 'agent_file_write') {
        const body = {
            name: fileName,
            content: typeof args['content'] === 'string' ? args['content'] : '',
        };
        const saved =
            file === null
                ? await createAgentDocument(fastify, target, body, by)
                : await updateAgentDocument(fastify, target, file.id, body, by);

        return done({
            result: file === null ? 'created' : 'replaced',
            agent: target.name,
            name: saved.name,
            chars: saved.content.length,
        });
    }

    if (name === 'agent_file_delete' && file !== null) {
        await removeAgentDocument(fastify, target, file.id, by);

        return done({ result: 'deleted', agent: target.name, name: file.name });
    }

    if (name === 'agent_delete') {
        const removed = await removeAgent(fastify, teamId, target.id, by);

        return done({ result: 'deleted', agent_id: target.id, name: target.name, ...removed });
    }

    if (name === 'agent_permissions') {
        const requested = args['permissions'];

        if (!Array.isArray(requested) || requested.some((key) => typeof key !== 'string')) {
            return refuse('permissions must be a list of permission keys');
        }

        const unknown = requested.filter((key) => !isKnownAgentPermission(key));

        if (unknown.length > 0) {
            return refuse(`unknown permission: ${unknown.join(', ')}`);
        }

        const held = parseAgentPermissions(self.permissions);
        const beyond = requested.filter((key) => !held.includes(key));

        if (beyond.length > 0) {
            return refuse(`you can only give permissions you have yourself: ${beyond.join(', ')}`);
        }

        const saved = await setAgentPermissions(fastify, target, requested, by);

        return done({
            result: 'updated',
            agent: target.name,
            permissions: parseAgentPermissions(saved.permissions),
        });
    }

    const saved = await updateAgent(
        fastify,
        target,
        {
            name: given(args, 'name') || target.name,
            description: given(args, 'description') ?? target.description,
            model_id: model?.id ?? target.model_id,
        },
        by,
    );
    const [view] = await agentSummaries(fastify, teamId, [saved]);

    return done({ result: 'updated', agent: view });
}

function modelSummary(model: TeamModel) {
    return {
        id: model.id,
        name: model.name,
        model: model.model,
        base_url: model.base_url,
        context_tokens: model.context_tokens,
        key_set: model.api_key !== '',
    };
}

function probed(probe: ModelProbe) {
    return {
        works: probe.ok,
        problem: probe.reason,
        model_found: probe.found,
        context_tokens: probe.context,
    };
}

async function runModelTool(
    fastify: FastifyInstance,
    teamId: number,
    name: string,
    args: Record<string, unknown>,
    by: ActedBy,
): Promise<ToolResult> {
    const models = fastify.db.getRepository(TeamModel);

    if (name === 'model_list') {
        const rows = await models.find({ where: { team_id: teamId }, order: { id: 'ASC' } });

        return done({ models: rows.map(modelSummary) });
    }

    const baseUrl = given(args, 'base_url');

    if (baseUrl !== undefined) {
        const check = await checkPublicUrl(baseUrl);

        if (!check.ok) {
            return refuse(`base_url: ${check.reason ?? 'refused'}`);
        }
    }

    const apiKey = given(args, 'api_key') ?? '';
    const tokens = args['context_tokens'];

    if (name === 'model_create') {
        const saved = await createModel(
            fastify,
            teamId,
            {
                name: given(args, 'name') ?? '',
                base_url: baseUrl ?? '',
                model: given(args, 'model') ?? '',
                api_key: apiKey,
                context_tokens: tokens ?? 0,
            },
            by,
        );

        return done({
            result: 'created',
            test: probed(await testModel(fastify, saved, by)),
            model: modelSummary(saved),
        });
    }

    const existing = await models.findOneBy({ id: Number(args['model_id']), team_id: teamId });

    if (!existing) {
        return refuse('no such model in this project; get the id from model_list');
    }

    if (name === 'model_test') {
        return done({ model: existing.name, ...probed(await testModel(fastify, existing, by)) });
    }

    if (name === 'model_delete') {
        const detached = await removeModel(fastify, teamId, existing.id, by);

        return done({
            result: 'deleted',
            model_id: existing.id,
            name: existing.name,
            agents_left_without_model: detached,
        });
    }

    if (
        baseUrl !== undefined &&
        baseUrl !== existing.base_url &&
        apiKey === '' &&
        existing.api_key !== ''
    ) {
        return refuse(
            'a new base_url needs its api_key too; the saved key is never sent to a new address',
        );
    }

    const saved = await updateModel(
        fastify,
        existing,
        {
            name: given(args, 'name') || existing.name,
            base_url: baseUrl || existing.base_url,
            model: given(args, 'model') || existing.model,
            api_key: apiKey,
            context_tokens: tokens ?? existing.context_tokens,
        },
        by,
    );

    return done({ result: 'updated', model: modelSummary(saved) });
}

function botSummary(bot: TeamBot, names: Map<number, string>, people: Map<number, string>) {
    const view = toBotView(bot, names.get(bot.agent_id) ?? '', people);

    return {
        id: view.id,
        name: view.name,
        answered_by: view.agent_name || null,
        groups: view.groups,
        answers_only: view.profiles,
        mode: view.mode,
        token_set: bot.token !== '',
    };
}

async function runBotTool(
    fastify: FastifyInstance,
    teamId: number,
    agents: Named[],
    name: string,
    args: Record<string, unknown>,
    by: ActedBy,
): Promise<ToolResult> {
    const bots = fastify.db.getRepository(TeamBot);
    const names = new Map(agents.map((agent) => [agent.id, agent.name]));
    const summaries = async (rows: TeamBot[]) => {
        const people = await profileNames(fastify, teamId, rows);

        return rows.map((row) => botSummary(row, names, people));
    };

    if (name === 'bot_list') {
        const rows = await bots.find({ where: { team_id: teamId }, order: { id: 'ASC' } });

        return done({ bots: await summaries(rows) });
    }

    const answering = pickAnswerer(agents, given(args, 'agent'));

    if (answering !== undefined && 'error' in answering) {
        return refuse(answering.error);
    }

    if (name === 'bot_create') {
        const bot = await createBot(
            fastify,
            teamId,
            { name: given(args, 'name') ?? '', token: given(args, 'token') ?? '', public_url: '' },
            by,
        );
        const saved =
            answering === undefined || answering.id === 0
                ? bot
                : await updateBot(
                      fastify,
                      bot,
                      { name: bot.name, public_url: bot.public_url, agent_id: answering.id },
                      by,
                  );
        const probe = await testBot(fastify, saved, by);
        const [view] = await summaries([saved]);

        return done({
            result: 'created',
            test: probe.ok
                ? `worked: @${probe.username ?? ''}`
                : `failed: ${probe.reason ?? 'unknown'}`,
            bot: view,
        });
    }

    const bot = await bots.findOneBy({ id: Number(args['bot_id']), team_id: teamId });

    if (!bot) {
        return refuse('no such bot in this project; get the id from bot_list');
    }

    if (name === 'bot_test') {
        return done({ bot: bot.name, ...(await testBot(fastify, bot, by)) });
    }

    if (name === 'bot_delete') {
        await removeBot(fastify, teamId, bot.id, by);

        return done({ result: 'deleted', bot_id: bot.id, name: bot.name });
    }

    const token = given(args, 'token');
    const saved = await updateBot(
        fastify,
        bot,
        {
            name: given(args, 'name') || bot.name,
            public_url: bot.public_url,
            agent_id: answering?.id ?? bot.agent_id,
            ...(typeof args['groups'] === 'boolean' && { groups: args['groups'] }),
            ...(Array.isArray(args['answers_only']) && { profiles: args['answers_only'] }),
            ...(token && { token }),
        },
        by,
    );
    const [view] = await summaries([saved]);

    return done({ result: 'updated', bot: view });
}

function personSummary(person: TelegramUser) {
    return {
        profile_id: person.id,
        name: profileLabel(person),
        username: person.username,
        permissions: parsePermissions(person.permissions),
        messages: person.message_count,
        last_seen_at: person.last_seen_at,
    };
}

async function runPeopleTool(
    fastify: FastifyInstance,
    teamId: number,
    name: string,
    args: Record<string, unknown>,
    by: ActedBy,
): Promise<ToolResult> {
    if (name === 'overview') {
        return done(await overviewNumbers(fastify, teamId));
    }

    if (name === 'activity_list') {
        const wanted = Math.trunc(Number(args['limit'])) || ACTIVITY_LIST_DEFAULT;
        const rows = await fastify.db.getRepository(AuditLog).find({
            where:
                args['failures_only'] === true
                    ? { team_id: teamId, outcome: 'error' }
                    : { team_id: teamId },
            order: { id: 'DESC' },
            take: Math.min(Math.max(wanted, 1), PANEL_LIST_MAX),
        });

        return done({
            entries: rows.map((row) => ({
                at: row.created_at,
                action: row.action,
                outcome: row.outcome,
                by: row.actor,
                detail: row.detail,
            })),
        });
    }

    if (name === 'people_list') {
        const query = (given(args, 'query') ?? '').slice(0, 64);
        const like = ILike(`%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
        const offset = Math.max(Math.trunc(Number(args['offset'])) || 0, 0);
        const [rows, total] = await fastify.db.getRepository(TelegramUser).findAndCount({
            where:
                query === ''
                    ? { team_id: teamId }
                    : [
                          { team_id: teamId, first_name: like },
                          { team_id: teamId, last_name: like },
                          { team_id: teamId, username: like },
                      ],
            order: { last_seen_at: 'DESC' },
            skip: offset,
            take: PANEL_LIST_MAX,
        });

        return done({ total, offset, people: rows.map(personSummary) });
    }

    const person = await setProfilePermissions(
        fastify,
        teamId,
        Number(args['profile_id']),
        args['permissions'],
        by,
    );

    return done({ result: 'updated', person: personSummary(person) });
}

export async function runPanelTool(
    fastify: FastifyInstance,
    agent: TeamAgent,
    user: TelegramUser,
    name: string,
    args: Record<string, unknown>,
): Promise<ToolResult> {
    const asker = await rosterAsker(fastify, agent.team_id, user);

    if (!asker.ok) {
        return refuse(asker.reason);
    }

    const by: ActedBy = {
        log: fastify.log,
        agent: { id: agent.id, name: agent.name, askedBy: user.id, asker: asker.name },
    };
    const teamId = agent.team_id;
    const area = TOOLS.find((tool) => tool.name === name)?.permission;
    const agents = await fastify.db.getRepository(TeamAgent).findBy({ team_id: teamId });

    try {
        switch (area) {
            case 'panel.tasks':
                return await runTaskTool(fastify, teamId, agents, name, args, by);
            case 'panel.plugins':
                return await runPluginAdminTool(fastify, teamId, agents, name, args, by);
            case 'panel.agents':
                return await runAgentTool(fastify, agent, agents, name, args, by);
            case 'panel.models':
                return await runModelTool(fastify, teamId, name, args, by);
            case 'panel.bots':
                return await runBotTool(fastify, teamId, agents, name, args, by);
            case 'panel.people':
                return await runPeopleTool(fastify, teamId, name, args, by);
            default:
                return refuse('unknown tool');
        }
    } catch (cause) {
        if (cause instanceof BadRequestResponse) {
            return refuse(cause.result);
        }

        throw cause;
    }
}
