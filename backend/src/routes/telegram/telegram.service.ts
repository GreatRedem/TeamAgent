import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ILike, LessThan } from 'typeorm';
import {
    AGENT_TIMEOUT,
    AUTO_ATTEMPTS,
    CONVERSATION_PAGE,
    DEFAULT_PERMISSIONS,
    ERROR_TEXT_MAX,
    EXCHANGE_MAX,
    HISTORY_LIMIT,
    MAX_TOOL_ROUNDS,
    MESSAGE_PAGE,
    PERMISSIONS,
    PROVIDERS,
    REPLY_QUEUES,
    STREAM_EDIT_INTERVAL,
    STREAM_FIRST_CHARS,
    TELEGRAM_API,
    TELEGRAM_TEXT_MAX,
    TELEGRAM_TIMEOUT,
    TEXT_MAX,
    TRACE_TEXT_MAX,
    TYPING_INTERVAL,
} from '../../constant.js';

import { authGuard } from '../../plugins/authentication.js';
import { idList } from '../../utils/ids.js';
import { enqueue } from '../../utils/queue.js';
import { BadRequestResponse, UnauthorizedResponse } from '../../utils/response.js';
import { TeamAgent, TeamAgentDocument, TeamAgentExchange } from '../agent/agent.entity.js';
import { agentHasPermission } from '../agent/agent.permission.js';
import {
    buildMessages,
    buildSystemPrompt,
    type ChatMessage,
    completionCap,
    countTokens,
    earlierTurns,
    fitToContext,
    isToolRefusal,
    readAssistantTurn,
    readCompletion,
    readError,
    readToolCalls,
    recordable,
    toolGuidance,
} from '../agent/agent.reply.js';
import { type CompletionResult, isOpenRouter, sendCompletion } from '../agent/agent.transport.js';
import { type ActedBy, attribution, audit, changed } from '../audit/audit.log.js';
import {
    agentTools,
    readRosterContent,
    refuse,
    runTool,
    type ToolDefinition,
    toOpenAITools,
} from '../mcp/mcp.tools.js';
import {
    freeCandidates,
    freeQuotaUntil,
    isAutoFree,
    isSetAside,
    judge,
    pickFree,
    pickNext,
    setAside,
} from '../model/model.auto.js';
import { fetchCatalog, fetchEndpointModels } from '../model/model.provider.js';
import { profileLabel } from '../task/task.plan.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TeamBot, TeamModel } from '../team/team.entity.js';
import { rosterPrompt } from '../team/team.roster.js';
import { addressedText, telegramMethod, telegramRich } from './telegram.client.js';
import { TelegramMessage, TelegramUser } from './telegram.entity.js';
import { type InboundFile, inboundFile, readAttachment } from './telegram.files.js';
import {
    hasPermission,
    isKnownPermission,
    parsePermissions,
    serializePermissions,
} from './telegram.permission.js';
import {
    schemaConversationList,
    schemaConversationMessages,
    schemaPermissionCatalog,
    schemaProfileDetails,
    schemaProfilePermissionUpdate,
    schemaTelegramGroups,
    schemaTelegramWebhook,
    schemaTelegramWebhookRegister,
} from './telegram.schema.js';

export function createWebhookSecret(): string {
    return randomBytes(32).toString('hex');
}

export function secretMatches(expected: string, received: unknown): boolean {
    if (expected === '' || typeof received !== 'string') {
        return false;
    }

    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(received).digest();

    return timingSafeEqual(a, b);
}

function toProfile(user: TelegramUser) {
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
        created_at: user.created_at,
    };
}

interface InboundMessage {
    updateId: string;
    chatId: string;
    messageId: number;
    group: string;
    text: string;
    file?: InboundFile;
    sentAt: Date;
    from: {
        id: string;
        username: string;
        firstName: string;
        lastName: string;
        languageCode: string;
    };
}

export function readInboundMessage(
    body: unknown,
    bot?: { id: number; username: string },
): InboundMessage | undefined {
    if (typeof body !== 'object' || body === null) {
        return undefined;
    }

    const update = body as Record<string, unknown>;

    if (typeof update['update_id'] !== 'number' && typeof update['update_id'] !== 'string') {
        return undefined;
    }

    const message = update['message'];

    if (typeof message !== 'object' || message === null) {
        return undefined;
    }

    const { chat, from, text, caption, date } = message as Record<string, unknown>;

    if (typeof chat !== 'object' || chat === null || typeof from !== 'object' || from === null) {
        return undefined;
    }

    const chatRecord = chat as Record<string, unknown>;
    const fromRecord = from as Record<string, unknown>;
    const direct = chatRecord['type'] === 'private';

    if (!direct && !bot) {
        return undefined;
    }

    if (fromRecord['is_bot'] === true) {
        return undefined;
    }

    const file = inboundFile(message as Record<string, unknown>);
    const written = typeof text === 'string' ? text : typeof caption === 'string' ? caption : '';

    if (written === '' && file === undefined) {
        return undefined;
    }

    const replied = (message as { reply_to_message?: { from?: { id?: unknown } } }).reply_to_message
        ?.from?.id;
    const said = direct
        ? written
        : bot &&
          (addressedText({ ...(message as object), text: written }, bot) ??
              (file !== undefined && written === '' && replied === bot.id ? '' : undefined));

    if (said === undefined) {
        return undefined;
    }

    const senderId = fromRecord['id'];
    const chatId = chatRecord['id'];

    if (typeof senderId !== 'number' && typeof senderId !== 'string') {
        return undefined;
    }

    if (typeof chatId !== 'number' && typeof chatId !== 'string') {
        return undefined;
    }

    const text_ = (value: unknown) => (typeof value === 'string' ? value : '');

    const messageId = (message as Record<string, unknown>)['message_id'];

    return {
        updateId: String(update['update_id']),
        chatId: String(chatId),
        messageId: typeof messageId === 'number' ? messageId : 0,
        group: direct ? '' : text_(chatRecord['title']) || String(chatId),
        text: said.slice(0, TEXT_MAX),
        ...(file !== undefined && { file }),
        sentAt: typeof date === 'number' ? new Date(date * 1000) : new Date(),
        from: {
            id: String(senderId),
            username: text_(fromRecord['username']).slice(0, 64),
            firstName: text_(fromRecord['first_name']).slice(0, 128),
            lastName: text_(fromRecord['last_name']).slice(0, 128),
            languageCode: text_(fromRecord['language_code']).slice(0, 16),
        },
    };
}

