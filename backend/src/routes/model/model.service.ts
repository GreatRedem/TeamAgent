import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
    CONTEXT_TOKENS_MAX,
    DETECT_TIMEOUT,
    KEY_MAX,
    KEY_MIN,
    LIST_PAGE,
    MODEL_EXCHANGE_PAGE,
    MODEL_MAX,
    NAME_MAX,
    NAME_MIN,
    NO_USAGE,
    OPENROUTER_URL,
    PROBE_IDS_MAX,
    PROVIDERS,
    TEST_TIMEOUT,
    URL_MAX,
} from '../../constant.js';

import { authGuard } from '../../plugins/authentication.js';
import { BadRequestResponse } from '../../utils/response.js';
import { TeamAgent, TeamAgentExchange } from '../agent/agent.entity.js';
import { exchangeView } from '../agent/agent.service.js';
import { isOpenRouter } from '../agent/agent.transport.js';
import { exchangeUsage } from '../agent/agent.usage.js';
import { audit, changed } from '../audit/audit.log.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TeamModel } from '../team/team.entity.js';
import { freeCandidates, isAutoFree } from './model.auto.js';
import { fetchCatalog, readContextLength } from './model.provider.js';
import {
    schemaModelCatalog,
    schemaModelCreate,
    schemaModelExchanges,
    schemaModelList,
    schemaModelListIds,
    schemaModelProbe,
    schemaModelRemove,
    schemaModelTest,
    schemaModelUpdate,
} from './model.schema.js';

function readModelId(request: FastifyRequest) {
    return readParamId(request, 'modelId', 'MODEL_ID_INVALID');
}

function toModelView(model: TeamModel) {
    const hint =
        model.api_key === ''
            ? 'none'
            : model.api_key.length > 8
              ? `${model.api_key.slice(0, 3)}...${model.api_key.slice(-4)}`
              : 'set';

    return {
        id: model.id,
        name: model.name,
        model: model.model,
        base_url: model.base_url,
        key_hint: hint,
        context_tokens: model.context_tokens,
        created_at: model.created_at,
    };
}

