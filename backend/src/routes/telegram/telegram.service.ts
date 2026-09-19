import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { authGuard } from '../../plugins/authentication.js';

import { TeamBot, TeamModel } from '../team/team.entity.js';
import { TeamAgent, TeamAgentDocument, TeamAgentExchange } from '../agent/agent.entity.js';
import { HISTORY_LIMIT, MAX_TOOL_ROUNDS, TELEGRAM_TEXT_MAX, buildMessages, buildSystemPrompt, readAssistantTurn, readCompletion, readToolCalls, type ChatMessage } from '../agent/agent.reply.js';
import { allowedTools, runTool, toOpenAITools } from '../mcp/mcp.tools.js';
import { findOwnedTeam, readParamId, readTeamId } from '../team/team.access.js';
import { TelegramMessage, TelegramUser } from './telegram.entity.js';
import { DEFAULT_PERMISSIONS, PERMISSIONS, hasPermission, isKnownPermission, parsePermissions, serializePermissions } from './telegram.permission.js';
import { schemaConversationList, schemaConversationMessages, schemaPermissionCatalog, schemaProfileDetails, schemaProfilePermissionUpdate, schemaTelegramWebhook, schemaTelegramWebhookRegister } from './telegram.schema.js';

import { audit } from '../audit/audit.log.js';

import { BadRequestResponse, UnauthorizedResponse } from '../../utils/response.js';

const TELEGRAM_API = 'https://api.telegram.org';
const TELEGRAM_TIMEOUT = 5000;

/** A completion is slower than any other call here; give it room. */
const AGENT_TIMEOUT = 60000;

/**
 * Telegram clears a chat action after about five seconds, so it has to be
 * refreshed while the model is still thinking. Four keeps it continuous
 * without hammering.
 */
const TYPING_INTERVAL = 4000;

/** Ceiling on a stored request or response body. */
const EXCHANGE_MAX = 65536;

/** Telegram truncates at 4096 characters; the column is text, this is a guard. */
const TEXT_MAX = 8192;

const MESSAGE_PAGE = 200;

export function createWebhookSecret(): string
{
    // Telegram restricts secret_token to A-Z a-z 0-9 _ - and 1..256 characters.
    return randomBytes(32).toString('hex');
}

/**
 * Compares the header Telegram sends against the stored secret without leaking
 * length or position through timing. Both sides are hashed first so
 * `timingSafeEqual` always sees equal-length buffers.
 */
function secretMatches(expected: string, received: unknown): boolean
{
    if (expected === '' || typeof received !== 'string')
    {
        return false;
    }

    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(received).digest();

    return timingSafeEqual(a, b);
}

function toProfile(user: TelegramUser)
{
    return {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        language_code: user.language_code,
        message_count: user.message_count,
        permissions: parsePermissions(user.permissions),
        last_seen_at: user.last_seen_at,
        created_at: user.created_at
    };
}

/** The slice of Telegram's update payload this app acts on. */
interface InboundMessage
{
    updateId: string;
    chatId: string;
    text: string;
    sentAt: Date;
    from:
    {
        id: string;
        username: string;
        firstName: string;
        lastName: string;
        languageCode: string;
    };
}

/**
 * Narrows a webhook body to the one case that matters: a private message from
 * a human. Group chats, channel posts, edits, bots and service messages all
 * return undefined and are acknowledged without being stored.
 *
 * Exported for the self-check alongside this module.
 */
