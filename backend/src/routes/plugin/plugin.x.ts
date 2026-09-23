import { createHmac, randomBytes } from 'node:crypto';
import {
    X_API,
    X_LIGHT_RANGES,
    X_POST_FIELDS,
    X_TEXT_MAX,
    X_URL_WEIGHT,
    X_USER_IDS,
} from '../../constant.js';

import {
    argText,
    callJson,
    failed,
    type PluginOutcome,
    type PluginSettings,
    readLimit,
} from './plugin.common.js';

interface XKeys {
    api_key: string;
    api_secret: string;
    access_token: string;
    access_secret: string;
}

function percent(value: string): string {
    return encodeURIComponent(value).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

export function oauthHeader(
    method: string,
    url: string,
    params: Record<string, string>,
    keys: XKeys,
    nonce: string,
    timestamp: string,
): string {
    const target = new URL(url);
    const oauth: Record<string, string> = {
        oauth_consumer_key: keys.api_key,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_token: keys.access_token,
        oauth_version: '1.0',
    };
    const pairs = [
        ...target.searchParams.entries(),
        ...Object.entries(params),
        ...Object.entries(oauth),
    ]
        .map(([key, value]) => [percent(key), percent(value)] as const)
        .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
    const base = [
        method.toUpperCase(),
        percent(`${target.origin}${target.pathname}`),
        percent(pairs),
    ].join('&');
    const signature = createHmac(
        'sha1',
        `${percent(keys.api_secret)}&${percent(keys.access_secret)}`,
    )
        .update(base)
        .digest('base64');

    return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature })
        .map(([key, value]) => `${percent(key)}="${percent(value)}"`)
        .join(', ')}`;
}

export function xLength(text: string): number {
    let length = 0;

    const plain = text.normalize('NFC').replace(/https?:\/\/\S+/gi, () => {
        length += X_URL_WEIGHT;

        return '';
    });

    for (const char of plain) {
        const code = char.codePointAt(0) ?? 0;

        length += X_LIGHT_RANGES.some(([low, high]) => code >= low && code <= high) ? 1 : 2;
    }

    return length;
}

function keysOf(settings: PluginSettings): XKeys {
    return {
        api_key: settings.secrets['api_key'] ?? '',
        api_secret: settings.secrets['api_secret'] ?? '',
        access_token: settings.secrets['access_token'] ?? '',
        access_secret: settings.secrets['access_secret'] ?? '',
    };
}

function xCall(
    keys: XKeys,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    query: Record<string, string> = {},
): Promise<PluginOutcome> {
    const search = new URLSearchParams(query).toString();
    const url = `${X_API}${path}${search === '' ? '' : `?${search}`}`;

    return callJson(
        url,
        {
            method,
            headers: {
                authorization: oauthHeader(
                    method,
                    url,
                    {},
                    keys,
                    randomBytes(16).toString('hex'),
                    String(Math.floor(Date.now() / 1000)),
                ),
                ...(body !== undefined && { 'content-type': 'application/json' }),
            },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        },
        (answer) => {
            const error = answer as
                | {
                      detail?: string;
                      title?: string;
                      errors?: { message?: string; detail?: string }[];
                  }
                | undefined;

            return (
                error?.detail ??
                error?.title ??
                error?.errors?.[0]?.message ??
                error?.errors?.[0]?.detail ??
                ''
            );
        },
    );
}

async function ownId(keys: XKeys): Promise<string> {
    const known = X_USER_IDS.get(keys.access_token);

    if (known !== undefined) {
        return known;
    }

    const me = await xCall(keys, 'GET', '/users/me');
    const id = String((me.data as { data?: { id?: string } } | undefined)?.data?.id ?? '');

    if (me.ok && id !== '') {
        X_USER_IDS.set(keys.access_token, id);
    }

    return id;
}

interface XPost {
    id: string;
    text: string;
    author_id?: string;
    created_at?: string;
    conversation_id?: string;
    public_metrics?: {
        like_count?: number;
        retweet_count?: number;
        reply_count?: number;
        quote_count?: number;
    };
}

export function readPosts(payload: unknown): Record<string, unknown>[] {
    const body = payload as
        | { data?: XPost | XPost[]; includes?: { users?: { id: string; username: string }[] } }
        | undefined;
    const posts =
        body?.data === undefined ? [] : Array.isArray(body.data) ? body.data : [body.data];
    const users = new Map((body?.includes?.users ?? []).map((user) => [user.id, user.username]));

    return posts.map((post) => {
        const author = users.get(post.author_id ?? '');

        return {
            id: post.id,
            author: author === undefined ? post.author_id : `@${author}`,
            text: post.text,
            at: post.created_at,
            likes: post.public_metrics?.like_count,
            reposts: post.public_metrics?.retweet_count,
            replies: post.public_metrics?.reply_count,
            url: `https://x.com/${author ?? 'i/web'}/status/${post.id}`,
        };
    });
}

