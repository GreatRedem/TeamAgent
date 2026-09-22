import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';

import { TeamModel } from '../team/team.entity.js';
import { TeamAgent } from '../agent/agent.entity.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { OPENROUTER_URL, PROVIDERS, fetchCatalog, readContextLength } from './model.provider.js';
import { schemaModelCatalog, schemaModelCreate, schemaModelList, schemaModelProbe, schemaModelRemove, schemaModelTest, schemaModelUpdate } from './model.schema.js';

import { audit } from '../audit/audit.log.js';

import { BadRequestResponse } from '../../utils/response.js';

/** A page of models. Bounded by what a team configures, paged all the same. */
const LIST_PAGE = 50;

const NAME_MIN = 2;
const NAME_MAX = 64;
const MODEL_MAX = 128;
const URL_MAX = 256;
const KEY_MIN = 8;
const KEY_MAX = 256;

/**
 * An upper bound on a claimed context window, so a typo cannot disable the
 * trimming it drives. Comfortably past the largest published window.
 */
const CONTEXT_TOKENS_MAX = 10_000_000;

/** The endpoint is a third party; a hung request must not hold a handler open. */
const TEST_TIMEOUT = 8000;

/**
 * Shorter than a deliberate test: detection runs while someone waits for a
 * model to be added, and the fallback for not knowing is already safe.
 */
const DETECT_TIMEOUT = 3000;

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
        context_tokens: model.context_tokens,
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

/**
 * The model's context window, 0 when the caller does not know it.
 *
 * Optional because an endpoint that is not in any catalog may genuinely have no
 * published number, and refusing to add such a model would be worse than
 * falling back to the conservative default the reply path already applies.
 */
function readContextTokens(request: FastifyRequest): number
{
    const raw = (request.body as { context_tokens?: unknown } | undefined)?.context_tokens;

    const contextTokens = Number(raw ?? 0);

    if (!Number.isInteger(contextTokens) || contextTokens < 0 || contextTokens > CONTEXT_TOKENS_MAX)
    {
        throw new BadRequestResponse('MODEL_CONTEXT_INVALID');
    }

    return contextTokens;
}