async function botIdentity(
    fastify: FastifyInstance,
    bot: TeamBot,
): Promise<{ id: number; username: string }> {
    if (bot.username === '') {
        const me = await telegramMethod(bot.token, 'getMe', {}, undefined, TELEGRAM_TIMEOUT);
        const username = (me.data as { username?: string } | undefined)?.username ?? '';

        if (username !== '') {
            bot.username = username;

            await fastify.db.getRepository(TeamBot).update({ id: bot.id }, { username });
        }
    }

    return { id: Number(bot.token.split(':')[0]), username: bot.username };
}

export async function ingestUpdate(
    fastify: FastifyInstance,
    bot: TeamBot,
    body: unknown,
    log: FastifyBaseLogger,
): Promise<'stored' | 'ignored' | 'duplicate' | 'blocked'> {
    const inbound = readInboundMessage(
        body,
        bot.groups ? await botIdentity(fastify, bot) : undefined,
    );

    if (!inbound) {
        return 'ignored';
    }

    const messages = fastify.db.getRepository(TelegramMessage);

    if (await messages.findOneBy({ bot_id: bot.id, update_id: inbound.updateId })) {
        return 'duplicate';
    }

    const users = fastify.db.getRepository(TelegramUser);

    const profileFields = {
        username: inbound.from.username,
        first_name: inbound.from.firstName,
        last_name: inbound.from.lastName,
        language_code: inbound.from.languageCode,
        last_seen_at: inbound.sentAt,
    };

    let user = await users.findOneBy({ team_id: bot.team_id, telegram_id: inbound.from.id });

    if (!user) {
        user = await users.save({
            team_id: bot.team_id,
            telegram_id: inbound.from.id,
            message_count: 0,
            permissions: serializePermissions(DEFAULT_PERMISSIONS),
            ...profileFields,
        });

        log.info(
            { module: 'telegram', teamId: bot.team_id, userId: user.id },
            'telegram profile created',
        );
    } else {
        await users.update({ id: user.id }, profileFields);
    }

    if (!hasPermission(user.permissions, 'chat')) {
        log.info(
            { module: 'telegram', teamId: bot.team_id, botId: bot.id, userId: user.id },
            'telegram message refused: no chat permission',
        );

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'telegram',
            action: 'telegram.message',
            target: `profile:${user.id}`,
            outcome: 'skipped',
            detail: `bot ${bot.id} - sender lacks the chat permission`,
            changes: {
                bot_id: bot.id,
                chat_id: inbound.chatId,
                group: inbound.group,
                from: inbound.from,
                permissions: user.permissions,
                text: inbound.text,
            },
        });

        return 'blocked';
    }

    const stored = await messages.save({
        team_id: bot.team_id,
        user_id: user.id,
        bot_id: bot.id,
        update_id: inbound.updateId,
        chat_id: inbound.chatId,
        chat_title: inbound.group,
        text:
            inbound.file === undefined
                ? inbound.text
                : [`[${inbound.file.kind} ${inbound.file.name}]`, inbound.text]
                      .filter((part) => part !== '')
                      .join(' '),
        direction: 'in',
        sent_at: inbound.sentAt,
    });

    await users.increment({ id: user.id }, 'message_count', 1);

    log.info(
        { module: 'telegram', teamId: bot.team_id, botId: bot.id, userId: user.id },
        'telegram message stored',
    );

    await audit(fastify, log, {
        teamId: bot.team_id,
        actor: 'telegram',
        action: 'telegram.message',
        target: `profile:${user.id}`,
        detail: `bot ${bot.id} (${bot.name}) - ${inbound.text.length} chars - update ${inbound.updateId}`,
        changes: {
            message_id: stored.id,
            bot_id: bot.id,
            chat_id: inbound.chatId,
            group: inbound.group,
            update_id: inbound.updateId,
            text: inbound.text,
        },
    });

    void enqueue(REPLY_QUEUES, bot.id, () =>
        deliverAgentReply(fastify, bot, user, inbound, stored.id, log).catch((error: unknown) =>
            log.error({ module: 'agent', botId: bot.id, err: error }, 'agent reply crashed'),
        ),
    );

    return 'stored';
}

function tokenColumns(count: { prompt: number; completion: number; estimated: boolean }) {
    return {
        prompt_tokens: count.prompt,
        completion_tokens: count.completion,
        tokens_estimated: count.estimated,
    };
}

async function recordExchange(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    entry: {
        team_id: number;
        agent_id: number;
        model_id: number;
        user_id: number;
        round: number;
        request: string;
        response: string;
        tool_calls: number;
        prompt_tokens: number;
        completion_tokens: number;
        tokens_estimated: boolean;
        duration_ms: number;
        outcome: string;
        reason: string;
    },
): Promise<void> {
    try {
        await fastify.db.getRepository(TeamAgentExchange).save({
            ...entry,
            request: entry.request.slice(0, EXCHANGE_MAX),
            response: entry.response.slice(0, EXCHANGE_MAX),
        });
    } catch (error) {
        log.error(
            { module: 'agent', agentId: entry.agent_id, err: error },
            'exchange record failed',
        );
    }
}

export async function telegramText(
    token: string,
    method: 'sendMessage' | 'editMessageText',
    payload: Record<string, unknown>,
    text: string,
): Promise<{ ok: boolean; status: number; result?: unknown }> {
    const sent = await telegramRich(token, method, payload, 'text', text, TELEGRAM_TIMEOUT);

    return { ok: sent.ok, status: sent.status, result: sent.data };
}

