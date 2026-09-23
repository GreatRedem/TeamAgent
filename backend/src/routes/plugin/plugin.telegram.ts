import { TELEGRAM_TEXT_MAX } from '../../constant.js';

import { telegramMethod, telegramRich } from '../telegram/telegram.client.js';
import {
    argText,
    failed,
    type InboundEvent,
    type PluginOutcome,
    type PluginSettings,
} from './plugin.common.js';

function sent(outcome: PluginOutcome): PluginOutcome {
    if (!outcome.ok) {
        return outcome;
    }

    const message = outcome.data as
        | { message_id?: number; chat?: { id?: number; username?: string }; date?: number }
        | undefined;

    return {
        ...outcome,
        data: {
            message_id: message?.message_id,
            chat_id: message?.chat?.id,
            chat: message?.chat?.username ? `@${message.chat.username}` : undefined,
        },
    };
}

export async function telegramAct(
    settings: PluginSettings,
    name: string,
    args: Record<string, unknown>,
): Promise<PluginOutcome> {
    const token = settings.secrets['token'] ?? '';
    const chat = argText(args, 'chat') || (settings.config['default_chat'] ?? '');

    if (chat === '') {
        return failed('chat is required: pass chat, or set a default chat on the plugin');
    }

    const messageId = Number(args['message_id']);
    const needsMessage = [
        'telegram_edit_message',
        'telegram_delete_message',
        'telegram_pin_message',
        'telegram_react',
    ].includes(name);

    if (needsMessage && (!Number.isInteger(messageId) || messageId <= 0)) {
        return failed('message_id is required');
    }

    if (name === 'telegram_send_message') {
        const text = argText(args, 'text');

        if (text === '') {
            return failed('text is required');
        }

        const replyTo = Number(args['reply_to']);

        return sent(
            await telegramRich(
                token,
                'sendMessage',
                {
                    chat_id: chat,
                    disable_notification: args['silent'] === true,
                    ...(Number.isInteger(replyTo) &&
                        replyTo > 0 && {
                            reply_parameters: {
                                message_id: replyTo,
                                allow_sending_without_reply: true,
                            },
                        }),
                },
                'text',
                text.slice(0, TELEGRAM_TEXT_MAX),
            ),
        );
    }

    if (name === 'telegram_send_photo') {
        const photo = argText(args, 'photo_url');

        if (!/^https:\/\//i.test(photo)) {
            return failed('photo_url must be a public https address');
        }

        const caption = argText(args, 'caption');

        return sent(
            caption === ''
                ? await telegramMethod(token, 'sendPhoto', { chat_id: chat, photo })
                : await telegramRich(
                      token,
                      'sendPhoto',
                      { chat_id: chat, photo },
                      'caption',
                      caption.slice(0, 1024),
                  ),
        );
    }

    if (name === 'telegram_send_poll') {
        const question = argText(args, 'question');
        const options = Array.isArray(args['options'])
            ? args['options'].filter(
                  (option): option is string => typeof option === 'string' && option.trim() !== '',
              )
            : [];

        if (question === '' || options.length < 2 || options.length > 10) {
            return failed('a question and 2 to 10 options are required');
        }

        return sent(
            await telegramMethod(token, 'sendPoll', {
                chat_id: chat,
                question: question.slice(0, 300),
                options: options.map((option) => ({ text: option.trim().slice(0, 100) })),
                is_anonymous: args['anonymous'] !== false,
            }),
        );
    }

    if (name === 'telegram_edit_message') {
        const text = argText(args, 'text');

        if (text === '') {
            return failed('text is required');
        }

        return sent(
            await telegramRich(
                token,
                'editMessageText',
                { chat_id: chat, message_id: messageId },
                'text',
                text.slice(0, TELEGRAM_TEXT_MAX),
            ),
        );
    }

    if (name === 'telegram_delete_message') {
        return telegramMethod(token, 'deleteMessage', { chat_id: chat, message_id: messageId });
    }

    if (name === 'telegram_pin_message') {
        return telegramMethod(token, 'pinChatMessage', {
            chat_id: chat,
            message_id: messageId,
            disable_notification: true,
        });
    }

    if (name === 'telegram_react') {
        const emoji = argText(args, 'emoji');

        return emoji === ''
            ? failed('emoji is required')
            : telegramMethod(token, 'setMessageReaction', {
                  chat_id: chat,
                  message_id: messageId,
                  reaction: [{ type: 'emoji', emoji }],
              });
    }

    if (name === 'telegram_chat_info') {
        const [info, members] = await Promise.all([
            telegramMethod(token, 'getChat', { chat_id: chat }),
            telegramMethod(token, 'getChatMemberCount', { chat_id: chat }),
        ]);

        if (!info.ok) {
            return info;
        }

        const found = info.data as Record<string, unknown>;

        return {
            ...info,
            data: {
                id: found['id'],
                type: found['type'],
                title: found['title'],
                username: found['username'],
                description: found['description'],
                members: members.ok ? members.data : undefined,
            },
        };
    }

    return failed('unknown telegram action');
}

export async function telegramProbe(settings: PluginSettings): Promise<PluginOutcome> {
    const me = await telegramMethod(settings.secrets['token'] ?? '', 'getMe', {});

    if (!me.ok) {
        return me;
    }

    const bot = me.data as { username?: string };

    return { ...me, data: `@${bot.username ?? 'bot'}` };
}

interface TelegramUpdate {
    message?: {
        message_id?: number;
        text?: string;
        chat?: { id?: number; type?: string; title?: string };
        from?: {
            id?: number;
            is_bot?: boolean;
            username?: string;
            first_name?: string;
            last_name?: string;
        };
        reply_to_message?: { from?: { id?: number } };
    };
}

export function telegramInbound(
    update: unknown,
    bot: { id: number; username: string },
): InboundEvent | undefined {
    const message = (update as TelegramUpdate | undefined)?.message;
    const from = message?.from;
    const chat = message?.chat;

    if (
        typeof message?.text !== 'string' ||
        from?.id === undefined ||
        from.is_bot === true ||
        chat?.id === undefined
    ) {
        return undefined;
    }

    const direct = chat.type === 'private';
    const handle = new RegExp(`@${bot.username.replace(/[^\w]/g, '')}\\b`, 'gi');
    const addressed =
        direct || handle.test(message.text) || message.reply_to_message?.from?.id === bot.id;
    const text = message.text.replace(handle, '').trim();

    if (!addressed || text === '') {
        return undefined;
    }

    const name = [from.first_name, from.last_name].filter(Boolean).join(' ');

    return {
        kind: direct ? 'direct' : 'mention',
        thread: `tg:${chat.id}:${from.id}`,
        author: name !== '' ? name : from.username ? `@${from.username}` : `Telegram ${from.id}`,
        author_id: String(from.id),
        text,
        where: direct ? 'a private chat' : `the group ${chat.title ?? chat.id}`,
        ids: { chat_id: String(chat.id), message_id: String(message.message_id ?? '') },
    };
}
