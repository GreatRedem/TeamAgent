import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';

import { TeamModel } from '../team/team.entity.js';
import { TeamAgent } from '../agent/agent.entity.js';
import { findOwnedTeam, readParamId, readTeamId } from '../team/team.access.js';
import { OPENROUTER_URL, fetchCatalog } from './model.provider.js';
import { schemaModelCatalog, schemaModelCreate, schemaModelList, schemaModelRemove, schemaModelTest, schemaModelUpdate } from './model.schema.js';

import { audit } from '../audit/audit.log.js';

import { BadRequestResponse } from '../../utils/response.js';

const NAME_MIN = 2;
const NAME_MAX = 64;
const MODEL_MAX = 128;
const URL_MAX = 256;
const KEY_MIN = 8;
const KEY_MAX = 256;

/** The endpoint is a third party; a hung request must not hold a handler open. */
const TEST_TIMEOUT = 8000;

const readModelId = (request: FastifyRequest) => readParamId(request, 'modelId', 'MODEL_ID_INVALID');

/**
 * What the client may see of a stored key: enough to tell two apart, not enough
 * to use. 'none' when the endpoint needs no key, 'set' when the key is too
 * short to show any of safely.
 */
function toModelView(model: TeamModel)
{
    const hint = model.api_key === '' ? 'none'
        : model.api_key.length > 8 ? `${ model.api_key.slice(0, 3) }...${ model.api_key.slice(-4) }`
            : 'set';

    return {
        id: model.id,
        name: model.name,
        model: model.model,
        base_url: model.base_url,
        key_hint: hint,
        created_at: model.created_at
    };
}

/**
 * A key is optional -- a locally hosted endpoint usually has none -- but a
 * short one is far more likely to be a truncated paste than a real credential,
 * so anything non-empty still has to clear the minimum.
 */
function readApiKey(request: FastifyRequest): string
{
    const value = request.getBody('api_key').max(KEY_MAX).asString().trim();

    if (value !== '' && value.length < KEY_MIN)
    {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    return value;
}

/**
 * The compatible root, e.g. `https://api.openai.com/v1`.
 *
 * Plain http is allowed only for loopback, which is how a locally hosted
 * model is reached; anywhere else it would put the API key on the wire in
 * clear text.
 */
function readBaseUrl(request: FastifyRequest): string
{
    const value = request.getBody('base_url').min(4).max(URL_MAX).asString().trim();

    let parsed: URL;

    try
    {
        parsed = new URL(value);
    }
    catch
    {
        throw new BadRequestResponse('MODEL_URL_INVALID');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    {
        throw new BadRequestResponse('MODEL_URL_INVALID');
    }

    const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1' || parsed.hostname === '[::1]';

    if (parsed.protocol === 'http:' && !loopback)
    {
        throw new BadRequestResponse('MODEL_URL_INSECURE');
    }

    // Trailing slash removed so callers can append `/models` or
    // `/chat/completions` without producing a double slash.
    return `${ parsed.origin }${ parsed.pathname.replace(/\/+$/, '') }`;
}

function readModelBody(request: FastifyRequest)
{
    const name = request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim();
    const model = request.getBody('model').min(1).max(MODEL_MAX).asString().trim();
    const baseUrl = readBaseUrl(request);

    if (name.length < NAME_MIN || model === '')
    {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    return { name, model, baseUrl };
}

async function findOwnedModel(fastify: FastifyInstance, teamId: number, modelId: number, accountId: number): Promise<TeamModel>
{
    await findOwnedTeam(fastify, teamId, accountId);

    const model = await fastify.db.getRepository(TeamModel).findOneBy({ id: modelId, team_id: teamId });

    if (!model)
    {
        throw new BadRequestResponse('MODEL_NOT_FOUND');
    }

    return model;
}

interface ModelProbe
{
    ok: boolean;
    models?: number;
    found?: boolean;
    reason?: string;
}

/**
 * Asks the endpoint for its model list, which is the lightest call an
 * OpenAI-compatible server answers.
 *
 * Nothing from the response or the failure is returned verbatim. The request
 * carries the API key, so an error object can name a url containing it, and the
 * body could be an arbitrary third-party payload -- only the flat outcome below
 * escapes. That also keeps the endpoint from being used to read internal
 * services by proxy.
 *
 * Exported so it can be exercised against a stubbed fetch.
 */
export async function probeModel(baseUrl: string, apiKey: string, model: string): Promise<ModelProbe>
{
    let response: Response;

    try
    {
        response = await fetch(`${ baseUrl }/models`, {
            // An empty key means the endpoint wants none; sending `Bearer `
            // with nothing after it is rejected by some servers outright.
            headers: apiKey === '' ? { } : { authorization: `Bearer ${ apiKey }` },
            signal: AbortSignal.timeout(TEST_TIMEOUT) });
    }
    catch
    {
        return { ok: false, reason: 'MODEL_UNREACHABLE' };
    }

    if (response.status === 401 || response.status === 403)
    {
        return { ok: false, reason: 'MODEL_KEY_REJECTED' };
    }

    if (!response.ok)
    {
        return { ok: false, reason: 'MODEL_ENDPOINT_REJECTED' };
    }

    const payload = await response.json().catch(() => undefined) as { data?: unknown } | undefined;

    if (!payload || !Array.isArray(payload.data))
    {
        // Reachable and authorised, but not answering the compatible shape.
        return { ok: false, reason: 'MODEL_RESPONSE_UNEXPECTED' };
    }

    const ids = payload.data
        .map((entry) => typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }).id : undefined)
        .filter((id): id is string => typeof id === 'string');

    return { ok: true, models: payload.data.length, found: ids.includes(model) };
}

export function modelCreate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        const { name, model, baseUrl } = readModelBody(request);
        const apiKey = readApiKey(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const repository = fastify.db.getRepository(TeamModel);

        if (await repository.findOneBy({ team_id: teamId, base_url: baseUrl, model }))
        {
            throw new BadRequestResponse('MODEL_ALREADY_ADDED');
        }

        const saved = await repository.save({ team_id: teamId, name, model, base_url: baseUrl, api_key: apiKey });

        // The key is never logged; the row id is enough to trace it.
        request.log.info({ module: 'model', teamId, modelId: saved.id, accountId: request.account_id }, 'team model added');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'model.create', target: `model:${ saved.id }`, detail: `${ name } - ${ model }` });

        reply.send(toModelView(saved));
    };

    return { schema: schemaModelCreate, config: { ...authGuard() }, handler };
}