function createStreamer(
    token: string,
    chatId: string,
    log: FastifyBaseLogger,
    opening: Record<string, unknown> = { chat_id: chatId },
) {
    let messageId: number | undefined;
    let sentText = '';
    let pending = '';
    let last = 0;
    let busy = false;

    const flush = async (force: boolean) => {
        const text = pending.slice(0, TELEGRAM_TEXT_MAX);

        if (busy || text === sentText || text.trim() === '') {
            return;
        }

        if (!force && Date.now() - last < STREAM_EDIT_INTERVAL) {
            return;
        }

        if (messageId === undefined && !force && text.length < STREAM_FIRST_CHARS) {
            return;
        }

        busy = true;
        last = Date.now();

        try {
            if (messageId === undefined) {
                const sent = await telegramText(token, 'sendMessage', opening, text);
                const id = (sent.result as { message_id?: unknown } | undefined)?.message_id;

                if (sent.ok && typeof id === 'number') {
                    messageId = id;
                    sentText = text;
                }
            } else if (
                (
                    await telegramText(
                        token,
                        'editMessageText',
                        { chat_id: chatId, message_id: messageId },
                        text,
                    )
                ).ok
            ) {
                sentText = text;
            }
        } finally {
            busy = false;
        }
    };

    return {
        push(text: string) {
            pending = text;

            void flush(false).catch(() => {});
        },

        started: () => messageId !== undefined,

        async finish(text: string): Promise<boolean> {
            pending = text;

            for (let attempt = 0; busy && attempt < 20; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, 50).unref());
            }

            await flush(true).catch(() => {});

            return messageId !== undefined && sentText === text.slice(0, TELEGRAM_TEXT_MAX);
        },

        async discard() {
            if (messageId === undefined) {
                return;
            }

            const removed = await telegramMethod(
                token,
                'deleteMessage',
                { chat_id: chatId, message_id: messageId },
                undefined,
                TELEGRAM_TIMEOUT,
            );

            if (!removed.ok) {
                log.warn(
                    { module: 'agent', status: removed.status },
                    'could not remove a part-written reply',
                );
            }

            messageId = undefined;
            sentText = '';
        },
    };
}

function failureNotice(status: number): string {
    if (status === 0) {
        return 'I could not reach the model just now. Please try again in a moment.';
    }

    if (status === 401 || status === 403) {
        return 'This bot is not set up correctly yet: its model rejected the request. Someone on the team needs to look at it.';
    }

    if (status === 402) {
        return 'This bot has run out of model credit. Someone on the team needs to top it up.';
    }

    if (status === 429) {
        return 'The model is busy right now. Please try again in a minute.';
    }

    return 'Something went wrong while answering. Please try again in a moment.';
}

async function notifyFailure(
    bot: TeamBot,
    chatId: string,
    status: number,
    log: FastifyBaseLogger,
): Promise<void> {
    const sent = await telegramMethod(
        bot.token,
        'sendMessage',
        { chat_id: chatId, text: failureNotice(status) },
        undefined,
        TELEGRAM_TIMEOUT,
    );

    if (!sent.ok) {
        log.warn(
            { module: 'agent', botId: bot.id, status: sent.status },
            'could not tell the person the reply failed',
        );
    }
}

function startTyping(token: string, chatId: string, log: FastifyBaseLogger): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let guard: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
        stopped = true;

        clearInterval(timer);
        clearTimeout(guard);
    };

    const ping = () => {
        if (stopped) {
            return;
        }

        void fetch(`${TELEGRAM_API}/bot${token}/sendChatAction`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
            signal: AbortSignal.timeout(TELEGRAM_TIMEOUT),
        }).catch(() => log.debug({ module: 'agent' }, 'typing action failed'));
    };

    ping();

    timer = setInterval(ping, TYPING_INTERVAL);
    guard = setTimeout(stop, AGENT_TIMEOUT);

    timer.unref();
    guard.unref();

    return stop;
}

export function placeholderUser(teamId: number, at: Date): TelegramUser {
    return Object.assign(new TelegramUser(), {
        id: 0,
        team_id: teamId,
        telegram_id: '0',
        username: '',
        first_name: '',
        last_name: '',
        language_code: '',
        message_count: 0,
        permissions: '',
        last_seen_at: at,
        created_at: at,
    });
}

export async function agentInstructions(
    fastify: FastifyInstance,
    agent: TeamAgent,
    tools: ToolDefinition[],
    situation = '',
): Promise<string> {
    const documents = await fastify.db
        .getRepository(TeamAgentDocument)
        .find({ where: { agent_id: agent.id } });

    const roster = agentHasPermission(agent.permissions, 'roster.read')
        ? rosterPrompt(await readRosterContent(fastify, agent.team_id))
        : '';

    return [
        buildSystemPrompt(
            documents,
            tools.some((tool) => tool.name === 'document_read'),
        ),
        roster,
        toolGuidance(tools.map((tool) => tool.name)),
        situation,
    ]
        .filter((section) => section !== '')
        .join('\n\n---\n\n');
}

export type AgentEvent =
    | {
          kind: 'model';
          at: string;
          round: number;
          model: string;
          ok: boolean;
          reason: string;
          prompt_tokens: number;
          completion_tokens: number;
          estimated: boolean;
          tool_calls: number;
          duration_ms: number;
      }
    | {
          kind: 'tool';
          at: string;
          round: number;
          name: string;
          ok: boolean;
          args: string;
          result: string;
          duration_ms: number;
      };

export function runFailure(run: AgentRun): string {
    if (run.unreachable) {
        return 'the model could not be reached';
    }

    return run.failure === '' ? 'the model returned no text' : run.failure;
}

interface AgentRun {
    text: string | undefined;
    failure: string;
    lastStatus: number;
    served: string;
    toolRuns: number;
    unreachable: boolean;
}