export function readInboundMessage(body: unknown): InboundMessage | undefined
{
    if (typeof body !== 'object' || body === null)
    {
        return undefined;
    }

    const update = body as Record<string, unknown>;

    if (typeof update['update_id'] !== 'number' && typeof update['update_id'] !== 'string')
    {
        return undefined;
    }

    const message = update['message'];

    if (typeof message !== 'object' || message === null)
    {
        return undefined;
    }

    const { chat, from, text, date } = message as Record<string, unknown>;

    if (typeof chat !== 'object' || chat === null || typeof from !== 'object' || from === null)
    {
        return undefined;
    }

    const chatRecord = chat as Record<string, unknown>;
    const fromRecord = from as Record<string, unknown>;

    // "whoever PMs the bot" -- a group the bot was added to is not a PM.
    if (chatRecord['type'] !== 'private')
    {
        return undefined;
    }

    // A bot writing to a bot is not a person to build a profile for.
    if (fromRecord['is_bot'] === true)
    {
        return undefined;
    }

    if (typeof text !== 'string' || text === '')
    {
        return undefined;
    }

    const senderId = fromRecord['id'];
    const chatId = chatRecord['id'];

    if (typeof senderId !== 'number' && typeof senderId !== 'string')
    {
        return undefined;
    }

    if (typeof chatId !== 'number' && typeof chatId !== 'string')
    {
        return undefined;
    }

    const text_ = (value: unknown) => typeof value === 'string' ? value : '';

    return {
        updateId: String(update['update_id']),
        chatId: String(chatId),
        text: text.slice(0, TEXT_MAX),
        // Telegram's `date` is unix seconds; a missing one falls back to now.
        sentAt: typeof date === 'number' ? new Date(date * 1000) : new Date(),
        from: {
            id: String(senderId),
            username: text_(fromRecord['username']).slice(0, 64),
            firstName: text_(fromRecord['first_name']).slice(0, 128),
            lastName: text_(fromRecord['last_name']).slice(0, 128),
            languageCode: text_(fromRecord['language_code']).slice(0, 16)
        }
    };
}

/**
 * Stores one update, whichever way it arrived.
 *
 * The webhook and the poller both funnel through here so there is exactly one
 * definition of what counts as a message and what a profile looks like --
 * ingestion rules cannot drift between the two transports.
 */
export async function ingestUpdate(fastify: FastifyInstance, bot: TeamBot, body: unknown, log: FastifyBaseLogger): Promise<'stored' | 'ignored' | 'duplicate' | 'blocked'>
{
    const inbound = readInboundMessage(body);

    if (!inbound)
    {
        // Understood, deliberately not stored.
        return 'ignored';
    }

    const messages = fastify.db.getRepository(TelegramMessage);

    // Redelivery of an update already stored. The unique index on
    // (bot_id, update_id) is the real guard; this avoids the write.
    if (await messages.findOneBy({ bot_id: bot.id, update_id: inbound.updateId }))
    {
        return 'duplicate';
    }

    const users = fastify.db.getRepository(TelegramUser);

    const profileFields = {
        username: inbound.from.username,
        first_name: inbound.from.firstName,
        last_name: inbound.from.lastName,
        language_code: inbound.from.languageCode,
        last_seen_at: inbound.sentAt
    };

    let user = await users.findOneBy({ team_id: bot.team_id, telegram_id: inbound.from.id });

    if (!user)
    {
        user = await users.save({
            team_id: bot.team_id,
            telegram_id: inbound.from.id,
            message_count: 0,
            permissions: serializePermissions(DEFAULT_PERMISSIONS),
            ...profileFields });

        log.info({ module: 'telegram', teamId: bot.team_id, userId: user.id }, 'telegram profile created');
    }
    else
    {
        // Names and usernames change; the profile tracks the latest.
        await users.update({ id: user.id }, profileFields);
    }

    // The permission gate. Someone without `chat` still keeps a profile and a
    // refreshed last-seen -- so they can be found and granted access later --
    // but nothing they wrote is recorded.
    if (!hasPermission(user.permissions, 'chat'))
    {
        log.info({ module: 'telegram', teamId: bot.team_id, botId: bot.id, userId: user.id }, 'telegram message refused: no chat permission');

        await audit(fastify, log, { teamId: bot.team_id, actor: 'telegram', action: 'telegram.message', target: `profile:${ user.id }`, outcome: 'skipped', detail: `bot ${ bot.id } - sender lacks the chat permission` });

        return 'blocked';
    }

    await messages.save({
        team_id: bot.team_id,
        user_id: user.id,
        bot_id: bot.id,
        update_id: inbound.updateId,
        chat_id: inbound.chatId,
        text: inbound.text,
        direction: 'in',
        sent_at: inbound.sentAt });

    await users.increment({ id: user.id }, 'message_count', 1);

    log.info({ module: 'telegram', teamId: bot.team_id, botId: bot.id, userId: user.id }, 'telegram message stored');

    await audit(fastify, log, {
        teamId: bot.team_id,
        actor: 'telegram',
        action: 'telegram.message',
        target: `profile:${ user.id }`,
        detail: `bot ${ bot.id } (${ bot.name }) - ${ inbound.text.length } chars - update ${ inbound.updateId }` });

    // Deliberately not awaited. A completion takes seconds and Telegram
    // redelivers a webhook it does not get a prompt 2xx for, so the reply is
    // detached from the request that triggered it. Both transports funnel
    // through here, so the poller gets this for free.
    void deliverAgentReply(fastify, bot, user, inbound.chatId, inbound.text, log)
        .catch((error: unknown) => log.error({ module: 'agent', botId: bot.id, err: error }, 'agent reply crashed'));

    return 'stored';
}

