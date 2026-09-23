import { APP_NAME, DISCORD_API, DISCORD_TEXT_MAX, PLUGIN_READ_MAX } from '../../constant.js';

import {
    argText,
    callJson,
    failed,
    type InboundEvent,
    type PluginOutcome,
    type PluginSettings,
} from './plugin.common.js';

export function discordCall(
    token: string,
    method: string,
    path: string,
    body?: unknown,
): Promise<PluginOutcome> {
    return callJson(
        `${DISCORD_API}${path}`,
        {
            method,
            headers: {
                authorization: `Bot ${token}`,
                'user-agent': `DiscordBot (${APP_NAME}, 1.0)`,
                ...(body !== undefined && { 'content-type': 'application/json' }),
            },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        },
        (answer) => (answer as { message?: string } | undefined)?.message ?? '',
    );
}

export function discordChunks(text: string): string[] {
    const chunks: string[] = [];

    for (let rest = text.trim(); rest !== ''; ) {
        if (rest.length <= DISCORD_TEXT_MAX) {
            chunks.push(rest);

            break;
        }

        const cut = rest.lastIndexOf('\n', DISCORD_TEXT_MAX);
        const at = cut > DISCORD_TEXT_MAX / 2 ? cut : DISCORD_TEXT_MAX;

        chunks.push(rest.slice(0, at));
        rest = rest.slice(at).trim();
    }

    return chunks;
}

export async function discordSend(
    token: string,
    channel: string,
    content: string,
    replyTo = '',
): Promise<PluginOutcome> {
    let first: PluginOutcome = failed('nothing to send');

    for (const [index, chunk] of discordChunks(content).entries()) {
        const posted = await discordCall(token, 'POST', `/channels/${channel}/messages`, {
            content: chunk,
            allowed_mentions: { parse: ['users'], replied_user: true },
            ...(index === 0 &&
                replyTo !== '' && {
                    message_reference: { message_id: replyTo, fail_if_not_exists: false },
                }),
        });

        if (index === 0) {
            first = posted;
        }

        if (!posted.ok) {
            return posted;
        }
    }

    const message = first.data as { id?: string; channel_id?: string } | undefined;

    return { ...first, data: { message_id: message?.id, channel_id: message?.channel_id } };
}

function readLimit(args: Record<string, unknown>, fallback: number): number {
    const limit = Number(args['limit']);

    return Number.isInteger(limit) && limit > 0 ? Math.min(limit, PLUGIN_READ_MAX) : fallback;
}