export async function runAgent(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    job: {
        teamId: number;
        agent: TeamAgent;
        model: TeamModel;
        user: TelegramUser;
        messages: ChatMessage[];
        tools: ToolDefinition[];
        onText?: (text: string) => void;
        trace?: (event: AgentEvent) => void;
    },
): Promise<AgentRun> {
    const { teamId, agent, model, user, messages, tools, onText, trace } = job;

    const traceModel = (
        round: number,
        modelId: string,
        ok: boolean,
        reason: string,
        spent: { prompt: number; completion: number; estimated: boolean },
        toolCalls: number,
        startedAt: number,
    ) =>
        trace?.({
            kind: 'model',
            at: new Date().toISOString(),
            round,
            model: modelId,
            ok,
            reason,
            prompt_tokens: spent.prompt,
            completion_tokens: spent.completion,
            estimated: spent.estimated,
            tool_calls: toolCalls,
            duration_ms: Date.now() - startedAt,
        });

    const auto = isAutoFree(model.model);
    const free = auto || isOpenRouter(model.base_url);

    const fixed: { id: string; context: number; key?: string } = {
        id: model.model,
        context: model.context_tokens,
    };
    const fixedKey = `model:${model.id}`;

    const loadPool = async () => {
        if (free) {
            const catalog = (await fetchCatalog()).models;
            const toolReady = freeCandidates(catalog, tools.length > 0);

            return toolReady.length > 0 ? toolReady : freeCandidates(catalog, false);
        }

        const fetched = await fetchEndpointModels(model.base_url, model.api_key);
        const known =
            fetched.length > 0
                ? fetched
                : (PROVIDERS.find((provider) => provider.url === model.base_url)?.models ?? []);

        return known
            .filter((listed) => listed.id !== model.model)
            .map((listed) => ({ ...listed, key: `${fixedKey}:${listed.id}` }));
    };

    let pool: ReturnType<typeof loadPool> | undefined;

    const nextModel = async (tried: ReadonlySet<string>) => {
        pool ??= loadPool();

        const listed: { id: string; context: number; key?: string }[] = await pool;

        return free ? pickFree(listed, tried) : pickNext(listed, tried);
    };

    let chosen: { id: string; context: number; key?: string } | null =
        auto || isSetAside(fixedKey) ? null : fixed;
    let served = model.model;

    let text: string | undefined;
    let toolRuns = 0;

    let toolsUsable = true;

    let failure = '';

    let lastStatus = 0;

    try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
            const roundStartedAt = Date.now();

            const ask = async (withTools: boolean) => {
                const tried = new Set<string>();
                const offered = withTools ? toOpenAITools(tools) : undefined;

                let last:
                    | (CompletionResult & { sending: ChatMessage[]; offered: typeof offered })
                    | undefined;

                for (let attempt = 1; ; attempt += 1) {
                    const target =
                        chosen ??
                        (await nextModel(tried)) ??
                        (auto || tried.has(fixed.id) ? null : fixed);

                    if (target === null) {
                        if (last !== undefined) {
                            return last;
                        }

                        const until = free ? freeQuotaUntil() : null;

                        return {
                            ok: false,
                            status: 0,
                            payload: {
                                error: {
                                    message:
                                        until !== null
                                            ? `the free models are used up until ${new Date(until).toISOString()}`
                                            : free
                                              ? 'no free model is available'
                                              : 'no other model on this endpoint is available',
                                },
                            },
                            sending: messages,
                            offered,
                        };
                    }

                    const sending = fitToContext(messages, target.context);
                    const callStartedAt = Date.now();
                    const result = await sendCompletion({
                        baseUrl: model.base_url,
                        apiKey: model.api_key,
                        model: target.id,
                        messages: sending,
                        maxTokens: completionCap(target.context),
                        ...(offered !== undefined && { tools: offered }),
                        timeoutMs: AGENT_TIMEOUT,
                        ...(!withTools && onText !== undefined && { onText }),
                    });

                    served = target.id;

                    const own = target === fixed;
                    const callStatus =
                        result.status === 0 ? 'no response' : `http ${result.status}`;

                    await audit(fastify, log, {
                        teamId,
                        actor: 'agent',
                        action: 'model.call',
                        target: `model:${model.id}`,
                        outcome: result.ok ? 'ok' : 'error',
                        durationMs: Date.now() - callStartedAt,
                        detail: `${agent.name} sent round ${round} to ${target.id}${own ? '' : ` instead of ${model.model}`} at ${model.base_url} · ${callStatus}`,
                        changes: {
                            endpoint: model.base_url,
                            saved_model: model.model,
                            chosen_model: target.id,
                            why: own
                                ? 'the saved model'
                                : auto
                                  ? 'picked from the free models'
                                  : `fallback, attempt ${attempt}`,
                            round,
                            attempt,
                            profile_id: user.id,
                            messages_sent: sending.length,
                            messages_trimmed: messages.length - sending.length,
                            tools_offered: offered?.length ?? 0,
                            max_tokens: completionCap(target.context),
                            status: result.status,
                            ...(!result.ok && { error: readError(result.payload) }),
                        },
                    });
                    const refused = withTools && isToolRefusal(result.payload);

                    if (own && refused) {
                        return { ...result, sending, offered };
                    }

                    tried.add(target.id);

                    const verdict = result.ok
                        ? null
                        : judge(result.status, result.payload, refused);

                    if (verdict !== null) {
                        setAside(own ? fixedKey : (target.key ?? target.id), verdict);
                    }

                    if (
                        result.ok ||
                        verdict === null ||
                        verdict.kind === 'quota' ||
                        attempt >= AUTO_ATTEMPTS
                    ) {
                        chosen = result.ok ? target : null;

                        return { ...result, sending, offered };
                    }

                    chosen = null;
                    last = { ...result, sending, offered };

                    log.warn(
                        {
                            module: 'agent',
                            agentId: agent.id,
                            modelId: model.id,
                            failed: target.id,
                            status: result.status,
                            setAside: verdict.kind,
                            until: new Date(verdict.until).toISOString(),
                        },
                        'model failed: switching to the next',
                    );

                    const spent = countTokens(
                        result.payload,
                        { messages: sending, tools: offered },
                        false,
                    );
                    const reason = `${result.status === 0 ? 'no response' : `http ${result.status}`} - ${verdict.kind === 'hide' ? 'hidden until' : 'resting until'} ${new Date(verdict.until).toISOString()}, switching`;

                    await recordExchange(fastify, log, {
                        team_id: teamId,
                        agent_id: agent.id,
                        model_id: model.id,
                        user_id: user.id,
                        round,
                        request: JSON.stringify(recordable(sending)),
                        response: JSON.stringify(result.payload ?? null),
                        tool_calls: 0,
                        ...tokenColumns(spent),
                        duration_ms: Date.now() - roundStartedAt,
                        outcome: 'error',
                        reason: `${target.id} - ${reason}`,
                    });

                    traceModel(round, target.id, false, reason, spent, 0, roundStartedAt);
                }
            };

            const offering = toolsUsable && tools.length > 0 && round < MAX_TOOL_ROUNDS;

            let { ok, status: code, payload, sending, offered } = await ask(offering);

            if (!ok && offering && isToolRefusal(payload)) {
                log.warn(
                    {
                        module: 'agent',
                        agentId: agent.id,
                        modelId: model.id,
                        reason: readError(payload).slice(0, ERROR_TEXT_MAX),
                    },
                    'model refused tools: retrying without them',
                );

                const refused = countTokens(payload, { messages: sending, tools: offered }, false);

                await recordExchange(fastify, log, {
                    team_id: teamId,
                    agent_id: agent.id,
                    model_id: model.id,
                    user_id: user.id,
                    round,
                    request: JSON.stringify(recordable(sending)),
                    response: JSON.stringify(payload ?? null),
                    tool_calls: 0,
                    ...tokenColumns(refused),
                    duration_ms: Date.now() - roundStartedAt,
                    outcome: 'error',
                    reason: `tools refused - http ${code}`,
                });

                traceModel(
                    round,
                    served,
                    false,
                    `refused tools (http ${code}) - asking again without them`,
                    refused,
                    0,
                    roundStartedAt,
                );

                toolsUsable = false;

                ({ ok, status: code, payload, sending, offered } = await ask(false));
            }

            const status = ok ? '' : code === 0 ? 'no response' : `http ${code}`;

            lastStatus = ok ? 0 : code;

            const calls = readToolCalls(payload);

            const spent = countTokens(payload, { messages: sending, tools: offered }, ok);

            await recordExchange(fastify, log, {
                team_id: teamId,
                agent_id: agent.id,
                model_id: model.id,
                user_id: user.id,
                round,
                request: JSON.stringify(recordable(sending)),
                response: JSON.stringify(readAssistantTurn(payload) ?? payload ?? null),
                tool_calls: calls.length,
                ...tokenColumns(spent),
                duration_ms: Date.now() - roundStartedAt,
                outcome: ok ? 'ok' : 'error',
                reason:
                    served === model.model
                        ? status
                        : [served, status].filter((part) => part !== '').join(' - '),
            });

            traceModel(
                round,
                served,
                ok,
                [status, ok ? '' : readError(payload)].filter((part) => part !== '').join(' - '),
                spent,
                calls.length,
                roundStartedAt,
            );

            if (calls.length === 0 || round === MAX_TOOL_ROUNDS) {
                text = readCompletion(payload);

                failure = [status, readError(payload)].filter((part) => part !== '').join(' - ');

                break;
            }

            messages.push(readAssistantTurn(payload) as ChatMessage);

            for (const call of calls) {
                const toolStartedAt = Date.now();

                const result = tools.some((tool) => tool.name === call.name)
                    ? call.name === 'agent_call'
                        ? await callAgent(fastify, log, agent, user, call.arguments)
                        : await runTool(fastify, agent, user, call.name, call.arguments)
                    : {
                          ok: false,
                          content: JSON.stringify({ error: `${call.name} is not available here` }),
                      };

                toolRuns += 1;

                await audit(fastify, log, {
                    teamId: teamId,
                    actor: 'agent',
                    action: 'agent.tool',
                    target: `profile:${user.id}`,
                    outcome: result.ok ? 'ok' : 'error',
                    durationMs: Date.now() - toolStartedAt,
                    detail: `${call.name} · agent ${agent.id} (${agent.name}) · round ${round} · args ${Object.keys(call.arguments).join(',') || 'none'}${result.ok ? '' : ` · ${result.content.slice(0, 90)}`}`,
                    changes: {
                        agent_id: agent.id,
                        model: served,
                        round,
                        tool: call.name,
                        args: call.arguments,
                        result: result.content.slice(0, TRACE_TEXT_MAX),
                    },
                });

                trace?.({
                    kind: 'tool',
                    at: new Date().toISOString(),
                    round,
                    name: call.name,
                    ok: result.ok,
                    args: JSON.stringify(call.arguments).slice(0, TRACE_TEXT_MAX),
                    result: result.content.slice(0, TRACE_TEXT_MAX),
                    duration_ms: Date.now() - toolStartedAt,
                });

                messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
            }
        }
    } catch {
        return { text: undefined, failure, lastStatus, served, toolRuns, unreachable: true };
    }

    return { text, failure, lastStatus, served, toolRuns, unreachable: false };
}

