import assert from 'node:assert/strict';

import { PLUGIN_KINDS } from '../constant.js';
import { PluginError, readPluginBody } from '../routes/plugin/plugin.body.js';
import {
    channelPost,
    readChannelPage,
    relaySource,
    sendRelay,
    shouldRelay,
} from '../routes/plugin/plugin.relay.js';

function page(): string {
    return [
        '<section class="tgme_channel_history js-message_history">',
        '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="news_chan/458" data-view="x">',
        '<a class="tgme_widget_message_photo_wrap 5109 1189_460" href="https://t.me/news_chan/458" style="width:800px;background-image:url(\'https://cdn1.telesco.pe/file/abc.jpg\')"></a>',
        '<div class="tgme_widget_message_footer"><time datetime="2026-09-24T10:00:00+00:00" class="time">10:00</time></div>',
        '</div></div>',
        '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="news_chan/459" data-view="y">',
        '<div class="tgme_widget_message_text js-message_text" dir="auto"><b>Signed Gifts.</b> Add <b>your signature</b> via the <a href="https://t.me/telegram/382" target="_blank" rel="noopener" onclick="return confirm(\'Open this link?\');">gift marketplace</a>.<br/><br/>Fees &amp; limits &lt;1%&gt; •&nbsp;<i class="emoji" style="background-image:url(\'//x.png\')"><b>🎁</b></i> <a href="https://nura.example/x?a=1&amp;b=2">https://nura.example/x?a=1&amp;b=2</a></div>',
        '<div class="tgme_widget_message_footer"><time datetime="2026-09-24T11:30:00+00:00" class="time">11:30</time></div>',
        '</div></div>',
        '</section>',
    ].join('\n');
}

async function sending() {
    const realFetch = globalThis.fetch;
    const calls: { method: string; body: Record<string, unknown> }[] = [];
    let refuse = '';

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const method = String(input).split('/').at(-1) ?? '';
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

        calls.push({ method, body });

        return method === refuse
            ? new Response(JSON.stringify({ ok: false, description: 'Bad Request: wrong file' }), {
                  status: 400,
                  headers: { 'content-type': 'application/json' },
              })
            : new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
              });
    }) as typeof fetch;

    try {
        const token = '123456:ABCDEFGHIJKLMNOPQRSTUV';

        assert.ok((await sendRelay(token, '-100200', 'Hello **NuraChain**')).ok);
        assert.deepEqual(
            calls.map((call) => call.method),
            ['sendMessage'],
        );
        assert.equal(calls[0]?.body['parse_mode'], 'HTML');

        calls.length = 0;
        assert.ok(
            (await sendRelay(token, '-100200', 'Short caption', { kind: 'photo', file: 'F1' })).ok,
        );
        assert.deepEqual(
            calls.map((call) => [call.method, call.body['photo'], typeof call.body['caption']]),
            [['sendPhoto', 'F1', 'string']],
            'a short rewrite rides on the photo as its caption',
        );

        calls.length = 0;
        assert.ok(
            (await sendRelay(token, '-100200', 'x'.repeat(1500), { kind: 'video', file: 'V1' })).ok,
        );
        assert.deepEqual(
            calls.map((call) => [call.method, call.body['caption'] === undefined]),
            [
                ['sendVideo', true],
                ['sendMessage', true],
            ],
            'a long rewrite goes out after the media, as its own message',
        );

        calls.length = 0;
        refuse = 'sendPhoto';
        assert.ok(
            (await sendRelay(token, '-100200', 'Short caption', { kind: 'photo', file: 'bad' })).ok,
            'a refused photo still delivers the text',
        );
        assert.equal(calls.at(-1)?.method, 'sendMessage');
    } finally {
        globalThis.fetch = realFetch;
    }
}