function readModelBody(request: FastifyRequest)
{
    const name = request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim();
    const model = request.getBody('model').min(1).max(MODEL_MAX).asString().trim();
    const baseUrl = readBaseUrl(request);
    const contextTokens = readContextTokens(request);

    if (name.length < NAME_MIN || model === '')
    {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    return { name, model, baseUrl, contextTokens };
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
    /** The window the endpoint declares for this model, 0 when it says nothing. */
    context?: number;
    /**
     * The model names the endpoint listed, capped.
     *
     * Present on the result but declared only by the schema of the route that
     * needs it, so `POST .../test` keeps returning exactly what it did before.
     */
    ids?: string[];
    reason?: string;
}

/**
 * Names returned from one listing. Enough for any real endpoint -- the largest
 * public catalog is a few hundred -- and a bound on what a hostile one can
 * make this server hold in memory and hand back.
 */
const PROBE_IDS_MAX = 1000;

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
export async function probeModel(baseUrl: string, apiKey: string, model: string, timeout = TEST_TIMEOUT): Promise<ModelProbe>
{
    let response: Response;

    try
    {
        response = await fetch(`${ baseUrl }/models`, {
            // An empty key means the endpoint wants none; sending `Bearer `
            // with nothing after it is rejected by some servers outright.
            headers: apiKey === '' ? { } : { authorization: `Bearer ${ apiKey }` },
            signal: AbortSignal.timeout(timeout) });
    }
    catch
    {
        return { ok: false, reason: 'MODEL_UNREACHABLE' };
    }

    if (response.status === 401 || response.status === 403)
    {
        // Not every 401 is about the credential. Some providers allow only
        // specific client applications and refuse everything else with the
        // same status, which read as a bad key and sent people off to
        // re-paste a credential that was never the problem.
        //
        // The body is read to tell the two apart and then discarded -- the
        // outcome that escapes is still a flat code, never the provider's own
        // text, which can name a url carrying the key.
        const body = await response.json().catch(() => undefined) as { type?: unknown; error?: { type?: unknown } } | undefined;

        const kind = `${ typeof body?.type === 'string' ? body.type : '' } ${ typeof body?.error?.type === 'string' ? body.error.type : '' }`;

        return { ok: false, reason: /client/i.test(kind) ? 'MODEL_CLIENT_REJECTED' : 'MODEL_KEY_REJECTED' };
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

    // The listing is already here, so the window comes for free rather than
    // being a number someone has to look up and type.
    const entry = payload.data.find((candidate) =>
        typeof candidate === 'object' && candidate !== null && (candidate as { id?: unknown }).id === model);

    const context = readContextLength(entry);

    // Omitted rather than reported as 0, so "the endpoint did not say" has one
    // representation instead of two.
    // An endpoint that echoes the key back as a model name must not turn this
    // into a way to read a credential -- a stored key is write-only to the
    // client, and the listing is the one part of a probe that returns text the
    // endpoint chose. The self-check alongside this pins the invariant.
    const listed = apiKey === '' ? ids : ids.filter((id) => !id.includes(apiKey));

    return {
        ok: true,
        models: payload.data.length,
        found: ids.includes(model),
        ids: listed.slice(0, PROBE_IDS_MAX),
        ...context > 0 && { context } };
}

/**
 * Asks the endpoint for its own context window when nobody supplied one.
 *
 * Best-effort and deliberately quick: this runs while someone waits for a
 * model to be added, and an endpoint that is slow or wrong should cost a
 * conservative default, not the whole request. Anything that goes wrong
 * reads as 0, which is what an unrecorded window already means.
 */
async function detectContext(baseUrl: string, apiKey: string, model: string): Promise<number>
{
    try
    {
        return (await probeModel(baseUrl, apiKey, model, DETECT_TIMEOUT)).context ?? 0;
    }
    catch
    {
        return 0;
    }
}

export function modelCreate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        const { name, model, baseUrl, contextTokens } = readModelBody(request);
        const apiKey = readApiKey(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const repository = fastify.db.getRepository(TeamModel);

        if (await repository.findOneBy({ team_id: teamId, base_url: baseUrl, model }))
        {
            throw new BadRequestResponse('MODEL_ALREADY_ADDED');
        }

        // Only when the caller did not say. A number typed in or carried from
        // the catalog is a deliberate answer and is not second-guessed by a
        // network call that may time out.
        const detected = contextTokens > 0 ? contextTokens : await detectContext(baseUrl, apiKey, model);

        const saved = await repository.save({ team_id: teamId, name, model, base_url: baseUrl, api_key: apiKey, context_tokens: detected });

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

        const { limit, offset } = readPage(request, LIST_PAGE);

        const [ rows, total ] = await fastify.db.getRepository(TeamModel).findAndCount({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1 });

        const { items, has_more } = takePage(rows, limit);

        reply.send({ limit, offset, has_more, total, models: items.map(toModelView) });
    };

    return { schema: schemaModelList, config: { ...authGuard() }, handler };
}

export function modelUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const modelId = readModelId(request);

        const { name, model, baseUrl, contextTokens } = readModelBody(request);

        // Blank means "keep the stored key": the client cannot read it back, so
        // requiring it on every edit would force re-entry just to rename a model.
        // That makes blank ambiguous for a key the caller wants to *remove* --
        // delete and re-add the model for that.
        const apiKey = readApiKey(request);

        const existing = await findOwnedModel(fastify, teamId, modelId, request.account_id);

        await fastify.db.getRepository(TeamModel).update(
            { id: existing.id, team_id: teamId },
            { name, model, base_url: baseUrl, context_tokens: contextTokens, ...apiKey !== '' && { api_key: apiKey } });

        request.log.info({ module: 'model', teamId, modelId: existing.id, accountId: request.account_id, rotatedKey: apiKey !== '' }, 'team model updated');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'model.update', target: `model:${ existing.id }`, detail: apiKey !== '' ? `${ name } - key rotated` : name });

        reply.send(toModelView({ ...existing, name, model, base_url: baseUrl, context_tokens: contextTokens, api_key: apiKey !== '' ? apiKey : existing.api_key }));
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

        // The endpoint is authoritative about its own window, so a detected
        // one is recorded rather than reported and forgotten. Silence leaves
        // the stored value alone: a provider that does not publish the number
        // is not evidence that a hand-entered one was wrong.
        if ((probe.context ?? 0) > 0 && probe.context !== model.context_tokens)
        {
            await fastify.db.getRepository(TeamModel).update({ id: model.id, team_id: teamId }, { context_tokens: probe.context });
        }

        request.log.info({ module: 'model', teamId, modelId: model.id, accountId: request.account_id, ok: probe.ok, reason: probe.reason, context: probe.context }, 'team model tested');

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.test',
            target: `model:${ model.id }`,
            outcome: probe.ok ? 'ok' : 'error',
            detail: probe.ok ? `${ probe.models ?? 0 } models listed${ (probe.context ?? 0) > 0 ? ` - ${ probe.context } token window` : '' }` : probe.reason ?? 'failed' });

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
/**
 * Tests an endpoint that has not been saved yet, and reports what it lists.
 *
 * Serves two things the add form needs before a row exists: whether the
 * connection works at all, and which models are on offer -- a provider whose
 * listing depends on the caller's own key cannot be served from the shared
 * `/model/catalog` cache, so it is read here with the key being entered.
 *
 * The url goes through the same `readBaseUrl` check as a saved model, so plain
 * http still reaches loopback only and a key is never put on the wire in clear
 * text. As with the saved-model test, nothing from the response body, headers
 * or status is returned verbatim -- only the flat outcome and the listed names.
 *
 * ponytail: this widens the server-side request forgery surface already noted
 * for `team_model.base_url` -- an authenticated caller can now aim a request
 * without storing a model first, and learns the listed names rather than only a
 * count. The narrower fix is the one that field needs anyway: refuse private
 * ranges while still allowing loopback, unlike `checkPublicUrl`, which refuses
 * both.
 */
export function modelProbe(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const baseUrl = readBaseUrl(request);
        const apiKey = readApiKey(request);

        // Optional: the form is usually tested before a model name is chosen,
        // and `found` is simply false until there is one to look for.
        const raw = (request.body as { model?: unknown } | undefined)?.model;
        const model = typeof raw === 'string' ? raw.trim().slice(0, MODEL_MAX) : '';

        const probe = await probeModel(baseUrl, apiKey, model);

        request.log.info({ module: 'model', teamId, accountId: request.account_id, ok: probe.ok, reason: probe.reason, listed: probe.ids?.length ?? 0 }, 'model endpoint probed');

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'model.probe',
            target: `endpoint:${ new URL(baseUrl).host }`,
            outcome: probe.ok ? 'ok' : 'error',
            detail: probe.ok ? `${ probe.models ?? 0 } models listed` : probe.reason ?? 'failed' });

        reply.send(probe);
    };

    return { schema: schemaModelProbe, config: { ...authGuard() }, handler };
}

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
            // The presets ride along on the call the add form already makes,
            // rather than costing a second round trip to learn three urls.
            providers: PROVIDERS,
            models: catalog.models,
            ...catalog.reason !== undefined && { reason: catalog.reason } });
    };

    return { schema: schemaModelCatalog, config: { ...authGuard() }, handler };
}