async function callAgent(
    fastify: FastifyInstance,
    log: FastifyBaseLogger,
    caller: TeamAgent,
    user: TelegramUser,
    args: Record<string, unknown>,
): Promise<{ ok: boolean; content: string }> {
    if (!hasPermission(user.permissions, 'delegate')) {
        return refuse('the person you are answering may not ask other agents');
    }

    const wanted = typeof args['agent'] === 'string' ? args['agent'].trim().toLowerCase() : '';
    const request = typeof args['request'] === 'string' ? args['request'].trim() : '';

    if (wanted === '' || request === '') {
        return refuse('agent and request are required');
    }

    const target = (
        await fastify.db.getRepository(TeamAgent).find({ where: { team_id: caller.team_id } })
    ).find(
        (other) =>
            other.id !== caller.id &&
            (other.name.toLowerCase() === wanted || String(other.id) === wanted),
    );

    if (!target) {
        return refuse(`there is no other agent called ${wanted}`);
    }

    const model = await fastify.db
        .getRepository(TeamModel)
        .findOneBy({ id: target.model_id, team_id: caller.team_id });

    if (!model) {
        return refuse(`${target.name} has no model to answer with`);
    }

    const tools = await agentTools(fastify, target, user, true);
    const person = profileLabel(user);
    const startedAt = Date.now();

    const run = await runAgent(fastify, log.child({ calledAgentId: target.id }), {
        teamId: caller.team_id,
        agent: target,
        model,
        user,
        messages: buildMessages(
            await agentInstructions(
                fastify,
                target,
                tools,
                [
                    '# Asked by another agent',
                    '',
                    `${caller.name} is passing on a request from ${person}, who may ask other agents. Carry it out with your own tools, then say in a few sentences what you did, or why you could not. Your answer goes back to ${caller.name}, not to ${person}.`,
                ].join('\n'),
            ),
            [],
            request,
        ),
        tools,
    });

    const answer = run.unreachable ? '' : (run.text ?? '').trim();

    await audit(fastify, log, {
        teamId: caller.team_id,
        actor: 'agent',
        action: 'agent.call',
        target: `agent:${target.id}`,
        outcome: answer === '' ? 'error' : 'ok',
        durationMs: Date.now() - startedAt,
        detail: `${caller.name} asked ${target.name} for ${person} (profile ${user.id}) · ${run.toolRuns} tool call(s)${answer === '' ? ` · ${runFailure(run)}` : ''}`,
        changes: {
            caller_id: caller.id,
            profile_id: user.id,
            request,
            answer: answer === '' ? null : answer,
            failure: answer === '' ? runFailure(run) : null,
        },
    });

    if (answer === '') {
        return refuse(`${target.name} could not answer: ${runFailure(run)}`);
    }

    return {
        ok: true,
        content: JSON.stringify({ agent: target.name, answer, tool_calls: run.toolRuns }),
    };
}