export function modelList(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const models = await fastify.db.getRepository(TeamModel).find({ where: { team_id: teamId }, order: { id: 'DESC' } });

        reply.send({ models: models.map(toModelView) });
    };

    return { schema: schemaModelList, config: { ...authGuard() }, handler };
}

export function modelUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const modelId = readModelId(request);

        const { name, model, baseUrl } = readModelBody(request);

        // Blank means "keep the stored key": the client cannot read it back, so
        // requiring it on every edit would force re-entry just to rename a model.
        // That makes blank ambiguous for a key the caller wants to *remove* --
        // delete and re-add the model for that.
        const apiKey = readApiKey(request);

        const existing = await findOwnedModel(fastify, teamId, modelId, request.account_id);

        await fastify.db.getRepository(TeamModel).update(
            { id: existing.id, team_id: teamId },
            { name, model, base_url: baseUrl, ...apiKey !== '' && { api_key: apiKey } });

        request.log.info({ module: 'model', teamId, modelId: existing.id, accountId: request.account_id, rotatedKey: apiKey !== '' }, 'team model updated');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'model.update', target: `model:${ existing.id }`, detail: apiKey !== '' ? `${ name } - key rotated` : name });

        reply.send(toModelView({ ...existing, name, model, base_url: baseUrl, api_key: apiKey !== '' ? apiKey : existing.api_key }));
    };

    return { schema: schemaModelUpdate, config: { ...authGuard() }, handler };
}

export function modelRemove(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const modelId = readModelId(request);

        // Owning the team authorises the delete; the row is then matched on both
        // ids so a model id from another team cannot be removed through it.
        await findOwnedTeam(fastify, teamId, request.account_id);

        const removed = await fastify.db.getRepository(TeamModel).delete({ id: modelId, team_id: teamId });

        if (removed.affected !== 1)
        {
            throw new BadRequestResponse('MODEL_NOT_FOUND');
        }

        // Agents referencing this model are detached rather than left pointing
        // at an id that no longer resolves; 0 reads as "no model attached".
        const detached = await fastify.db.getRepository(TeamAgent).update({ team_id: teamId, model_id: modelId }, { model_id: 0 });

        request.log.info({ module: 'model', teamId, modelId, accountId: request.account_id, detachedAgents: detached.affected ?? 0 }, 'team model removed');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'model.remove', target: `model:${ modelId }`, detail: `${ detached.affected ?? 0 } agent(s) detached` });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaModelRemove, config: { ...authGuard() }, handler };
}

export function modelTest(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const modelId = readModelId(request);

        const model = await findOwnedModel(fastify, teamId, modelId, request.account_id);

        const probe = await probeModel(model.base_url, model.api_key, model.model);

        request.log.info({ module: 'model', teamId, modelId: model.id, accountId: request.account_id, ok: probe.ok, reason: probe.reason }, 'team model tested');

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.test',
            target: `model:${ model.id }`,
            outcome: probe.ok ? 'ok' : 'error',
            detail: probe.ok ? `${ probe.models ?? 0 } models listed` : probe.reason ?? 'failed' });

        reply.send(probe);
    };

    return { schema: schemaModelTest, config: { ...authGuard() }, handler };
}


/**
 * The default provider's model listing, for the add form.
 *
 * Not team-scoped, because it is the same public list for everyone -- it is
 * behind `authGuard` only so it cannot be used as an open proxy, and the
 * in-process cache keeps a signed-in caller from driving outbound requests with
 * it whatever the rate limiter does.
 */
export function modelCatalog()
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const catalog = await fetchCatalog();

        if (catalog.reason !== undefined)
        {
            // A stale list still works, so this is a warning, not an error.
            request.log.warn({ module: 'model', accountId: request.account_id, reason: catalog.reason, served: catalog.models.length }, 'provider catalog unavailable');
        }

        reply.send({
            base_url: OPENROUTER_URL,
            models: catalog.models,
            ...catalog.reason !== undefined && { reason: catalog.reason } });
    };

    return { schema: schemaModelCatalog, config: { ...authGuard() }, handler };
}