export async function xAct(
    settings: PluginSettings,
    name: string,
    args: Record<string, unknown>,
): Promise<PluginOutcome> {
    const keys = keysOf(settings);
    const postId = argText(args, 'post_id');

    if (
        ['x_like', 'x_repost', 'x_delete', 'x_read_post'].includes(name) &&
        !/^\d{1,25}$/.test(postId)
    ) {
        return failed('post_id is required: the number at the end of the post link');
    }

    if (name === 'x_post') {
        const text = argText(args, 'text');
        const length = xLength(text);

        if (text === '') {
            return failed('text is required');
        }

        if (length > X_TEXT_MAX) {
            return failed(
                `the post is ${length} characters and X allows ${X_TEXT_MAX}; shorten it and try again`,
            );
        }

        const replyTo = argText(args, 'reply_to');
        const quote = argText(args, 'quote');
        const posted = await xCall(keys, 'POST', '/tweets', {
            text,
            ...(replyTo !== '' && { reply: { in_reply_to_tweet_id: replyTo } }),
            ...(quote !== '' && { quote_tweet_id: quote }),
        });
        const id = (posted.data as { data?: { id?: string } } | undefined)?.data?.id;

        return posted.ok
            ? { ...posted, data: { post_id: id, url: `https://x.com/i/web/status/${id}` } }
            : posted;
    }

    if (name === 'x_delete') {
        return xCall(keys, 'DELETE', `/tweets/${postId}`);
    }

    if (name === 'x_read_post') {
        const read = await xCall(keys, 'GET', `/tweets/${postId}`, undefined, X_POST_FIELDS);

        return read.ok ? { ...read, data: readPosts(read.data)[0] } : read;
    }

    if (name === 'x_search') {
        const query = argText(args, 'query');

        if (query === '') {
            return failed('query is required');
        }

        const found = await xCall(keys, 'GET', '/tweets/search/recent', undefined, {
            query,
            max_results: String(readLimit(args, 10, 10, 100)),
            ...X_POST_FIELDS,
        });

        return found.ok ? { ...found, data: { posts: readPosts(found.data) } } : found;
    }

    const user = await ownId(keys);

    if (user === '') {
        return failed('X refused the keys; test the plugin');
    }

    if (name === 'x_like' || name === 'x_repost') {
        const path = name === 'x_like' ? 'likes' : 'retweets';

        return args['undo'] === true
            ? xCall(keys, 'DELETE', `/users/${user}/${path}/${postId}`)
            : xCall(keys, 'POST', `/users/${user}/${path}`, { tweet_id: postId });
    }

    if (name === 'x_mentions' || name === 'x_my_posts') {
        const read = await xCall(
            keys,
            'GET',
            `/users/${user}/${name === 'x_mentions' ? 'mentions' : 'tweets'}`,
            undefined,
            { max_results: String(readLimit(args, 10, 5, 100)), ...X_POST_FIELDS },
        );

        return read.ok ? { ...read, data: { posts: readPosts(read.data) } } : read;
    }

    return failed('unknown x action');
}

export async function xProbe(settings: PluginSettings): Promise<PluginOutcome> {
    const keys = keysOf(settings);
    const me = await xCall(keys, 'GET', '/users/me');
    const user = (me.data as { data?: { id?: string; username?: string } } | undefined)?.data;

    if (!me.ok || user?.id === undefined) {
        return me.ok ? failed('X did not say which account these keys belong to') : me;
    }

    X_USER_IDS.set(keys.access_token, user.id);

    return { ...me, data: `@${user.username ?? user.id}` };
}