async function deliverAgentReply(
    fastify: FastifyInstance,
    bot: TeamBot,
    user: TelegramUser,
    inbound: InboundMessage,
    messageId: number,
    log: FastifyBaseLogger,
) {
    const { chatId, text: incoming } = inbound;
    const asked = {
        bot_id: bot.id,
        profile_id: user.id,
        chat_id: chatId,
        group: inbound.group,
        message_id: messageId,
        text: incoming,
    };

    if (bot.agent_id === 0) {
        return;
    }

    const allowed = idList(bot.profiles);

    if (allowed.length > 0 && !allowed.includes(user.id)) {
        log.info(
            { module: 'agent', botId: bot.id, userId: user.id },
            'agent reply skipped: bot answers other people only',
        );

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `bot:${bot.id}`,
            outcome: 'skipped',
            detail: `profile ${user.id} is not one of the ${allowed.length} people ${bot.name} answers`,
            changes: { ...asked, answers_only: allowed },
        });

        return;
    }

    if (!hasPermission(user.permissions, 'model')) {
        log.info(
            { module: 'agent', botId: bot.id, userId: user.id },
            'agent reply skipped: no model permission',
        );

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `bot:${bot.id}`,
            outcome: 'skipped',
            detail: `profile ${user.id} lacks the model permission`,
            changes: { ...asked, permissions: user.permissions },
        });

        return;
    }

    const agent = await fastify.db
        .getRepository(TeamAgent)
        .findOneBy({ id: bot.agent_id, team_id: bot.team_id });

    if (!agent || agent.model_id === 0) {
        log.warn(
            { module: 'agent', botId: bot.id, agentId: bot.agent_id },
            'agent reply skipped: agent or model missing',
        );

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `agent:${bot.agent_id}`,
            outcome: 'skipped',
            detail: `bot ${bot.id} - agent missing or has no model attached`,
            changes: {
                ...asked,
                agent_id: bot.agent_id,
                reason: agent ? 'the agent has no model attached' : 'the agent no longer exists',
            },
        });

        return;
    }

    const model = await fastify.db
        .getRepository(TeamModel)
        .findOneBy({ id: agent.model_id, team_id: bot.team_id });

    if (!model) {
        log.warn(
            { module: 'agent', botId: bot.id, agentId: agent.id },
            'agent reply skipped: model missing',
        );

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `agent:${agent.id}`,
            outcome: 'skipped',
            detail: `agent ${agent.name} - model ${agent.model_id} missing`,
            changes: { ...asked, agent_id: agent.id, model_id: agent.model_id },
        });

        return;
    }

    const scope = { team_id: bot.team_id, user_id: user.id, chat_id: chatId };
    const history = await fastify.db.getRepository(TelegramMessage).find({
        where: [
            { ...scope, direction: 'out' },
            { ...scope, direction: 'in', id: LessThan(messageId) },
        ],
        order: { id: 'DESC' },
        take: HISTORY_LIMIT + 1,
    });

    const earlier = earlierTurns(history, messageId);

    const attached =
        inbound.file === undefined
            ? null
            : await readAttachment(fastify, log, bot.team_id, bot.token, inbound.file);
    const request =
        attached === null
            ? incoming
            : [attached.text, incoming].filter((part) => part !== '').join('\n\n') ||
              '[They sent a photo.]';

    if (attached !== null) {
        await fastify.db.getRepository(TelegramMessage).update(
            { id: messageId },
            {
                text: [attached.saved, incoming]
                    .filter((part) => part !== '')
                    .join('\n')
                    .slice(0, TEXT_MAX),
            },
        );
    }

    const tools = await agentTools(fastify, agent, user);

    const messages: ChatMessage[] = buildMessages(
        await agentInstructions(
            fastify,
            agent,
            tools,
            inbound.group === ''
                ? ''
                : [
                      '# Where you are',
                      '',
                      `You are answering ${profileLabel(user)} in the Telegram group "${inbound.group}", where they mentioned you. Everyone in the group reads your reply, so never share what they told you in private.`,
                  ].join('\n'),
        ),
        earlier,
        request,
        attached?.parts ?? [],
    );

    const opening = {
        chat_id: chatId,
        ...(inbound.group !== '' && {
            reply_parameters: { message_id: inbound.messageId, allow_sending_without_reply: true },
        }),
    };

    const stopTyping = startTyping(bot.token, chatId, log);

    const streamer = createStreamer(bot.token, chatId, log, opening);

    const startedAt = Date.now();

    let run: AgentRun;

    try {
        run = await runAgent(fastify, log.child({ botId: bot.id }), {
            teamId: bot.team_id,
            agent,
            model,
            user,
            messages,
            tools,
            onText: (partial) => streamer.push(partial),
        });
    } finally {
        stopTyping();
    }

    const { text, failure, lastStatus, served, toolRuns } = run;
    const ran = {
        ...asked,
        agent_id: agent.id,
        model_id: model.id,
        endpoint: model.base_url,
        saved_model: model.model,
        chosen_model: served,
        messages_in: messages.length,
        tools_offered: tools.length,
        tool_calls: toolRuns,
    };

    if (run.unreachable) {
        log.warn(
            { module: 'agent', botId: bot.id, agentId: agent.id },
            'agent reply failed: model unreachable',
        );

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `agent:${agent.id}`,
            outcome: 'error',
            durationMs: Date.now() - startedAt,
            detail: `agent ${agent.id} (${agent.name}) - model ${model.id} (${served}) unreachable`,
            changes: {
                ...ran,
                failure: failure === '' ? 'the model could not be reached' : failure,
            },
        });

        await streamer.discard();

        await notifyFailure(bot, chatId, 0, log);

        return;
    }

    if (text === undefined) {
        const reason = failure === '' ? 'the model returned no text' : failure;

        log.warn(
            { module: 'agent', botId: bot.id, agentId: agent.id, modelId: model.id, reason },
            'agent reply failed: no usable completion',
        );

        await audit(fastify, log, {
            teamId: bot.team_id,
            actor: 'agent',
            action: 'agent.request',
            target: `agent:${agent.id}`,
            outcome: 'error',
            durationMs: Date.now() - startedAt,
            detail: `agent ${agent.id} (${agent.name}) - model ${model.id} returned no usable completion after ${toolRuns} tool call(s) - ${reason}`,
            changes: { ...ran, failure: reason, last_status: lastStatus },
        });

        await streamer.discard();

        await notifyFailure(bot, chatId, lastStatus, log);

        return;
    }

    if (!(await streamer.finish(text))) {
        const sent = await telegramText(
            bot.token,
            'sendMessage',
            opening,
            text.slice(0, TELEGRAM_TEXT_MAX),
        );

        if (!sent.ok) {
            log.warn(
                { module: 'agent', botId: bot.id, status: sent.status },
                'agent reply failed: telegram would not take it',
            );

            await audit(fastify, log, {
                teamId: bot.team_id,
                actor: 'agent',
                action: 'agent.reply',
                target: `bot:${bot.id}`,
                outcome: 'error',
                detail: `telegram refused with ${sent.status} - ${text.length} chars`,
                changes: { ...ran, status: sent.status, telegram: sent.result ?? null, text },
            });

            await streamer.discard();

            return;
        }
    }

    const reply = await fastify.db.getRepository(TelegramMessage).save({
        team_id: bot.team_id,
        user_id: user.id,
        bot_id: bot.id,
        update_id: String(-Date.now()),
        chat_id: chatId,
        text,
        direction: 'out',
        sent_at: new Date(),
    });

    log.info(
        { module: 'agent', botId: bot.id, agentId: agent.id, userId: user.id },
        'agent replied',
    );

    await audit(fastify, log, {
        teamId: bot.team_id,
        action: 'agent.request',
        target: `agent:${agent.id}`,
        outcome: 'ok',
        durationMs: Date.now() - startedAt,
        actor: 'agent',
        detail: `agent ${agent.id} (${agent.name}) · model ${model.id} (${served}) · profile ${user.id} · ${messages.length} messages in · ${text.length} chars out · ${toolRuns} tool call(s)`,
        changes: {
            ...ran,
            reply_id: reply.id,
            answer: text,
        },
    });
}