/**
 * Stores one agent/model round-trip.
 *
 * Truncated rather than rejected if enormous: losing the whole record because
 * one conversation ran long would defeat the point of keeping it. Swallows its
 * own failures for the same reason `audit` does -- logging must not break the
 * thing it is describing.
 */
async function recordExchange(fastify: FastifyInstance, log: FastifyBaseLogger, entry: {
    team_id: number; agent_id: number; model_id: number; user_id: number; round: number;
    request: string; response: string; tool_calls: number; duration_ms: number; outcome: string; reason: string;
}): Promise<void>
{
    try
    {
        await fastify.db.getRepository(TeamAgentExchange).save({
            ...entry,
            request: entry.request.slice(0, EXCHANGE_MAX),
            response: entry.response.slice(0, EXCHANGE_MAX)
        });
    }
    catch (error)
    {
        log.error({ module: 'agent', agentId: entry.agent_id, err: error }, 'exchange record failed');
    }
}

/**
 * Shows "typing…" in the chat until the returned stop function is called.
 *
 * Telegram expires a chat action after roughly five seconds, so this refreshes
 * it rather than sending once; a completion usually outlives a single action.
 *
 * Failures are ignored on purpose -- a missing typing indicator is cosmetic,
 * and letting it interrupt the actual reply would trade something that matters
 * for something that does not. The timer is unref'd so it can never hold the
 * process open at shutdown, and it stops on its own after AGENT_TIMEOUT in case
 * a caller ever loses its finally block.
 */
function startTyping(token: string, chatId: string, log: FastifyBaseLogger): () => void
{
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let guard: ReturnType<typeof setTimeout> | undefined;

    const stop = () =>
    {
        stopped = true;

        clearInterval(timer);
        clearTimeout(guard);
    };

    const ping = () =>
    {
        if (stopped)
        {
            return;
        }

        void fetch(`${ TELEGRAM_API }/bot${ token }/sendChatAction`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
            signal: AbortSignal.timeout(TELEGRAM_TIMEOUT) })
            .catch(() => log.debug({ module: 'agent' }, 'typing action failed'));
    };

    ping();

    timer = setInterval(ping, TYPING_INTERVAL);
    guard = setTimeout(stop, AGENT_TIMEOUT);

    timer.unref();
    guard.unref();

    return stop;
}

/**
 * Asks the bot's agent for a reply and sends it back to the person.
 *
 * Every failure is swallowed into a logged reason. This runs detached from the
 * request that triggered it, so throwing would surface as an unhandled
 * rejection rather than anything a caller could act on -- and both the model
 * url and the bot url carry credentials, so no error object from here is
 * logged verbatim.
 */