export async function discordAct(
    settings: PluginSettings,
    name: string,
    args: Record<string, unknown>,
): Promise<PluginOutcome> {
    const token = settings.secrets['token'] ?? '';

    if (name === 'discord_list_channels') {
        const guilds = await discordCall(token, 'GET', '/users/@me/guilds');

        if (!guilds.ok) {
            return guilds;
        }

        const servers = [];

        for (const guild of ((guilds.data ?? []) as { id: string; name: string }[]).slice(0, 10)) {
            const channels = await discordCall(token, 'GET', `/guilds/${guild.id}/channels`);

            servers.push({
                server: guild.name,
                server_id: guild.id,
                channels: channels.ok
                    ? ((channels.data ?? []) as { id: string; name: string; type: number }[])
                          .filter((channel) => [0, 5, 15].includes(channel.type))
                          .map((channel) => ({ id: channel.id, name: `#${channel.name}` }))
                    : [],
            });
        }

        return { ...guilds, data: { servers } };
    }

    const channel = argText(args, 'channel_id') || (settings.config['default_channel'] ?? '');

    if (!/^\d{5,25}$/.test(channel)) {
        return failed(
            'channel_id is required: find it with discord_list_channels, or set a default channel',
        );
    }

    const messageId = argText(args, 'message_id');
    const message = `/channels/${channel}/messages/${messageId}`;

    if (
        ['discord_edit_message', 'discord_delete_message', 'discord_react'].includes(name) &&
        !/^\d{5,25}$/.test(messageId)
    ) {
        return failed('message_id is required');
    }

    if (name === 'discord_send_message') {
        const content = argText(args, 'content');

        return content === ''
            ? failed('content is required')
            : discordSend(token, channel, content, argText(args, 'reply_to'));
    }

    if (name === 'discord_edit_message') {
        const content = argText(args, 'content');

        if (content === '') {
            return failed('content is required');
        }

        const edited = await discordCall(token, 'PATCH', message, {
            content: content.slice(0, DISCORD_TEXT_MAX),
        });

        return edited.ok ? { ...edited, data: { message_id: messageId } } : edited;
    }

    if (name === 'discord_delete_message') {
        return discordCall(token, 'DELETE', message);
    }

    if (name === 'discord_react') {
        const emoji = argText(args, 'emoji');

        return emoji === ''
            ? failed('emoji is required')
            : discordCall(token, 'PUT', `${message}/reactions/${encodeURIComponent(emoji)}/@me`);
    }

    if (name === 'discord_create_thread') {
        const title = argText(args, 'name').slice(0, 100);

        if (title === '') {
            return failed('name is required');
        }

        const thread = await (messageId === ''
            ? discordCall(token, 'POST', `/channels/${channel}/threads`, { name: title, type: 11 })
            : discordCall(token, 'POST', `${message}/threads`, { name: title }));
        const created = thread.data as { id?: string; name?: string } | undefined;

        return thread.ok
            ? { ...thread, data: { thread_id: created?.id, name: created?.name } }
            : thread;
    }

    if (name === 'discord_read_messages') {
        const read = await discordCall(
            token,
            'GET',
            `/channels/${channel}/messages?limit=${readLimit(args, 20)}`,
        );

        if (!read.ok) {
            return read;
        }

        return {
            ...read,
            data: {
                messages: (
                    (read.data ?? []) as {
                        id: string;
                        content: string;
                        timestamp: string;
                        author?: { username?: string; global_name?: string; bot?: boolean };
                        message_reference?: { message_id?: string };
                    }[]
                ).map((item) => ({
                    id: item.id,
                    author: item.author?.global_name ?? item.author?.username ?? '',
                    bot: item.author?.bot === true,
                    content: item.content,
                    at: item.timestamp,
                    reply_to: item.message_reference?.message_id,
                })),
            },
        };
    }

    return failed('unknown discord action');
}

export async function discordProbe(settings: PluginSettings): Promise<PluginOutcome> {
    const me = await discordCall(settings.secrets['token'] ?? '', 'GET', '/users/@me');

    return me.ok ? { ...me, data: (me.data as { username?: string }).username ?? 'bot' } : me;
}

interface DiscordMessage {
    id?: string;
    channel_id?: string;
    guild_id?: string;
    content?: string;
    author?: { id?: string; username?: string; global_name?: string | null; bot?: boolean };
    mentions?: { id?: string }[];
}

export function discordInbound(payload: unknown, self: string): InboundEvent | undefined {
    const message = payload as DiscordMessage | undefined;
    const author = message?.author;

    if (
        typeof message?.content !== 'string' ||
        !message.channel_id ||
        !message.id ||
        !author?.id ||
        author.bot === true ||
        self === ''
    ) {
        return undefined;
    }

    const direct = message.guild_id === undefined;
    const mentioned = (message.mentions ?? []).some((mention) => mention.id === self);
    const text = message.content.replace(new RegExp(`<@!?${self}>`, 'g'), '').trim();

    if ((!direct && !mentioned) || text === '') {
        return undefined;
    }

    return {
        kind: direct ? 'direct' : 'mention',
        thread: `dc:${message.channel_id}:${author.id}`,
        author: author.global_name || author.username || `Discord ${author.id}`,
        author_id: author.id,
        text,
        where: direct ? 'a direct message' : `channel ${message.channel_id}`,
        ids: { channel_id: message.channel_id, message_id: message.id },
    };
}
