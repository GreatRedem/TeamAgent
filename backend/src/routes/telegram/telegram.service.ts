import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { authGuard } from '../../plugins/authentication.js';

import { TeamBot } from '../team/team.entity.js';
import { findOwnedTeam, readParamId, readTeamId } from '../team/team.access.js';
import { TelegramMessage, TelegramUser } from './telegram.entity.js';
import { DEFAULT_PERMISSIONS, PERMISSIONS, hasPermission, isKnownPermission, parsePermissions, serializePermissions } from './telegram.permission.js';
import { schemaConversationList, schemaConversationMessages, schemaPermissionCatalog, schemaProfileDetails, schemaProfilePermissionUpdate, schemaTelegramWebhook, schemaTelegramWebhookRegister } from './telegram.schema.js';

import { BadRequestResponse, UnauthorizedResponse } from '../../utils/response.js';

const TELEGRAM_API = 'https://api.telegram.org';
const TELEGRAM_TIMEOUT = 5000;

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

        return 'blocked';
    }

    await messages.save({
        team_id: bot.team_id,
        user_id: user.id,
        bot_id: bot.id,
        update_id: inbound.updateId,
        chat_id: inbound.chatId,
        text: inbound.text,
        sent_at: inbound.sentAt });

    await users.increment({ id: user.id }, 'message_count', 1);

    log.info({ module: 'telegram', teamId: bot.team_id, botId: bot.id, userId: user.id }, 'telegram message stored');

    return 'stored';
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
            messages: messages.reverse().map((message) => ({ id: message.id, bot_id: message.bot_id, text: message.text, sent_at: message.sent_at })) });
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
            messages: messages.map((message) => ({ id: message.id, bot_id: message.bot_id, text: message.text, sent_at: message.sent_at })) });
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
