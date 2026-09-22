import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';

import { createWebhookSecret } from '../telegram/telegram.service.js';

import { Team, TeamBot, TeamDocument } from './team.entity.js';
import { TeamAgent } from '../agent/agent.entity.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from './team.access.js';
import { schemaTeamBotCreate, schemaTeamBotList, schemaTeamBotRemove, schemaTeamBotTest, schemaTeamBotUpdate, schemaTeamCreate, schemaTeamDetails, schemaTeamList, schemaTeamRoster, schemaTeamUpdate } from './team.schema.js';
import { ROSTER_FILE, parseRoster, serializeRoster, type Roster } from './team.roster.js';

import { audit } from '../audit/audit.log.js';

import { BadRequestResponse } from '../../utils/response.js';

/**
 * A page of a list that is bounded by what a person configures -- teams,
 * bots, agents, models. Large enough that it is one page for anyone real,
 * but the paging is there so a big account is not a slow response.
 */
const LIST_PAGE = 50;

/** Members per page of team.json. */
const ROSTER_PAGE = 50;

const NAME_MIN = 2;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 280;

const PUBLIC_URL_MAX = 256;

const BOT_TOKEN_MIN = 20;
const BOT_TOKEN_MAX = 128;

/** BotFather issues `<bot id>:<secret>`; the id half is public, the rest is not. */
const BOT_TOKEN_PATTERN = /^(\d{5,16}):([A-Za-z0-9_-]{20,})$/;

const TELEGRAM_API = 'https://api.telegram.org';

/** Telegram is a third party: a hung request must not hold a handler open. */
const TELEGRAM_TIMEOUT = 5000;

interface BotProbe
{
    ok: boolean;
    username?: string;
    reason?: string;
}

/**
 * Asks Telegram whether a token still works, via `getMe`.
 *
 * Nothing from the failure path is logged or returned verbatim: the request url
 * embeds the token, so an error object or response body from this call can
 * carry the credential into a log line. Only the flat reasons below escape.
 *
 * Exported so the probe can be exercised on its own, against a stubbed fetch,
 * without standing up a route and a database.
 */
export async function probeTelegram(token: string): Promise<BotProbe>
{
    let response: Response;

    try
    {
        response = await fetch(`${ TELEGRAM_API }/bot${ token }/getMe`, { signal: AbortSignal.timeout(TELEGRAM_TIMEOUT) });
    }
    catch
    {
        // Covers both the timeout and a DNS/connection failure.
        return { ok: false, reason: 'BOT_UNREACHABLE' };
    }

    const payload = await response.json().catch(() => undefined) as { ok?: boolean; result?: { username?: string } } | undefined;

    if (!response.ok || payload?.ok !== true)
    {
        // Telegram answers 401 for a revoked token and 404 for one that never
        // existed; neither distinction is useful to the caller.
        return { ok: false, reason: 'BOT_TOKEN_REJECTED' };
    }

    return { ok: true, username: payload.result?.username ?? '' };
}

const readBotId = (request: FastifyRequest) => readParamId(request, 'botId', 'BOT_ID_INVALID');

/**
 * What the client is allowed to see of a stored token: the bot id, which is
 * public, and the last four characters so one bot can be told from another.
 */
function toBotView(bot: TeamBot, agentName = '')
{
    return {
        id: bot.id,
        name: bot.name,
        token_hint: `${ bot.token.split(':')[0] }:...${ bot.token.slice(-4) }`,
        public_url: bot.public_url,
        // A bot with an address of its own is pushed to; one without is pulled
        // from. This is the only thing that decides which.
        mode: bot.public_url === '' ? 'polling' : 'webhook',
        agent_id: bot.agent_id,
        // Empty when no agent answers, or when the one that did was deleted.
        agent_name: agentName,
        created_at: bot.created_at
    };
}

