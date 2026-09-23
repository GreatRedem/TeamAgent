import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import {
    APP_NAME,
    BACKOFF_ERROR,
    BACKOFF_REJECTED,
    DISCORD_FATAL_CLOSE,
    DISCORD_GATEWAY,
    DISCORD_HEARTBEAT,
    DISCORD_INTENTS,
    PLUGIN_STATUS,
    POLL_HOLD,
    POLL_TIMEOUT,
    TELEGRAM_TEXT_MAX,
} from '../../constant.js';

import { TeamBot } from '../team/team.entity.js';
import { telegramMethod, telegramRich } from '../telegram/telegram.client.js';
import { settingsOf, sleep } from './plugin.common.js';
import { discordCall, discordInbound, discordSend } from './plugin.discord.js';
import { TeamPlugin } from './plugin.entity.js';
import { receiveInbound } from './plugin.inbound.js';
import { telegramInbound } from './plugin.telegram.js';

function report(plugin: TeamPlugin, listening: boolean, error = '') {
    PLUGIN_STATUS.set(plugin.id, { listening, error });
}

export async function listenTelegram(
    fastify: FastifyInstance,
    plugin: TeamPlugin,
    signal: AbortSignal,
    log: FastifyBaseLogger,
): Promise<void> {
    const token = settingsOf(plugin).secrets['token'] ?? '';

    let bot: { id: number; username: string } | null = null;
    let offset = Number(plugin.poll_offset);

    while (!signal.aborted) {
        if (bot === null) {
            if (await fastify.db.getRepository(TeamBot).existsBy({ token })) {
                report(plugin, false, 'This bot is also under Bots, which answers it there.');

                await sleep(BACKOFF_REJECTED, signal);

                continue;
            }

            const me = await telegramMethod(token, 'getMe', {}, signal);

            if (!me.ok) {
                report(plugin, false, me.error ?? 'Telegram refused the token.');

                await sleep(me.status === 0 ? BACKOFF_ERROR : BACKOFF_REJECTED, signal);

                continue;
            }

            bot = me.data as { id: number; username: string };

            if (offset === 0) {
                const latest = await telegramMethod(
                    token,
                    'getUpdates',
                    { offset: -1, timeout: 0 },
                    signal,
                );
                const last = (latest.data as { update_id?: number }[] | undefined)?.[0];

                offset = last?.update_id === undefined ? 0 : last.update_id + 1;
            }
        }

        const answer = await telegramMethod(
            token,
            'getUpdates',
            { ...(offset > 0 && { offset }), timeout: POLL_HOLD, allowed_updates: ['message'] },
            signal,
            POLL_TIMEOUT,
        );

        if (signal.aborted) {
            return;
        }

        if (!answer.ok) {
            report(
                plugin,
                false,
                answer.status === 409
                    ? 'Something else is reading this bot, such as a webhook or another server.'
                    : (answer.error ?? 'Telegram could not be reached.'),
            );

            await sleep(answer.status === 0 ? BACKOFF_ERROR : BACKOFF_REJECTED, signal);

            continue;
        }

        report(plugin, true);

        const updates = Array.isArray(answer.data) ? (answer.data as { update_id: number }[]) : [];

        for (const update of updates) {
            offset = Math.max(offset, update.update_id + 1);

            const event = telegramInbound(update, bot);

            if (!event) {
                continue;
            }

            const chat = event.ids['chat_id'] ?? '';
            const replyTo = Number(event.ids['message_id']);

            void receiveInbound(
                fastify,
                log,
                plugin,
                event,
                (text) =>
                    telegramRich(
                        token,
                        'sendMessage',
                        {
                            chat_id: chat,
                            reply_parameters: {
                                message_id: replyTo,
                                allow_sending_without_reply: true,
                            },
                        },
                        'text',
                        text.slice(0, TELEGRAM_TEXT_MAX),
                    ),
                () => telegramMethod(token, 'sendChatAction', { chat_id: chat, action: 'typing' }),
            ).catch((error: unknown) =>
                log.error({ pluginId: plugin.id, err: error }, 'telegram plugin reply crashed'),
            );
        }

        if (updates.length > 0) {
            await fastify.db
                .getRepository(TeamPlugin)
                .update({ id: plugin.id }, { poll_offset: String(offset) });
        }
    }
}

