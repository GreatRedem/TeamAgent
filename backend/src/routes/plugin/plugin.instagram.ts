import {
    INSTAGRAM_API,
    INSTAGRAM_CAPTION_MAX,
    INSTAGRAM_MESSAGE_MAX,
    INSTAGRAM_USER_IDS,
    PLUGIN_PUBLISH_TRIES,
    PLUGIN_PUBLISH_WAIT,
} from '../../constant.js';

import {
    argText,
    callJson,
    failed,
    type InboundEvent,
    type PluginOutcome,
    type PluginSettings,
    readLimit,
} from './plugin.common.js';

function instagramCall(
    token: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload: Record<string, unknown> = {},
): Promise<PluginOutcome> {
    const query =
        method === 'GET'
            ? `?${new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, String(value)]))}`
            : '';

    return callJson(
        `${INSTAGRAM_API}${path}${query}`,
        {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                ...(method === 'POST' && { 'content-type': 'application/json' }),
            },
            ...(method === 'POST' && { body: JSON.stringify(payload) }),
        },
        (body) => (body as { error?: { message?: string } } | undefined)?.error?.message ?? '',
    );
}

function idOf(outcome: PluginOutcome): string {
    return String((outcome.data as { id?: unknown } | undefined)?.id ?? '');
}

async function ownId(token: string): Promise<string> {
    const known = INSTAGRAM_USER_IDS.get(token);

    if (known !== undefined) {
        return known;
    }

    const me = await instagramCall(token, 'GET', '/me', { fields: 'user_id' });
    const id = me.ok ? String((me.data as { user_id?: unknown }).user_id ?? '') : '';

    if (id !== '') {
        INSTAGRAM_USER_IDS.set(token, id);
    }

    return id;
}

async function whenReady(token: string, container: string): Promise<PluginOutcome> {
    for (let attempt = 0; attempt < PLUGIN_PUBLISH_TRIES; attempt += 1) {
        const state = await instagramCall(token, 'GET', `/${container}`, {
            fields: 'status_code',
        });
        const code = (state.data as { status_code?: string } | undefined)?.status_code ?? '';

        if (!state.ok || code === 'FINISHED' || code === 'PUBLISHED') {
            return state;
        }

        if (code === 'ERROR' || code === 'EXPIRED') {
            return failed(`Instagram could not process the media (${code.toLowerCase()})`);
        }

        await new Promise((resolve) => setTimeout(resolve, PLUGIN_PUBLISH_WAIT).unref());
    }

    return failed('Instagram is still processing the media; try publishing again in a minute');
}