function readApiKey(request: FastifyRequest): string {
    const value = request.getBody('api_key').max(KEY_MAX).asString().trim();

    if (value !== '' && value.length < KEY_MIN) {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    return value;
}

function readBaseUrl(request: FastifyRequest): string {
    const value = request.getBody('base_url').min(4).max(URL_MAX).asString().trim();

    let parsed: URL;

    try {
        parsed = new URL(value);
    } catch {
        throw new BadRequestResponse('MODEL_URL_INVALID');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new BadRequestResponse('MODEL_URL_INVALID');
    }

    const loopback =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1' ||
        parsed.hostname === '[::1]';

    if (parsed.protocol === 'http:' && !loopback) {
        throw new BadRequestResponse('MODEL_URL_INSECURE');
    }

    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

function readContextTokens(request: FastifyRequest): number {
    const raw = (request.body as { context_tokens?: unknown } | undefined)?.context_tokens;

    const contextTokens = Number(raw ?? 0);

    if (
        !Number.isInteger(contextTokens) ||
        contextTokens < 0 ||
        contextTokens > CONTEXT_TOKENS_MAX
    ) {
        throw new BadRequestResponse('MODEL_CONTEXT_INVALID');
    }

    return contextTokens;
}

function readModelBody(request: FastifyRequest) {
    const name = request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim();
    const model = request.getBody('model').min(1).max(MODEL_MAX).asString().trim();
    const baseUrl = readBaseUrl(request);
    const contextTokens = readContextTokens(request);

    if (name.length < NAME_MIN || model === '') {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    if (isAutoFree(model) && !isOpenRouter(baseUrl)) {
        throw new BadRequestResponse('MODEL_AUTO_FREE_UNSUPPORTED');
    }

    return { name, model, baseUrl, contextTokens };
}

async function findOwnedModel(
    fastify: FastifyInstance,
    teamId: number,
    modelId: number,
    accountId: number,
): Promise<TeamModel> {
    await findOwnedTeam(fastify, teamId, accountId);

    const model = await fastify.db
        .getRepository(TeamModel)
        .findOneBy({ id: modelId, team_id: teamId });

    if (!model) {
        throw new BadRequestResponse('MODEL_NOT_FOUND');
    }

    return model;
}

interface ModelProbe {
    ok: boolean;
    models?: number;
    found?: boolean;
    context?: number;
    ids?: string[];
    reason?: string;
}

export async function probeModel(
    baseUrl: string,
    apiKey: string,
    model: string,
    timeout = TEST_TIMEOUT,
): Promise<ModelProbe> {
    let response: Response;

    try {
        response = await fetch(`${baseUrl}/models`, {
            headers: apiKey === '' ? {} : { authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(timeout),
        });
    } catch {
        return { ok: false, reason: 'MODEL_UNREACHABLE' };
    }

    if (response.status === 401 || response.status === 403) {
        const body = (await response.json().catch(() => undefined)) as
            | { type?: unknown; error?: { type?: unknown } }
            | undefined;

        const kind = `${typeof body?.type === 'string' ? body.type : ''} ${typeof body?.error?.type === 'string' ? body.error.type : ''}`;

        return {
            ok: false,
            reason: /client/i.test(kind) ? 'MODEL_CLIENT_REJECTED' : 'MODEL_KEY_REJECTED',
        };
    }

    if (!response.ok) {
        return { ok: false, reason: 'MODEL_ENDPOINT_REJECTED' };
    }

    const payload = (await response.json().catch(() => undefined)) as
        | { data?: unknown }
        | undefined;

    if (!payload || !Array.isArray(payload.data)) {
        return { ok: false, reason: 'MODEL_RESPONSE_UNEXPECTED' };
    }

    const ids = payload.data
        .map((entry) =>
            typeof entry === 'object' && entry !== null
                ? (entry as { id?: unknown }).id
                : undefined,
        )
        .filter((id): id is string => typeof id === 'string');

    const entry = payload.data.find(
        (candidate) =>
            typeof candidate === 'object' &&
            candidate !== null &&
            (candidate as { id?: unknown }).id === model,
    );

    const context = readContextLength(entry);

    const listed = apiKey === '' ? ids : ids.filter((id) => !id.includes(apiKey));

    return {
        ok: true,
        models: payload.data.length,
        found: ids.includes(model),
        ids: listed.slice(0, PROBE_IDS_MAX),
        ...(context > 0 && { context }),
    };
}

async function withAutoFree(probe: ModelProbe, model: string): Promise<ModelProbe> {
    if (!probe.ok || !isAutoFree(model)) {
        return probe;
    }

    const free = freeCandidates((await fetchCatalog()).models, false);

    return {
        ...probe,
        found: free.length > 0,
        ...(free.length > 0 && { context: free[0].context }),
    };
}

export function listingKey(
    typed: string,
    baseUrl: string,
    stored: { base_url: string; api_key: string } | null,
): string {
    if (typed !== '' || stored === null) {
        return typed;
    }

    try {
        return new URL(baseUrl).origin === new URL(stored.base_url).origin ? stored.api_key : '';
    } catch {
        return '';
    }
}

async function readStoredModel(fastify: FastifyInstance, request: FastifyRequest, teamId: number) {
    const raw = (request.body as { model_id?: unknown } | undefined)?.model_id;

    return typeof raw === 'number' && Number.isInteger(raw) && raw > 0
        ? await findOwnedModel(fastify, teamId, raw, request.account_id)
        : null;
}

async function detectContext(baseUrl: string, apiKey: string, model: string): Promise<number> {
    try {
        return (await probeModel(baseUrl, apiKey, model, DETECT_TIMEOUT)).context ?? 0;
    } catch {
        return 0;
    }
}

export function modelCreate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        const { name, model, baseUrl, contextTokens } = readModelBody(request);
        const apiKey = readApiKey(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const repository = fastify.db.getRepository(TeamModel);

        if (await repository.findOneBy({ team_id: teamId, base_url: baseUrl, model })) {
            throw new BadRequestResponse('MODEL_ALREADY_ADDED');
        }

        const detected =
            contextTokens > 0 || isAutoFree(model)
                ? contextTokens
                : await detectContext(baseUrl, apiKey, model);

        const saved = await repository.save({
            team_id: teamId,
            name,
            model,
            base_url: baseUrl,
            api_key: apiKey,
            context_tokens: detected,
        });

        request.log.info(
            { module: 'model', teamId, modelId: saved.id, accountId: request.account_id },
            'team model added',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.create',
            target: `model:${saved.id}`,
            detail: `${name} - ${model}`,
            changes: {
                name,
                model,
                base_url: baseUrl,
                api_key: apiKey,
                context_tokens: detected,
            },
        });

        reply.send(toModelView(saved));
    };

    return { schema: schemaModelCreate(), config: { ...authGuard() }, handler };
}

export function modelList(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { limit, offset } = readPage(request, LIST_PAGE);

        const [rows, total] = await fastify.db.getRepository(TeamModel).findAndCount({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        const usage = await exchangeUsage(
            fastify,
            teamId,
            'model_id',
            items.map((item) => item.id),
        );

        reply.send({
            limit,
            offset,
            has_more,
            total,
            models: items.map((item) => ({
                ...toModelView(item),
                usage: usage.get(item.id) ?? NO_USAGE,
            })),
        });
    };

    return { schema: schemaModelList(), config: { ...authGuard() }, handler };
}

export function modelExchanges(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const model = await findOwnedModel(
            fastify,
            teamId,
            readModelId(request),
            request.account_id,
        );

        const { limit, offset } = readPage(request, MODEL_EXCHANGE_PAGE);

        const [rows, total] = await fastify.db.getRepository(TeamAgentExchange).findAndCount({
            where: { team_id: teamId, model_id: model.id },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        const agents = new Map(
            (
                await fastify.db
                    .getRepository(TeamAgent)
                    .find({ where: { team_id: teamId }, select: { id: true, name: true } })
            ).map((agent) => [agent.id, agent.name]),
        );

        reply.send({
            limit,
            offset,
            has_more,
            total,
            exchanges: items.map((exchange) =>
                exchangeView(exchange, agents.get(exchange.agent_id) ?? ''),
            ),
        });
    };

    return { schema: schemaModelExchanges(), config: { ...authGuard() }, handler };
}

export function modelUpdate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const modelId = readModelId(request);

        const { name, model, baseUrl, contextTokens } = readModelBody(request);

        const apiKey = readApiKey(request);

        const existing = await findOwnedModel(fastify, teamId, modelId, request.account_id);
        const diff = changed(existing, {
            name,
            model,
            base_url: baseUrl,
            context_tokens: contextTokens,
            ...(apiKey !== '' && { api_key: apiKey }),
        });

        await fastify.db.getRepository(TeamModel).update(
            { id: existing.id, team_id: teamId },
            {
                name,
                model,
                base_url: baseUrl,
                context_tokens: contextTokens,
                ...(apiKey !== '' && { api_key: apiKey }),
            },
        );

        request.log.info(
            {
                module: 'model',
                teamId,
                modelId: existing.id,
                accountId: request.account_id,
                rotatedKey: apiKey !== '',
            },
            'team model updated',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.update',
            target: `model:${existing.id}`,
            detail: `${name} - changed ${Object.keys(diff).join(', ') || 'nothing'}`,
            changes: diff,
        });

        reply.send(
            toModelView({
                ...existing,
                name,
                model,
                base_url: baseUrl,
                context_tokens: contextTokens,
                api_key: apiKey !== '' ? apiKey : existing.api_key,
            }),
        );
    };

    return { schema: schemaModelUpdate(), config: { ...authGuard() }, handler };
}

export function modelRemove(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const modelId = readModelId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const gone = await fastify.db
            .getRepository(TeamModel)
            .findOneBy({ id: modelId, team_id: teamId });

        const removed = await fastify.db
            .getRepository(TeamModel)
            .delete({ id: modelId, team_id: teamId });

        if (removed.affected !== 1) {
            throw new BadRequestResponse('MODEL_NOT_FOUND');
        }

        const detached = await fastify.db
            .getRepository(TeamAgent)
            .update({ team_id: teamId, model_id: modelId }, { model_id: 0 });

        request.log.info(
            {
                module: 'model',
                teamId,
                modelId,
                accountId: request.account_id,
                detachedAgents: detached.affected ?? 0,
            },
            'team model removed',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.remove',
            target: `model:${modelId}`,
            detail: `${gone?.name ?? modelId} - ${detached.affected ?? 0} agent(s) detached`,
            changes: { model: gone, agents_detached: detached.affected ?? 0 },
        });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaModelRemove(), config: { ...authGuard() }, handler };
}

