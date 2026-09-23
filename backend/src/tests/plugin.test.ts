import assert from 'node:assert/strict';

import { PLUGIN_EVENTS, PLUGIN_KINDS } from '../constant.js';
import { toolGuidance } from '../routes/agent/agent.reply.js';
import { pageLinks } from '../routes/mcp/mcp.web.js';
import { PluginError, readPluginBody } from '../routes/plugin/plugin.body.js';
import { blockedHost } from '../routes/plugin/plugin.browser.js';
import { postSigned } from '../routes/plugin/plugin.common.js';
import { discordChunks, discordInbound } from '../routes/plugin/plugin.discord.js';
import { instagramInbound } from '../routes/plugin/plugin.instagram.js';
import { telegramInbound } from '../routes/plugin/plugin.telegram.js';
import { oauthHeader, readPosts, xLength } from '../routes/plugin/plugin.x.js';

function kind(key: string) {
    const found = PLUGIN_KINDS.find((candidate) => candidate.key === key);

    assert.ok(found);

    return found;
}

function code(run: () => unknown): string {
    try {
        run();
    } catch (cause) {
        return cause instanceof PluginError ? cause.code : 'other';
    }

    return 'none';
}

async function main() {
    const token = '123456789:AAbbccddeeffgghhiijjkkllmmnnooppqq';
    const telegram = kind('telegram');

    const created = readPluginBody(
        { name: ' News ', fields: { token, default_chat: '@news' }, agents: [3, '3', 4, -1] },
        telegram,
        null,
    );

    assert.equal(created.name, 'News');
    assert.deepEqual(created.secrets, { token });
    assert.deepEqual(created.config, { default_chat: '@news' });
    assert.deepEqual(created.agents, [3, 4]);
    assert.deepEqual(created.hook_events, PLUGIN_EVENTS);
    assert.equal(created.enabled, true);

    const kept = readPluginBody(
        {
            name: 'News',
            fields: { token: '', default_chat: '' },
            hook_events: ['agent.action', 'x'],
        },
        telegram,
        { secrets: { token }, config: { default_chat: '@news' } },
    );

    assert.deepEqual(kept.secrets, { token });
    assert.deepEqual(kept.config, {});
    assert.deepEqual(kept.hook_events, ['agent.action']);

    assert.equal(
        code(() => readPluginBody({ name: '' }, telegram, null)),
        'PLUGIN_NAME_REQUIRED',
    );
    assert.equal(
        code(() => readPluginBody({ name: 'a' }, telegram, null)),
        'PLUGIN_FIELD_REQUIRED',
    );
    assert.equal(
        code(() => readPluginBody({ name: 'a', fields: { token: 'nope' } }, telegram, null)),
        'PLUGIN_TOKEN_INVALID',
    );
    assert.equal(
        code(() =>
            readPluginBody({ name: 'a', fields: { token }, hook_url: 'ftp://x' }, telegram, null),
        ),
        'PLUGIN_HOOK_URL_INVALID',
    );
    assert.equal(
        code(() =>
            readPluginBody({ name: 'a', fields: { url: 'not a url' } }, kind('webhook'), null),
        ),
        'PLUGIN_URL_INVALID',
    );
    assert.equal(
        code(() =>
            readPluginBody(
                { name: 'a', fields: { token: 'x', default_channel: '#general' } },
                kind('discord'),
                null,
            ),
        ),
        'PLUGIN_CHANNEL_INVALID',
    );

    const browser = readPluginBody(
        { name: 'Web', fields: {}, clear: ['tavily_key'] },
        kind('browser'),
        { secrets: { tavily_key: 'tvly-1' }, config: { blocked_domains: 'a.com' } },
    );

    assert.deepEqual(browser.secrets, {});
    assert.deepEqual(browser.config, { blocked_domains: 'a.com' });

    const bot = { id: 99, username: 'nura_bot' };
    const from = { id: 7, first_name: 'Alex', username: 'alex' };

    assert.deepEqual(
        telegramInbound(
            { message: { message_id: 5, text: 'hi', chat: { id: 7, type: 'private' }, from } },
            bot,
        ),
        {
            kind: 'direct',
            thread: 'tg:7:7',
            author: 'Alex',
            author_id: '7',
            text: 'hi',
            where: 'a private chat',
            ids: { chat_id: '7', message_id: '5' },
        },
    );

    const group = { id: -100, type: 'supergroup', title: 'Team' };

    assert.equal(
        telegramInbound({ message: { message_id: 6, text: 'lunch?', chat: group, from } }, bot),
        undefined,
    );
    assert.equal(
        telegramInbound(
            { message: { message_id: 6, text: '@Nura_Bot what time is it', chat: group, from } },
            bot,
        )?.text,
        'what time is it',
    );
    assert.equal(
        telegramInbound(
            {
                message: {
                    message_id: 8,
                    text: 'thanks',
                    chat: group,
                    from,
                    reply_to_message: { from: { id: 99 } },
                },
            },
            bot,
        )?.kind,
        'mention',
    );
    assert.equal(
        telegramInbound(
            {
                message: {
                    message_id: 9,
                    text: 'hi',
                    chat: { id: 7, type: 'private' },
                    from: { ...from, is_bot: true },
                },
            },
            bot,
        ),
        undefined,
    );

    const author = { id: '42', username: 'sam', global_name: 'Sam' };

    assert.equal(
        discordInbound({ id: '1', channel_id: '2', content: 'hey', author }, '500')?.kind,
        'direct',
    );
    assert.equal(
        discordInbound({ id: '1', channel_id: '2', guild_id: '3', content: 'hey', author }, '500'),
        undefined,
    );
    assert.equal(
        discordInbound(
            {
                id: '1',
                channel_id: '2',
                guild_id: '3',
                content: '<@500> help me',
                author,
                mentions: [{ id: '500' }],
            },
            '500',
        )?.text,
        'help me',
    );
    assert.equal(
        discordInbound(
            { id: '1', channel_id: '2', content: 'hey', author: { ...author, bot: true } },
            '500',
        ),
        undefined,
    );

    const received = instagramInbound({
        object: 'instagram',
        entry: [
            {
                id: '100',
                changes: [
                    {
                        field: 'comments',
                        value: {
                            id: 'c1',
                            text: 'Price?',
                            from: { id: '7', username: 'amy' },
                            media: { id: 'm1' },
                        },
                    },
                    {
                        field: 'comments',
                        value: {
                            id: 'c2',
                            text: 'Thanks!',
                            from: { id: '100' },
                            media: { id: 'm1' },
                        },
                    },
                ],
                messaging: [
                    { sender: { id: '8' }, message: { text: 'Open today?' } },
                    { sender: { id: '100' }, message: { text: 'echo', is_echo: true } },
                ],
            },
        ],
    });

    assert.deepEqual(
        received.map((item) => [item.account, item.event.kind, item.event.author, item.event.ids]),
        [
            ['100', 'comment', '@amy', { comment_id: 'c1', media_id: 'm1' }],
            ['100', 'direct', 'Instagram user 8', { sender_id: '8' }],
        ],
    );
    assert.deepEqual(instagramInbound({ entry: 'nope' }), []);

    assert.equal(blockedHost('ads.example.com', 'example.com, other.net'), true);
    assert.equal(blockedHost('example.com.', ' Example.com '), true);
    assert.equal(blockedHost('notexample.com', 'example.com'), false);
    assert.equal(blockedHost('example.com', ''), false);

    const long = `${'a'.repeat(1500)}\n${'b'.repeat(1500)}`;
    const chunks = discordChunks(long);

    assert.deepEqual(
        chunks.map((chunk) => chunk.length),
        [1500, 1500],
    );
    assert.equal(discordChunks('x'.repeat(4500)).length, 3);
    assert.deepEqual(discordChunks('   '), []);

    assert.deepEqual(
        pageLinks(
            '<a href="/news#top">News</a><a href="mailto:a@b.c">Mail</a><a href="https://x.com/">X <b>site</b></a><a href="/news">Again</a><a href="/empty"> </a>',
            new URL('https://example.com/a/b'),
        ),
        [
            { text: 'News', url: 'https://example.com/news' },
            { text: 'X site', url: 'https://x.com/' },
        ],
    );

    const refused = await postSigned('http://127.0.0.1:9/hook', { event: 'ping' }, 'secret');

    assert.equal(refused.ok, false);
    assert.equal(refused.error, 'address is not publicly routable');

    const signed = oauthHeader(
        'POST',
        'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
        { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
        {
            api_key: 'xvz1evFS4wEEPTGEFPHBog',
            api_secret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
            access_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
            access_secret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
        },
        'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
        '1318622958',
    );

    assert.ok(signed.startsWith('OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog", '), signed);
    assert.ok(signed.includes('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"'), signed);

    assert.equal(xLength('hello'), 5);
    assert.equal(xLength('news https://example.com/a/very/long/path?x=1'), 5 + 23);
    assert.equal(xLength('سلام دنیا'), 9);
    assert.equal(xLength('ok 🚀'), 5);
    assert.equal(xLength('日本'), 4);
    assert.equal(xLength('a'.repeat(280)), 280);

    assert.deepEqual(
        readPosts({
            data: [
                {
                    id: '10',
                    text: 'gm',
                    author_id: '7',
                    created_at: '2026-09-23T10:00:00.000Z',
                    public_metrics: { like_count: 3, retweet_count: 1, reply_count: 2 },
                },
            ],
            includes: { users: [{ id: '7', username: 'nura' }] },
        }),
        [
            {
                id: '10',
                author: '@nura',
                text: 'gm',
                at: '2026-09-23T10:00:00.000Z',
                likes: 3,
                reposts: 1,
                replies: 2,
                url: 'https://x.com/nura/status/10',
            },
        ],
    );
    assert.deepEqual(readPosts({}), []);

    assert.equal(
        code(() =>
            readPluginBody(
                { name: 'X', fields: { api_key: 'a', api_secret: 'b' } },
                kind('x'),
                null,
            ),
        ),
        'PLUGIN_FIELD_REQUIRED',
    );

    assert.ok(toolGuidance(['telegram_send_message']).includes('# Connected apps'));
    assert.ok(!toolGuidance(['web_search']).includes('# Connected apps'));

    console.log('plugin: ok');
}

void main();