/** Names of the team's agents, for labelling bots without a query each. */
async function agentNames(fastify: FastifyInstance, teamId: number): Promise<Map<number, string>>
{
    const agents = await fastify.db.getRepository(TeamAgent).findBy({ team_id: teamId });

    return new Map(agents.map((agent) => [ agent.id, agent.name ]));
}

/**
 * The agent must belong to the same team; 0 means nobody answers.
 *
 * Without the ownership check a bot could be pointed at another account's
 * agent, and every reply would run on that account's model and key.
 */
async function readAgentId(fastify: FastifyInstance, request: FastifyRequest, teamId: number): Promise<number>
{
    const raw = (request.body as { agent_id?: unknown } | undefined)?.agent_id;

    const agentId = Number(raw ?? 0);

    if (!Number.isInteger(agentId) || agentId < 0)
    {
        throw new BadRequestResponse('AGENT_ID_INVALID');
    }

    if (agentId === 0)
    {
        return 0;
    }

    if (!await fastify.db.getRepository(TeamAgent).findOneBy({ id: agentId, team_id: teamId }))
    {
        throw new BadRequestResponse('AGENT_NOT_FOUND');
    }

    return agentId;
}

/**
 * Telegram only calls public https urls. An origin is accepted here, not a
 * full path -- the webhook path is derived from the bot id when registering.
 */
function readPublicUrl(request: FastifyRequest): string
{
    const value = request.getBody('public_url').max(PUBLIC_URL_MAX).asString().trim();

    if (value === '')
    {
        return '';
    }

    let parsed: URL;

    try
    {
        parsed = new URL(value);
    }
    catch
    {
        throw new BadRequestResponse('BOT_PUBLIC_URL_INVALID');
    }

    if (parsed.protocol !== 'https:')
    {
        throw new BadRequestResponse('BOT_PUBLIC_URL_INSECURE');
    }

    return parsed.origin;
}

// `description` is required rather than optional because the validator builder
// has no notion of an absent field -- the client sends '' for "none".
function readTeamBody(request: FastifyRequest)
{
    return {
        name: request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim(),
        description: request.getBody('description').max(DESCRIPTION_MAX).asString().trim()
    };
}

export function teamCreate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const { name, description } = readTeamBody(request);

        if (name.length < NAME_MIN)
        {
            throw new BadRequestResponse('ERROR_MIN_LENGTH');
        }

        const team = await fastify.db.getRepository(Team).save({ name, description, account_id: request.account_id });

        request.log.info({ module: 'team', teamId: team.id, accountId: request.account_id }, 'team created');

        await audit(fastify, request.log, { teamId: team.id, accountId: request.account_id, action: 'team.create', target: `team:${ team.id }`, detail: name });

        reply.send(team);
    };

    return { schema: schemaTeamCreate, config: { ...authGuard() }, handler };
}

export function teamList(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const { limit, offset } = readPage(request, LIST_PAGE);

        const [ rows, total ] = await fastify.db.getRepository(Team).findAndCount({
            where: { account_id: request.account_id },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1 });

        const { items, has_more } = takePage(rows, limit);

        reply.send({ limit, offset, has_more, total, teams: items });
    };

    return { schema: schemaTeamList, config: { ...authGuard() }, handler };
}

export function teamDetails(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const team = await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send(team);
    };

    return { schema: schemaTeamDetails, config: { ...authGuard() }, handler };
}

export function teamUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const id = readTeamId(request);

        const { name, description } = readTeamBody(request);

        if (name.length < NAME_MIN)
        {
            throw new BadRequestResponse('ERROR_MIN_LENGTH');
        }

        // Establishes ownership before the write; the update itself repeats the
        // account filter so the row cannot change hands between the two.
        await findOwnedTeam(fastify, id, request.account_id);

        await fastify.db.getRepository(Team).update({ id, account_id: request.account_id }, { name, description });

        const team = await findOwnedTeam(fastify, id, request.account_id);

        request.log.info({ module: 'team', teamId: id, accountId: request.account_id }, 'team updated');

        await audit(fastify, request.log, { teamId: id, accountId: request.account_id, action: 'team.update', target: `team:${ id }`, detail: name });

        reply.send(team);
    };

    return { schema: schemaTeamUpdate, config: { ...authGuard() }, handler };
}