export function modelTest(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const modelId = readModelId(request);

        const model = await findOwnedModel(fastify, teamId, modelId, request.account_id);

        const probe = await withAutoFree(
            await probeModel(model.base_url, model.api_key, model.model),
            model.model,
        );

        if (
            !isAutoFree(model.model) &&
            (probe.context ?? 0) > 0 &&
            probe.context !== model.context_tokens
        ) {
            await fastify.db
                .getRepository(TeamModel)
                .update({ id: model.id, team_id: teamId }, { context_tokens: probe.context });
        }

        request.log.info(
            {
                module: 'model',
                teamId,
                modelId: model.id,
                accountId: request.account_id,
                ok: probe.ok,
                reason: probe.reason,
                context: probe.context,
            },
            'team model tested',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.test',
            target: `model:${model.id}`,
            outcome: probe.ok ? 'ok' : 'error',
            detail: probe.ok
                ? `${probe.models ?? 0} models listed${(probe.context ?? 0) > 0 ? ` - ${probe.context} token window` : ''}`
                : (probe.reason ?? 'failed'),
            changes: {
                probe,
                ...(!isAutoFree(model.model) &&
                    (probe.context ?? 0) > 0 &&
                    probe.context !== model.context_tokens && {
                        context_tokens: { from: model.context_tokens, to: probe.context },
                    }),
            },
        });

        reply.send(probe);
    };

    return { schema: schemaModelTest(), config: { ...authGuard() }, handler };
}