function discordSession(
    token: string,
    signal: AbortSignal,
    onReady: (self: string) => void,
    onMessage: (message: unknown) => void,
): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
        const socket = new WebSocket(DISCORD_GATEWAY);

        let sequence: number | null = null;
        let acked = true;
        let heartbeat: ReturnType<typeof setInterval> | undefined;

        const send = (packet: unknown) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(packet));
            }
        };

        const stop = () => socket.close(1000);

        signal.addEventListener('abort', stop, { once: true });

        socket.addEventListener('message', (message) => {
            let packet: { op?: number; d?: unknown; s?: number | null; t?: string | null };

            try {
                packet = JSON.parse(String(message.data));
            } catch {
                return;
            }

            if (typeof packet.s === 'number') {
                sequence = packet.s;
            }

            if (packet.op === 10) {
                const interval = (packet.d as { heartbeat_interval?: number })?.heartbeat_interval;

                heartbeat = setInterval(() => {
                    if (!acked) {
                        socket.close(4000);

                        return;
                    }

                    acked = false;

                    send({ op: 1, d: sequence });
                }, interval ?? DISCORD_HEARTBEAT);

                send({
                    op: 2,
                    d: {
                        token,
                        intents: DISCORD_INTENTS,
                        properties: { os: process.platform, browser: APP_NAME, device: APP_NAME },
                    },
                });
            } else if (packet.op === 11) {
                acked = true;
            } else if (packet.op === 1) {
                send({ op: 1, d: sequence });
            } else if (packet.op === 7 || packet.op === 9) {
                socket.close(4000);
            } else if (packet.op === 0 && packet.t === 'READY') {
                onReady(String((packet.d as { user?: { id?: string } })?.user?.id ?? ''));
            } else if (packet.op === 0 && packet.t === 'MESSAGE_CREATE') {
                onMessage(packet.d);
            }
        });

        socket.addEventListener('close', (closed) => {
            clearInterval(heartbeat);
            signal.removeEventListener('abort', stop);

            resolve({ code: closed.code, reason: closed.reason });
        });
    });
}

function discordCloseReason(code: number, reason: string): string {
    if (code === 4004) {
        return 'Discord refused the bot token.';
    }

    if (code === 4014) {
        return 'Discord refused an intent this bot has not been granted.';
    }

    return reason === '' ? `Discord closed the connection (${code}).` : reason;
}

export async function listenDiscord(
    fastify: FastifyInstance,
    plugin: TeamPlugin,
    signal: AbortSignal,
    log: FastifyBaseLogger,
): Promise<void> {
    const token = settingsOf(plugin).secrets['token'] ?? '';

    let self = '';

    while (!signal.aborted) {
        const closed = await discordSession(
            token,
            signal,
            (id) => {
                self = id;

                report(plugin, true);
            },
            (message) => {
                const event = discordInbound(message, self);

                if (!event) {
                    return;
                }

                const channel = event.ids['channel_id'] ?? '';

                void receiveInbound(
                    fastify,
                    log,
                    plugin,
                    event,
                    (text) => discordSend(token, channel, text, event.ids['message_id'] ?? ''),
                    () => discordCall(token, 'POST', `/channels/${channel}/typing`),
                ).catch((error: unknown) =>
                    log.error({ pluginId: plugin.id, err: error }, 'discord plugin reply crashed'),
                );
            },
        );

        if (signal.aborted) {
            return;
        }

        const fatal = DISCORD_FATAL_CLOSE.includes(closed.code);

        report(plugin, false, fatal ? discordCloseReason(closed.code, closed.reason) : '');

        log.warn({ pluginId: plugin.id, code: closed.code }, 'discord gateway closed');

        await sleep(fatal ? BACKOFF_REJECTED : BACKOFF_ERROR, signal);
    }
}