export function teamBotCreate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        const name = request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim();
        const token = request.getBody('token').min(BOT_TOKEN_MIN).max(BOT_TOKEN_MAX).asString().trim();

        if (name.length < NAME_MIN)
        {
            throw new BadRequestResponse('ERROR_MIN_LENGTH');
        }

        if (!BOT_TOKEN_PATTERN.test(token))
        {
            throw new BadRequestResponse('BOT_TOKEN_INVALID');
        }

        await findOwnedTeam(fastify, teamId, request.account_id);

        const repository = fastify.db.getRepository(TeamBot);

        if (await repository.findOneBy({ team_id: teamId, token }))
        {
            throw new BadRequestResponse('BOT_ALREADY_ADDED');
        }

        const bot = await repository.save({ team_id: teamId, name, token, public_url: readPublicUrl(request), webhook_secret: createWebhookSecret() });

        // The token itself is never logged -- the row id is enough to trace it.
        request.log.info({ module: 'team', teamId, botId: bot.id, accountId: request.account_id }, 'team bot added');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'bot.create', target: `bot:${ bot.id }`, detail: name });

        reply.send(toBotView(bot));
    };

    return { schema: schemaTeamBotCreate, config: { ...authGuard() }, handler };
}

export function teamBotList(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { limit, offset } = readPage(request, LIST_PAGE);

        const [ rows, total ] = await fastify.db.getRepository(TeamBot).findAndCount({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1 });

        const { items, has_more } = takePage(rows, limit);

        const names = await agentNames(fastify, teamId);

        reply.send({ limit, offset, has_more, total, bots: items.map((bot) => toBotView(bot, names.get(bot.agent_id) ?? '')) });
    };

    return { schema: schemaTeamBotList, config: { ...authGuard() }, handler };
}

/** The bot must belong to a team the caller owns; both ids are checked. */
async function findOwnedBot(fastify: FastifyInstance, teamId: number, botId: number, accountId: number): Promise<TeamBot>
{
    await findOwnedTeam(fastify, teamId, accountId);

    const bot = await fastify.db.getRepository(TeamBot).findOneBy({ id: botId, team_id: teamId });

    if (!bot)
    {
        throw new BadRequestResponse('BOT_NOT_FOUND');
    }

    return bot;
}

export function teamBotTest(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const botId = readBotId(request);

        const bot = await findOwnedBot(fastify, teamId, botId, request.account_id);

        const probe = await probeTelegram(bot.token);

        request.log.info({ module: 'team', teamId, botId, accountId: request.account_id, ok: probe.ok, reason: probe.reason }, 'team bot tested');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'bot.test', target: `bot:${ botId }`, outcome: probe.ok ? 'ok' : 'error', detail: probe.reason ?? 'connected' });

        reply.send(probe);
    };

    return { schema: schemaTeamBotTest, config: { ...authGuard() }, handler };
}

export function teamBotRemove(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const botId = readBotId(request);

        // Ownership of the team is what authorises the delete; the bot is then
        // matched on both ids so a bot id from another team cannot be removed.
        await findOwnedTeam(fastify, teamId, request.account_id);

        const removed = await fastify.db.getRepository(TeamBot).delete({ id: botId, team_id: teamId });

        if (removed.affected !== 1)
        {
            throw new BadRequestResponse('BOT_NOT_FOUND');
        }

        request.log.info({ module: 'team', teamId, botId, accountId: request.account_id }, 'team bot removed');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'bot.remove', target: `bot:${ botId }` });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaTeamBotRemove, config: { ...authGuard() }, handler };
}