async function main() {
    const posts = readChannelPage(page());

    assert.deepEqual(
        posts.map((post) => [post.id, post.date, post.media?.kind ?? '']),
        [
            [458, Date.parse('2026-09-24T10:00:00Z'), 'photo'],
            [459, Date.parse('2026-09-24T11:30:00Z'), ''],
        ],
    );
    assert.equal(posts[0]?.text, '', 'a photo without words has no text');
    assert.equal(posts[0]?.media?.file, 'https://cdn1.telesco.pe/file/abc.jpg');
    assert.equal(
        posts[1]?.text,
        'Signed Gifts. Add your signature via the gift marketplace (https://t.me/telegram/382).\n\nFees & limits <1%> • 🎁 https://nura.example/x?a=1&b=2',
    );

    assert.deepEqual(
        channelPost(
            {
                update_id: 1,
                channel_post: {
                    message_id: 77,
                    date: 1_790_000_000,
                    chat: { id: -100555 },
                    caption: 'New listing',
                    photo: [{ file_id: 'small' }, { file_id: 'large' }],
                },
            },
            -100555,
        ),
        {
            id: 77,
            date: 1_790_000_000_000,
            text: 'New listing',
            media: { kind: 'photo', file: 'large' },
        },
    );
    assert.equal(
        channelPost(
            {
                channel_post: {
                    message_id: 78,
                    chat: { id: -100555 },
                    animation: { file_id: 'A' },
                    document: { file_id: 'D' },
                },
            },
            -100555,
        )?.media?.kind,
        'animation',
    );
    assert.equal(
        channelPost({ channel_post: { message_id: 9, chat: { id: -1 }, text: 'x' } }, -100555),
        undefined,
        'posts from another chat are ignored',
    );
    assert.equal(channelPost({ message: { text: 'hi' } }, -100555), undefined);

    assert.deepEqual(relaySource('@news_chan'), { chat: '@news_chan', username: 'news_chan' });
    assert.deepEqual(relaySource('https://t.me/s/news_chan/'), {
        chat: '@news_chan',
        username: 'news_chan',
    });
    assert.deepEqual(relaySource('t.me/news_chan'), { chat: '@news_chan', username: 'news_chan' });
    assert.deepEqual(relaySource('-1001234567890'), { chat: '-1001234567890', username: '' });
    assert.equal(relaySource('not a channel'), null);

    const since = Date.parse('2026-09-24T11:00:00Z');

    assert.equal(shouldRelay(posts[0] as never, 0, since), false, 'the first run skips old posts');
    assert.equal(shouldRelay(posts[1] as never, 0, since), true, 'the first run takes new posts');
    assert.equal(shouldRelay(posts[0] as never, 400, since), true, 'later runs follow the cursor');
    assert.equal(
        shouldRelay(posts[1] as never, 459, since),
        false,
        'a relayed post is not sent again',
    );

    const kind = PLUGIN_KINDS.find((item) => item.key === 'relay');

    assert.ok(kind !== undefined && kind.inbound === 'listen');

    const body = (fields: Record<string, string>) => ({
        name: 'News to community',
        fields: {
            token: '123456:ABCDEFGHIJKLMNOPQRSTUV',
            source: '@news_chan',
            target: '-1001234567890',
            brief: 'Relate it to NuraChain.',
            ...fields,
        },
    });
    const code = (fields: Record<string, string>) => {
        try {
            readPluginBody(body(fields), kind, null);

            return 'ok';
        } catch (error) {
            return error instanceof PluginError ? error.code : String(error);
        }
    };

    assert.equal(code({}), 'ok');
    assert.equal(code({ token: 'nope' }), 'PLUGIN_TOKEN_INVALID');
    assert.equal(code({ source: 'a b' }), 'PLUGIN_SOURCE_INVALID');
    assert.equal(code({ target: 'group' }), 'PLUGIN_TARGET_INVALID');
    assert.equal(code({ target: '@news_chan' }), 'PLUGIN_TARGET_INVALID');
    assert.equal(code({ brief: '' }), 'PLUGIN_FIELD_REQUIRED');

    await sending();

    console.log('plugin.relay: ok');
}

main();