export function modelProbe(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const baseUrl = readBaseUrl(request);
        const apiKey = listingKey(
            readApiKey(request),
            baseUrl,
            await readStoredModel(fastify, request, teamId),
        );

        const raw = (request.body as { model?: unknown } | undefined)?.model;
        const model = typeof raw === 'string' ? raw.trim().slice(0, MODEL_MAX) : '';

        const probe = await withAutoFree(await probeModel(baseUrl, apiKey, model), model);

        request.log.info(
            {
                module: 'model',
                teamId,
                accountId: request.account_id,
                ok: probe.ok,
                reason: probe.reason,
                listed: probe.ids?.length ?? 0,
            },
            'model endpoint probed',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.probe',
            target: `endpoint:${new URL(baseUrl).host}`,
            outcome: probe.ok ? 'ok' : 'error',
            detail: probe.ok ? `${probe.models ?? 0} models listed` : (probe.reason ?? 'failed'),
        });

        reply.send(probe);
    };

    return { schema: schemaModelProbe(), config: { ...authGuard() }, handler };
}

export function modelListIds(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const baseUrl = readBaseUrl(request);
        const typed = readApiKey(request);

        const stored = await readStoredModel(fastify, request, teamId);

        const probe = await probeModel(baseUrl, listingKey(typed, baseUrl, stored), '');

        request.log.debug(
            {
                module: 'model',
                teamId,
                accountId: request.account_id,
                ok: probe.ok,
                reason: probe.reason,
                listed: probe.ids?.length ?? 0,
            },
            'model endpoint listed',
        );

        reply.send({
            ok: probe.ok,
            ids: probe.ids ?? [],
            ...(probe.reason !== undefined && { reason: probe.reason }),
        });
    };

    return { schema: schemaModelListIds(), config: { ...authGuard() }, handler };
}

export function modelCatalog() {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const catalog = await fetchCatalog();

        if (catalog.reason !== undefined) {
            request.log.warn(
                {
                    module: 'model',
                    accountId: request.account_id,
                    reason: catalog.reason,
                    served: catalog.models.length,
                },
                'provider catalog unavailable',
            );
        }

        reply.send({
            base_url: OPENROUTER_URL,
            providers: PROVIDERS,
            models: catalog.models,
            ...(catalog.reason !== undefined && { reason: catalog.reason }),
        });
    };

    return { schema: schemaModelCatalog(), config: { ...authGuard() }, handler };
}