async function publish(token: string, args: Record<string, unknown>): Promise<PluginOutcome> {
    const caption = argText(args, 'caption').slice(0, INSTAGRAM_CAPTION_MAX);
    const image = argText(args, 'image_url');
    const video = argText(args, 'video_url');
    const images = Array.isArray(args['image_urls'])
        ? args['image_urls'].filter((url): url is string => typeof url === 'string')
        : [];
    const media = [image, video, ...images].filter((url) => url !== '');

    if (media.length === 0) {
        return failed('image_url, video_url or image_urls is required');
    }

    if (media.some((url) => !/^https:\/\//i.test(url))) {
        return failed('media must be at public https addresses');
    }

    if (images.length > 0 && (images.length < 2 || images.length > 10)) {
        return failed('a carousel takes 2 to 10 pictures');
    }

    const user = await ownId(token);

    if (user === '') {
        return failed('the access token was refused; test the plugin');
    }

    let container: PluginOutcome;

    if (images.length > 0) {
        const children = await Promise.all(
            images.map((url) =>
                instagramCall(token, 'POST', `/${user}/media`, {
                    image_url: url,
                    is_carousel_item: true,
                }),
            ),
        );
        const broken = children.find((child) => !child.ok);

        if (broken) {
            return broken;
        }

        container = await instagramCall(token, 'POST', `/${user}/media`, {
            media_type: 'CAROUSEL',
            children: children.map(idOf).join(','),
            caption,
        });
    } else {
        container = await instagramCall(
            token,
            'POST',
            `/${user}/media`,
            video !== ''
                ? { media_type: 'REELS', video_url: video, caption }
                : { image_url: image, caption },
        );
    }

    if (!container.ok) {
        return container;
    }

    const ready = await whenReady(token, idOf(container));

    if (!ready.ok) {
        return ready;
    }

    const published = await instagramCall(token, 'POST', `/${user}/media_publish`, {
        creation_id: idOf(container),
    });

    if (!published.ok) {
        return published;
    }

    const link = await instagramCall(token, 'GET', `/${idOf(published)}`, {
        fields: 'permalink',
    });

    return {
        ...published,
        data: {
            media_id: idOf(published),
            permalink: (link.data as { permalink?: string } | undefined)?.permalink,
        },
    };
}

export function instagramReply(token: string, commentId: string, message: string) {
    return instagramCall(token, 'POST', `/${commentId}/replies`, {
        message: message.slice(0, INSTAGRAM_CAPTION_MAX),
    });
}

export function instagramMessage(token: string, from: string, to: string, text: string) {
    return instagramCall(token, 'POST', `/${from}/messages`, {
        recipient: { id: to },
        message: { text: text.slice(0, INSTAGRAM_MESSAGE_MAX) },
    });
}

export async function instagramAct(
    settings: PluginSettings,
    name: string,
    args: Record<string, unknown>,
): Promise<PluginOutcome> {
    const token = settings.secrets['token'] ?? '';

    if (name === 'instagram_publish') {
        return publish(token, args);
    }

    if (name === 'instagram_profile') {
        return instagramCall(token, 'GET', '/me', {
            fields: 'user_id,username,name,account_type,followers_count,follows_count,media_count',
        });
    }

    if (name === 'instagram_list_media') {
        const listed = await instagramCall(token, 'GET', '/me/media', {
            fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
            limit: readLimit(args, 10),
        });

        return listed.ok ? { ...listed, data: (listed.data as { data?: unknown }).data } : listed;
    }

    if (name === 'instagram_list_comments') {
        const mediaId = argText(args, 'media_id');

        if (mediaId === '') {
            return failed('media_id is required; get it from instagram_list_media');
        }

        const listed = await instagramCall(token, 'GET', `/${mediaId}/comments`, {
            fields: 'id,text,username,timestamp,like_count',
            limit: readLimit(args, 20),
        });

        return listed.ok ? { ...listed, data: (listed.data as { data?: unknown }).data } : listed;
    }

    if (name === 'instagram_reply_comment') {
        const commentId = argText(args, 'comment_id');
        const message = argText(args, 'message');

        return commentId === '' || message === ''
            ? failed('comment_id and message are required')
            : instagramReply(token, commentId, message);
    }

    if (name === 'instagram_comment') {
        const mediaId = argText(args, 'media_id');
        const message = argText(args, 'message');

        return mediaId === '' || message === ''
            ? failed('media_id and message are required')
            : instagramCall(token, 'POST', `/${mediaId}/comments`, {
                  message: message.slice(0, INSTAGRAM_CAPTION_MAX),
              });
    }

    if (name === 'instagram_hide_comment') {
        const commentId = argText(args, 'comment_id');

        return commentId === ''
            ? failed('comment_id is required')
            : instagramCall(token, 'POST', `/${commentId}`, { hide: args['hide'] !== false });
    }

    if (name === 'instagram_send_message') {
        const recipient = argText(args, 'recipient_id');
        const text = argText(args, 'text');

        if (recipient === '' || text === '') {
            return failed('recipient_id and text are required');
        }

        const user = await ownId(token);

        return user === ''
            ? failed('the access token was refused; test the plugin')
            : instagramMessage(token, user, recipient, text);
    }

    return failed('unknown instagram action');
}

export async function instagramProbe(settings: PluginSettings): Promise<PluginOutcome> {
    const me = await instagramCall(settings.secrets['token'] ?? '', 'GET', '/me', {
        fields: 'user_id,username',
    });

    return me.ok ? { ...me, data: `@${(me.data as { username?: string }).username ?? ''}` } : me;
}

interface InstagramInbound {
    account: string;
    event: InboundEvent;
}

interface InstagramEntry {
    id?: unknown;
    changes?: {
        field?: string;
        value?: {
            id?: unknown;
            comment_id?: unknown;
            text?: unknown;
            from?: { id?: unknown; username?: unknown };
            media?: { id?: unknown };
        };
    }[];
    messaging?: {
        sender?: { id?: unknown };
        message?: { text?: unknown; is_echo?: boolean };
    }[];
}

export function instagramInbound(payload: unknown): InstagramInbound[] {
    const entries = (payload as { entry?: unknown } | undefined)?.entry;

    if (!Array.isArray(entries)) {
        return [];
    }

    const found: InstagramInbound[] = [];

    for (const entry of entries as InstagramEntry[]) {
        const account = String(entry.id ?? '');

        for (const change of entry.changes ?? []) {
            const value = change.value;
            const commentId = String(value?.id ?? value?.comment_id ?? '');
            const authorId = String(value?.from?.id ?? '');
            const text = typeof value?.text === 'string' ? value.text.trim() : '';
            const media = String(value?.media?.id ?? '');

            if (
                change.field !== 'comments' ||
                commentId === '' ||
                text === '' ||
                authorId === account
            ) {
                continue;
            }

            found.push({
                account,
                event: {
                    kind: 'comment',
                    thread: `ig:${media}:${authorId}`,
                    author:
                        typeof value?.from?.username === 'string'
                            ? `@${value.from.username}`
                            : 'someone',
                    author_id: authorId,
                    text,
                    where: `a comment on post ${media}`,
                    ids: { comment_id: commentId, media_id: media },
                },
            });
        }

        for (const item of entry.messaging ?? []) {
            const sender = String(item.sender?.id ?? '');
            const text = typeof item.message?.text === 'string' ? item.message.text.trim() : '';

            if (
                sender === '' ||
                sender === account ||
                item.message?.is_echo === true ||
                text === ''
            ) {
                continue;
            }

            found.push({
                account,
                event: {
                    kind: 'direct',
                    thread: `ig:dm:${sender}`,
                    author: `Instagram user ${sender}`,
                    author_id: sender,
                    text,
                    where: 'a direct message',
                    ids: { sender_id: sender },
                },
            });
        }
    }

    return found;
}