async function deliverAgentReply(fastify: FastifyInstance, bot: TeamBot, user: TelegramUser, chatId: string, incoming: string, log: FastifyBaseLogger)
{
    if (bot.agent_id === 0)
    {
        return;
    }

    // The `model` permission finally bites here: without it the message is
    // still recorded, but no agent answers.
    if (!hasPermission(user.permissions, 'model'))
    {
        log.info({ module: 'agent', botId: bot.id, userId: user.id }, 'agent reply skipped: no model permission');

        await audit(fastify, log, { teamId: bot.team_id, actor: 'agent', action: 'agent.request', target: `bot:${ bot.id }`, outcome: 'skipped', detail: `profile ${ user.id } lacks the model permission` });

        return;
    }

    const agent = await fastify.db.getRepository(TeamAgent).findOneBy({ id: bot.agent_id, team_id: bot.team_id });

    if (!agent || agent.model_id === 0)
    {
        log.warn({ module: 'agent', botId: bot.id, agentId: bot.agent_id }, 'agent reply skipped: agent or model missing');

        await audit(fastify, log, { teamId: bot.team_id, actor: 'agent', action: 'agent.request', target: `agent:${ bot.agent_id }`, outcome: 'skipped', detail: `bot ${ bot.id } - agent missing or has no model attached` });

        return;
    }

    const model = await fastify.db.getRepository(TeamModel).findOneBy({ id: agent.model_id, team_id: bot.team_id });

    if (!model)
    {
        log.warn({ module: 'agent', botId: bot.id, agentId: agent.id }, 'agent reply skipped: model missing');

        await audit(fastify, log, { teamId: bot.team_id, actor: 'agent', action: 'agent.request', target: `agent:${ agent.id }`, outcome: 'skipped', detail: `agent ${ agent.name } - model ${ agent.model_id } missing` });

        return;
    }

    const documents = await fastify.db.getRepository(TeamAgentDocument).find({ where: { agent_id: agent.id } });

    const history = await fastify.db.getRepository(TelegramMessage).find({
        where: { team_id: bot.team_id, user_id: user.id },
        order: { id: 'DESC' },
        take: HISTORY_LIMIT + 1 });

    // Newest-first from the database, and the row just stored is the incoming
    // message itself -- drop it so it is not sent twice.
    const earlier = history.reverse().slice(0, -1);

    const messages: ChatMessage[] = buildMessages(buildSystemPrompt(documents), earlier, incoming);

    // Only the tools this person has actually granted are advertised. The
    // executor re-checks anyway, but offering a tool that would be refused just
    // invites the model to waste a round on it.
    const tools = allowedTools(agent.permissions);

    // The person sees "typing…" from here until the reply is sent or the
    // attempt gives up.
    const stopTyping = startTyping(bot.token, chatId, log);

    const startedAt = Date.now();

    let text: string | undefined;
    let toolRuns = 0;

    try
    {
        // Tool rounds: ask, run whatever it asked for, ask again with the
        // results. Bounded, so a model that keeps calling tools instead of
        // answering still terminates.
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1)
        {
            const roundStartedAt = Date.now();

            const response = await fetch(`${ model.base_url }/chat/completions`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...model.api_key === '' ? { } : { authorization: `Bearer ${ model.api_key }` }
                },
                body: JSON.stringify({
                    model: model.model,
                    messages,
                    // Omitted entirely when nothing is granted: some compatible
                    // servers reject an empty tools array. Dropped on the last
                    // round so the model has to answer instead of calling again.
                    ...tools.length > 0 && round < MAX_TOOL_ROUNDS && { tools: toOpenAITools(tools) }
                }),
                signal: AbortSignal.timeout(AGENT_TIMEOUT) });

            const payload = await response.json().catch(() => undefined);

            const calls = readToolCalls(payload);

            // The exchange as the model saw it, kept whether or not it worked,
            // so a surprising answer can be traced to exactly what was asked.
            await recordExchange(fastify, log, {
                team_id: bot.team_id,
                agent_id: agent.id,
                model_id: model.id,
                user_id: user.id,
                round,
                request: JSON.stringify(messages),
                response: JSON.stringify(readAssistantTurn(payload) ?? payload ?? null),
                tool_calls: calls.length,
                duration_ms: Date.now() - roundStartedAt,
                outcome: response.ok ? 'ok' : 'error',
                reason: response.ok ? '' : `http ${ response.status }`
            });

            if (calls.length === 0 || round === MAX_TOOL_ROUNDS)
            {
                text = readCompletion(payload);

                break;
            }

            // The assistant turn goes back verbatim, or the tool results have
            // no call to attach to.
            messages.push(readAssistantTurn(payload) as ChatMessage);

            for (const call of calls)
            {
                const toolStartedAt = Date.now();

                const result = await runTool(fastify, agent, user, call.name, call.arguments);

                toolRuns += 1;

                await audit(fastify, log, {
                    teamId: bot.team_id,
                    actor: 'agent',
                    action: 'agent.tool',
                    target: `profile:${ user.id }`,
                    outcome: result.ok ? 'ok' : 'error',
                    durationMs: Date.now() - toolStartedAt,
                    detail: `${ call.name } · agent ${ agent.id } (${ agent.name }) · round ${ round } · args ${ Object.keys(call.arguments).join(',') || 'none' }${ result.ok ? '' : ` · ${ result.content.slice(0, 90) }` }` });

                messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
            }
        }
    }
    catch
    {
        log.warn({ module: 'agent', botId: bot.id, agentId: agent.id }, 'agent reply failed: model unreachable');

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `agent:${ agent.id }`,
            outcome: 'error',
            durationMs: Date.now() - startedAt,
            detail: `agent ${ agent.id } (${ agent.name }) - model ${ model.id } (${ model.model }) unreachable` });

        return;
    }
    finally
    {
        // Always: a leaked interval would keep pinging Telegram for a
        // conversation that is already over.
        stopTyping();
    }

    if (text === undefined)
    {
        log.warn({ module: 'agent', botId: bot.id, agentId: agent.id }, 'agent reply failed: no usable completion');

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `agent:${ agent.id }`,
            outcome: 'error',
            durationMs: Date.now() - startedAt,
            detail: `agent ${ agent.id } (${ agent.name }) - model ${ model.id } returned no usable completion after ${ toolRuns } tool call(s)` });

        return;
    }

    try
    {
        const sent = await fetch(`${ TELEGRAM_API }/bot${ bot.token }/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text.slice(0, TELEGRAM_TEXT_MAX) }),
            signal: AbortSignal.timeout(TELEGRAM_TIMEOUT) });

        if (!sent.ok)
        {
            log.warn({ module: 'agent', botId: bot.id, status: sent.status }, 'agent reply failed: telegram refused');

            await audit(fastify, log, { teamId: bot.team_id, actor: 'agent', action: 'agent.reply', target: `bot:${ bot.id }`, outcome: 'error', detail: `telegram refused with ${ sent.status } - ${ text.length } chars` });

            return;
        }
    }
    catch
    {
        log.warn({ module: 'agent', botId: bot.id }, 'agent reply failed: telegram unreachable');

        await audit(fastify, log, { teamId: bot.team_id, actor: 'agent', action: 'agent.reply', target: `bot:${ bot.id }`, outcome: 'error', detail: `telegram unreachable - ${ text.length } chars undelivered` });

        return;
    }

    // Recorded as part of the conversation, so the thread reads as a dialogue.
    // `update_id` is negated to stay clear of Telegram's own ids, which the
    // (bot_id, update_id) uniqueness is built around.
    await fastify.db.getRepository(TelegramMessage).save({
        team_id: bot.team_id,
        user_id: user.id,
        bot_id: bot.id,
        update_id: String(-Date.now()),
        chat_id: chatId,
        text,
        direction: 'out',
        sent_at: new Date() });

    log.info({ module: 'agent', botId: bot.id, agentId: agent.id, userId: user.id }, 'agent replied');

    // Shape and timing only. The conversation text is already stored in
    // telegram_message; copying it here would spread the same personal data
    // into a second table, and the api key must never appear at all.
    await audit(fastify, log, {
        teamId: bot.team_id,
        action: 'agent.request',
        target: `agent:${ agent.id }`,
        outcome: 'ok',
        durationMs: Date.now() - startedAt,
        actor: 'agent',
        detail: `agent ${ agent.id } (${ agent.name }) · model ${ model.id } (${ model.model }) · profile ${ user.id } · ${ messages.length } messages in · ${ text.length } chars out · ${ toolRuns } tool call(s)` });
}

/**
 * Telegram's webhook. Unauthenticated by necessity -- Telegram has no account
 * here -- so the bot's `webhook_secret`, sent back in a header, is the only
 * thing separating a real delivery from anyone who knows the url.
 *
 * It answers 200 for anything it understands, including updates it chooses not
 * to store, because a non-2xx makes Telegram redeliver the same update.
 */
export function telegramWebhook(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const botId = readParamId(request, 'botId', 'BOT_ID_INVALID');

        const bot = await fastify.db.getRepository(TeamBot).findOneBy({ id: botId });

        // An unknown bot and a wrong secret answer identically, so the endpoint
        // cannot be used to discover which bot ids exist.
        if (!bot || !secretMatches(bot.webhook_secret, request.headers['x-telegram-bot-api-secret-token']))
        {
            request.log.warn({ module: 'telegram', botId }, 'webhook rejected');

            throw new UnauthorizedResponse('WEBHOOK_REJECTED');
        }

        await ingestUpdate(fastify, bot, request.body, request.log);

        reply.send({ ok: true });
    };

    // No authGuard and no rateLimit: Telegram cannot authenticate, and a
    // throttle here would make it redeliver everything it was refused.
    return { schema: schemaTelegramWebhook, config: { }, handler };
}

export function conversationList(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const users = await fastify.db.getRepository(TelegramUser).find({ where: { team_id: teamId }, order: { last_seen_at: 'DESC' } });

        reply.send({ conversations: users.map(toProfile) });
    };

    return { schema: schemaConversationList, config: { ...authGuard() }, handler };
}

export function conversationMessages(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');
        const userId = readParamId(request, 'userId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        // Matched on team as well as id, so a profile id from another team is
        // not readable through a team the caller does own.
        const user = await fastify.db.getRepository(TelegramUser).findOneBy({ id: userId, team_id: teamId });

        if (!user)
        {
            throw new BadRequestResponse('PROFILE_NOT_FOUND');
        }

        const messages = await fastify.db.getRepository(TelegramMessage).find({
            where: { team_id: teamId, user_id: user.id },
            order: { id: 'DESC' },
            take: MESSAGE_PAGE });

        reply.send({
            profile: toProfile(user),
            // Newest first from the database so the limit keeps the most recent,
            // reversed here so the client renders oldest to newest.
            messages: messages.reverse().map((message) => ({ id: message.id, bot_id: message.bot_id, text: message.text, direction: message.direction, sent_at: message.sent_at })) });
    };

    return { schema: schemaConversationMessages, config: { ...authGuard() }, handler };
}

/**
 * Everything held about one person.
 *
 * Unlike the conversation view, this is person-centric: the same individual can
 * write to several of a team's bots, so the reply breaks their history down per
 * bot as well as returning it in one chronological run.
 */
export function profileDetails(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');
        const profileId = readParamId(request, 'profileId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        // Matched on team as well as id, so a profile belonging to another team
        // is not readable through a team the caller does own.
        const user = await fastify.db.getRepository(TelegramUser).findOneBy({ id: profileId, team_id: teamId });

        if (!user)
        {
            throw new BadRequestResponse('PROFILE_NOT_FOUND');
        }

        const messages = await fastify.db.getRepository(TelegramMessage).find({
            where: { team_id: teamId, user_id: user.id },
            order: { id: 'DESC' },
            take: MESSAGE_PAGE });

        // Oldest first for display; the query took the newest so the cap keeps
        // the most recent rather than the first ever received.
        messages.reverse();

        const names = new Map((await fastify.db.getRepository(TeamBot).findBy({ team_id: teamId })).map((bot) => [ bot.id, bot.name ]));

        const perBot = new Map<number, { id: number; name: string; message_count: number; last_seen_at: Date }>();

        for (const message of messages)
        {
            const entry = perBot.get(message.bot_id) ?? { id: message.bot_id, name: names.get(message.bot_id) ?? 'Removed bot', message_count: 0, last_seen_at: message.sent_at };

            entry.message_count += 1;

            if (message.sent_at > entry.last_seen_at)
            {
                entry.last_seen_at = message.sent_at;
            }

            perBot.set(message.bot_id, entry);
        }

        reply.send({
            profile: toProfile(user),
            bots: [ ...perBot.values() ].sort((a, b) => b.message_count - a.message_count),
            messages: messages.map((message) => ({ id: message.id, bot_id: message.bot_id, text: message.text, direction: message.direction, sent_at: message.sent_at })) });
    };

    return { schema: schemaProfileDetails, config: { ...authGuard() }, handler };
}

export function permissionCatalog(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({ permissions: PERMISSIONS });
    };

    return { schema: schemaPermissionCatalog, config: { ...authGuard() }, handler };
}

/**
 * Replaces a profile's granted permissions with exactly what was sent.
 *
 * A whole-set replace rather than grant/revoke calls: the UI shows every
 * permission as a toggle, so it always knows the complete intended state, and
 * two toggles flipped at once cannot interleave into a half-applied result.
 */
export function profilePermissionUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const profileId = readParamId(request, 'profileId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const body = request.body as { permissions?: unknown } | undefined;
        const requested = body?.permissions;

        if (!Array.isArray(requested) || requested.some((key) => typeof key !== 'string'))
        {
            throw new BadRequestResponse('PERMISSIONS_INVALID');
        }

        // An unrecognised key is rejected rather than quietly dropped: silently
        // ignoring it would report success for a permission never granted.
        for (const key of requested as string[])
        {
            if (!isKnownPermission(key))
            {
                throw new BadRequestResponse('PERMISSION_UNKNOWN');
            }
        }

        const users = fastify.db.getRepository(TelegramUser);

        const user = await users.findOneBy({ id: profileId, team_id: teamId });

        if (!user)
        {
            throw new BadRequestResponse('PROFILE_NOT_FOUND');
        }

        const permissions = serializePermissions(requested as string[]);

        await users.update({ id: user.id, team_id: teamId }, { permissions });

        request.log.info({ module: 'telegram', teamId, userId: user.id, accountId: request.account_id, permissions }, 'profile permissions updated');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'profile.permissions', target: `profile:${ user.id }`, detail: permissions === '' ? 'all revoked' : permissions });

        reply.send(toProfile({ ...user, permissions }));
    };

    return { schema: schemaProfilePermissionUpdate, config: { ...authGuard() }, handler };
}

/**
 * Points Telegram at this server for one bot, generating the shared secret if
 * the bot has not got one yet.
 */
export function telegramWebhookRegister(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');
        const botId = readParamId(request, 'botId', 'BOT_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const bots = fastify.db.getRepository(TeamBot);

        const bot = await bots.findOneBy({ id: botId, team_id: teamId });

        if (!bot)
        {
            throw new BadRequestResponse('BOT_NOT_FOUND');
        }

        if (bot.public_url === '')
        {
            // No address of its own means this bot is in polling mode; there is
            // nothing to hand Telegram.
            reply.send({ ok: false, reason: 'BOT_PUBLIC_URL_NOT_SET' });

            return;
        }

        if (bot.webhook_secret === '')
        {
            bot.webhook_secret = createWebhookSecret();

            await bots.update({ id: bot.id }, { webhook_secret: bot.webhook_secret });
        }

        // nginx strips the `/api` prefix, so the public path carries it and the
        // route registered inside Fastify does not.
        const url = `${ bot.public_url.replace(/\/+$/, '') }/api/telegram/webhook/${ bot.id }`;

        let ok = false;

        try
        {
            const response = await fetch(`${ TELEGRAM_API }/bot${ bot.token }/setWebhook`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ url, secret_token: bot.webhook_secret, allowed_updates: [ 'message' ] }),
                signal: AbortSignal.timeout(TELEGRAM_TIMEOUT) });

            const payload = await response.json().catch(() => undefined) as { ok?: boolean } | undefined;

            ok = response.ok && payload?.ok === true;
        }
        catch
        {
            // As with the connection check, the failing url carries the bot
            // token, so nothing from this error is logged or returned.
            reply.send({ ok: false, reason: 'BOT_UNREACHABLE' });

            return;
        }

        request.log.info({ module: 'telegram', teamId, botId: bot.id, ok }, 'telegram webhook registered');

        reply.send(ok ? { ok, url } : { ok, reason: 'BOT_TOKEN_REJECTED' });
    };

    return { schema: schemaTelegramWebhookRegister, config: { ...authGuard() }, handler };
}