export function telegramWebhook(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const botId = readParamId(request, 'botId', 'BOT_ID_INVALID');

        const bot = await fastify.db.getRepository(TeamBot).findOneBy({ id: botId });

        if (
            !bot ||
            !secretMatches(bot.webhook_secret, request.headers['x-telegram-bot-api-secret-token'])
        ) {
            request.log.warn({ module: 'telegram', botId }, 'webhook rejected');

            throw new UnauthorizedResponse('WEBHOOK_REJECTED');
        }

        await ingestUpdate(fastify, bot, request.body, request.log);

        reply.send({ ok: true });
    };

    return { schema: schemaTelegramWebhook(), config: {}, handler };
}

export function conversationList(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { limit, offset } = readPage(request, CONVERSATION_PAGE);

        const raw = (request.query as Record<string, string | undefined>)['q']?.trim() ?? '';
        const like = ILike(`%${raw.slice(0, 64).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

        const [rows, total] = await fastify.db.getRepository(TelegramUser).findAndCount({
            where:
                raw === ''
                    ? { team_id: teamId }
                    : [
                          { team_id: teamId, first_name: like },
                          { team_id: teamId, last_name: like },
                          { team_id: teamId, username: like },
                      ],
            order: { last_seen_at: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        reply.send({ limit, offset, has_more, total, conversations: items.map(toProfile) });
    };

    return { schema: schemaConversationList(), config: { ...authGuard() }, handler };
}

export async function groupTitles(
    fastify: FastifyInstance,
    teamId: number,
    chatIds: string[],
): Promise<Map<string, string>> {
    if (chatIds.length === 0) {
        return new Map();
    }

    const rows = await fastify.db
        .getRepository(TelegramMessage)
        .createQueryBuilder('m')
        .distinctOn(['m.chat_id'])
        .select(['m.chat_id', 'm.chat_title'])
        .where('m.team_id = :teamId', { teamId })
        .andWhere('m.chat_id IN (:...chatIds)', { chatIds })
        .andWhere("m.chat_title <> ''")
        .orderBy('m.chat_id')
        .addOrderBy('m.id', 'DESC')
        .getMany();

    return new Map(rows.map((row) => [String(row.chat_id), row.chat_title]));
}

export function telegramGroups(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const rows = await fastify.db
            .getRepository(TelegramMessage)
            .createQueryBuilder('m')
            .select('m.bot_id', 'bot_id')
            .addSelect('m.chat_id', 'chat_id')
            .addSelect('MAX(m.sent_at)', 'last_at')
            .where('m.team_id = :teamId', { teamId })
            .andWhere('m.chat_id < 0')
            .groupBy('m.bot_id')
            .addGroupBy('m.chat_id')
            .orderBy('last_at', 'DESC')
            .getRawMany<{ bot_id: number; chat_id: string; last_at: Date }>();

        const bots = new Map(
            (await fastify.db.getRepository(TeamBot).findBy({ team_id: teamId })).map((bot) => [
                bot.id,
                bot.name,
            ]),
        );
        const titles = await groupTitles(
            fastify,
            teamId,
            rows.map((row) => String(row.chat_id)),
        );

        reply.send({
            groups: rows
                .filter((row) => bots.has(Number(row.bot_id)))
                .map((row) => ({
                    bot_id: Number(row.bot_id),
                    bot_name: bots.get(Number(row.bot_id)) ?? '',
                    chat_id: String(row.chat_id),
                    title: titles.get(String(row.chat_id)) ?? String(row.chat_id),
                    last_at: new Date(row.last_at).toISOString(),
                })),
        });
    };

    return { schema: schemaTelegramGroups(), config: { ...authGuard() }, handler };
}

export function conversationMessages(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');
        const userId = readParamId(request, 'userId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const user = await fastify.db
            .getRepository(TelegramUser)
            .findOneBy({ id: userId, team_id: teamId });

        if (!user) {
            throw new BadRequestResponse('PROFILE_NOT_FOUND');
        }

        const { limit, offset } = readPage(request, MESSAGE_PAGE);

        const [rows, total] = await fastify.db.getRepository(TelegramMessage).findAndCount({
            where: { team_id: teamId, user_id: user.id },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        reply.send({
            profile: toProfile(user),
            limit,
            offset,
            total,
            has_more,
            messages: items.reverse().map((message) => ({
                id: message.id,
                bot_id: message.bot_id,
                text: message.text,
                direction: message.direction,
                sent_at: message.sent_at,
            })),
        });
    };

    return { schema: schemaConversationMessages(), config: { ...authGuard() }, handler };
}

export function profileDetails(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');
        const profileId = readParamId(request, 'profileId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const user = await fastify.db
            .getRepository(TelegramUser)
            .findOneBy({ id: profileId, team_id: teamId });

        if (!user) {
            throw new BadRequestResponse('PROFILE_NOT_FOUND');
        }

        const messages = await fastify.db.getRepository(TelegramMessage).find({
            where: { team_id: teamId, user_id: user.id },
            order: { id: 'DESC' },
            take: MESSAGE_PAGE,
        });

        messages.reverse();

        const names = new Map(
            (await fastify.db.getRepository(TeamBot).findBy({ team_id: teamId })).map((bot) => [
                bot.id,
                bot.name,
            ]),
        );

        const perBot = new Map<
            number,
            { id: number; name: string; message_count: number; last_seen_at: Date }
        >();

        for (const message of messages) {
            const entry = perBot.get(message.bot_id) ?? {
                id: message.bot_id,
                name: names.get(message.bot_id) ?? 'Removed bot',
                message_count: 0,
                last_seen_at: message.sent_at,
            };

            entry.message_count += 1;

            if (message.sent_at > entry.last_seen_at) {
                entry.last_seen_at = message.sent_at;
            }

            perBot.set(message.bot_id, entry);
        }

        reply.send({
            profile: toProfile(user),
            bots: [...perBot.values()].sort((a, b) => b.message_count - a.message_count),
            messages: messages.map((message) => ({
                id: message.id,
                bot_id: message.bot_id,
                text: message.text,
                direction: message.direction,
                sent_at: message.sent_at,
            })),
        });
    };

    return { schema: schemaProfileDetails(), config: { ...authGuard() }, handler };
}

export function permissionCatalog(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({ permissions: PERMISSIONS });
    };

    return { schema: schemaPermissionCatalog(), config: { ...authGuard() }, handler };
}

export async function setProfilePermissions(
    fastify: FastifyInstance,
    teamId: number,
    profileId: number,
    requested: unknown,
    by: ActedBy,
): Promise<TelegramUser> {
    const credit = attribution(by);

    if (!Array.isArray(requested) || requested.some((key) => typeof key !== 'string')) {
        throw new BadRequestResponse('PERMISSIONS_INVALID');
    }

    for (const key of requested as string[]) {
        if (!isKnownPermission(key)) {
            throw new BadRequestResponse('PERMISSION_UNKNOWN');
        }
    }

    const users = fastify.db.getRepository(TelegramUser);
    const user = await users.findOneBy({ id: profileId, team_id: teamId });

    if (!user) {
        throw new BadRequestResponse('PROFILE_NOT_FOUND');
    }

    const permissions = serializePermissions(requested as string[]);

    await users.update({ id: user.id, team_id: teamId }, { permissions });

    by.log.info(
        {
            module: 'telegram',
            teamId,
            userId: user.id,
            accountId: by.accountId,
            permissions,
        },
        'profile permissions updated',
    );

    await audit(fastify, by.log, {
        teamId,
        ...credit.who,
        action: 'profile.permissions',
        target: `profile:${user.id}`,
        detail: `${profileLabel(user)} -> ${permissions === '' ? 'all revoked' : permissions}${credit.note}`,
        changes: {
            ...changed(
                { permissions: parsePermissions(user.permissions) },
                { permissions: parsePermissions(permissions) },
            ),
            ...credit.changes,
        },
    });

    return { ...user, permissions };
}

export function profilePermissionUpdate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const profileId = readParamId(request, 'profileId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const user = await setProfilePermissions(
            fastify,
            teamId,
            profileId,
            (request.body as { permissions?: unknown } | undefined)?.permissions,
            { log: request.log, accountId: request.account_id },
        );

        reply.send(toProfile(user));
    };

    return { schema: schemaProfilePermissionUpdate(), config: { ...authGuard() }, handler };
}

export function telegramWebhookRegister(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readParamId(request, 'id', 'TEAM_ID_INVALID');
        const botId = readParamId(request, 'botId', 'BOT_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const bots = fastify.db.getRepository(TeamBot);

        const bot = await bots.findOneBy({ id: botId, team_id: teamId });

        if (!bot) {
            throw new BadRequestResponse('BOT_NOT_FOUND');
        }

        if (bot.public_url === '') {
            reply.send({ ok: false, reason: 'BOT_PUBLIC_URL_NOT_SET' });

            return;
        }

        const minted = bot.webhook_secret === '';

        if (minted) {
            bot.webhook_secret = createWebhookSecret();

            await bots.update({ id: bot.id }, { webhook_secret: bot.webhook_secret });
        }

        const url = `${bot.public_url.replace(/\/+$/, '')}/api/telegram/webhook/${bot.id}`;
        const record = (outcome: 'ok' | 'error', detail: string) =>
            audit(fastify, request.log, {
                teamId,
                accountId: request.account_id,
                action: 'bot.webhook',
                target: `bot:${bot.id}`,
                outcome,
                detail: `${bot.name} · ${detail}`,
                changes: { url, ...(minted && { webhook_secret: bot.webhook_secret }) },
            });

        let ok = false;

        try {
            const response = await fetch(`${TELEGRAM_API}/bot${bot.token}/setWebhook`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    url,
                    secret_token: bot.webhook_secret,
                    allowed_updates: ['message'],
                }),
                signal: AbortSignal.timeout(TELEGRAM_TIMEOUT),
            });

            const payload = (await response.json().catch(() => undefined)) as
                | { ok?: boolean }
                | undefined;

            ok = response.ok && payload?.ok === true;
        } catch {
            await record('error', 'Telegram could not be reached');

            reply.send({ ok: false, reason: 'BOT_UNREACHABLE' });

            return;
        }

        request.log.info(
            { module: 'telegram', teamId, botId: bot.id, ok },
            'telegram webhook registered',
        );

        await record(
            ok ? 'ok' : 'error',
            ok ? `webhook set to ${url}` : 'Telegram refused the token',
        );

        reply.send(ok ? { ok, url } : { ok, reason: 'BOT_TOKEN_REJECTED' });
    };

    return { schema: schemaTelegramWebhookRegister(), config: { ...authGuard() }, handler };
}