export function teamBotUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const botId = readBotId(request);

        const name = request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim();
        const publicUrl = readPublicUrl(request);

        if (name.length < NAME_MIN)
        {
            throw new BadRequestResponse('ERROR_MIN_LENGTH');
        }

        const bot = await findOwnedBot(fastify, teamId, botId, request.account_id);

        const agentId = await readAgentId(fastify, request, teamId);

        await fastify.db.getRepository(TeamBot).update({ id: bot.id, team_id: teamId }, { name, public_url: publicUrl, agent_id: agentId });

        // Clearing the url hands the bot to the poller, which cannot start while
        // Telegram still has a webhook registered; dropping it is the poller's
        // first act, so nothing to do here beyond the write.
        request.log.info({ module: 'team', teamId, botId: bot.id, mode: publicUrl === '' ? 'polling' : 'webhook' }, 'team bot updated');

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'bot.update',
            target: `bot:${ bot.id }`,
            detail: `${ publicUrl === '' ? 'polling' : 'webhook' } - agent ${ agentId === 0 ? 'none' : agentId }` });

        const names = await agentNames(fastify, teamId);

        reply.send(toBotView({ ...bot, name, public_url: publicUrl, agent_id: agentId }, names.get(agentId) ?? ''));
    };

    return { schema: schemaTeamBotUpdate, config: { ...authGuard() }, handler };
}

/**
 * The team roster, as the owner sees it.
 *
 * A damaged file is an error rather than an empty list: the owner is the one
 * who can repair it, and reporting "no members" to the person holding the fix
 * is how a damaged file becomes a lost one.
 */
export function teamRosterRead(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const row = await fastify.db.getRepository(TeamDocument).findOneBy({ team_id: teamId, name: ROSTER_FILE });

        let roster: Roster;

        try
        {
            roster = parseRoster(row?.content ?? '');
        }
        catch
        {
            throw new BadRequestResponse('ROSTER_MALFORMED');
        }

        // Paged in memory, not in the database: the roster is one JSON file, so
        // the whole of it is already parsed by the time there is anything to
        // page. `count` stays the roster total rather than the page length --
        // it answers "how big is the team", which a page of it does not.
        const { limit, offset } = readPage(request, ROSTER_PAGE);

        reply.send({
            members: roster.members.slice(offset, offset + limit),
            count: roster.members.length,
            total: roster.members.length,
            limit,
            offset,
            has_more: offset + limit < roster.members.length,
            ...row && { updated_at: row.updated_at.toISOString() } });
    };

    return { schema: schemaTeamRoster, config: { ...authGuard() }, handler };
}

/**
 * Replaces the whole roster.
 *
 * Whole-file replacement is an owner action and deliberately not an agent one:
 * this is the call that can empty the file, and it is made by someone who can
 * see what was there first. The body is parsed and re-serialised rather than
 * stored verbatim, so what lands in the column is always canonical and always
 * readable by the agent tools.
 */
export function teamRosterWrite(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const body = request.body as { members?: unknown } | undefined;

        let content: string;
        let roster: Roster;

        try
        {
            roster = parseRoster(JSON.stringify(body ?? { members: [ ] }));
            content = serializeRoster(roster);
        }
        catch
        {
            throw new BadRequestResponse('ROSTER_INVALID');
        }

        const repository = fastify.db.getRepository(TeamDocument);
        const row = await repository.findOneBy({ team_id: teamId, name: ROSTER_FILE });

        await (row
            ? repository.update({ id: row.id }, { content })
            : repository.save({ team_id: teamId, name: ROSTER_FILE, content }));

        request.log.info({ module: 'team', teamId, accountId: request.account_id, members: roster.members.length }, 'team roster written');

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'roster.write',
            target: `team:${ teamId }`,
            detail: `${ roster.members.length } members` });

        reply.send({ members: roster.members, count: roster.members.length });
    };

    return { schema: schemaTeamRoster, config: { ...authGuard() }, handler };
}
