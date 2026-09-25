import assert from 'node:assert/strict';

import { BROWSER_LAST_POST, PLUGIN_KINDS } from '../constant.js';
import { PluginError, readPluginBody } from '../routes/plugin/plugin.body.js';
import { checkPost, fetchImage, posterAct, readSession } from '../routes/plugin/plugin.poster.js';

async function main() {
    const session = JSON.stringify({
        cookies: [{ name: 'auth_token', value: 'x', domain: '.x.com', path: '/' }],
        origins: [],
        userAgent: 'Mozilla/5.0',
    });

    assert.deepEqual(readSession(session)?.userAgent, 'Mozilla/5.0');
    assert.equal(readSession('{"cookies":[]}'), null, 'origins are required');
    assert.equal(readSession('not json'), null);
    assert.equal(readSession('[]'), null);

    assert.equal(checkPost('x', 'Hello NuraChain', false), null);
    assert.match(checkPost('x', 'x'.repeat(281), false) ?? '', /280/);
    assert.match(checkPost('instagram', 'caption', false) ?? '', /need an image/);
    assert.equal(checkPost('instagram', 'caption', true), null);
    assert.match(checkPost('telegram', 'hi', true) ?? '', /Telegram bot plugin/);
    assert.match(checkPost('x', '  ', false) ?? '', /text is required/);

    assert.equal(
        typeof (await fetchImage('http://127.0.0.1/a.png')),
        'string',
        'private addresses are refused',
    );
    assert.equal(typeof (await fetchImage('file:///etc/passwd')), 'string');

    const settings = (site: string, chat = '', stored = session) => ({
        secrets: { session: stored },
        config: { site, chat },
    });

    assert.match(
        (await posterAct(1, settings('x', '', 'broken'), 'browser_post', { text: 'hi' })).error ??
            '',
        /session is not valid/,
    );
    assert.match(
        (await posterAct(1, settings('telegram'), 'browser_post', { text: 'hi' })).error ?? '',
        /Telegram chat/,
    );
    assert.match(
        (await posterAct(1, settings('instagram'), 'browser_post', { text: 'hi' })).error ?? '',
        /need an image/,
    );

    BROWSER_LAST_POST.set(9, Date.now());
    assert.match(
        (await posterAct(9, settings('x'), 'browser_post', { text: 'hi' })).error ?? '',
        /two minutes apart/,
        'a second post within two minutes is refused before any browser starts',
    );
    assert.match(
        (await posterAct(1, settings('x'), 'x_post', { text: 'hi' })).error ?? '',
        /does not do that/,
    );

    const kind = PLUGIN_KINDS.find((item) => item.key === 'poster');

    assert.ok(kind !== undefined);

    const code = (fields: Record<string, string>) => {
        try {
            return readPluginBody({ name: 'Posting', fields }, kind, null);
        } catch (error) {
            return error instanceof PluginError ? error.code : String(error);
        }
    };
    const big = JSON.stringify({
        cookies: [{ name: 'a', value: 'v'.repeat(20_000), domain: '.x.com', path: '/' }],
        origins: [],
    });
    const saved = code({ site: 'x', session: big });

    assert.equal(
        typeof saved === 'object' && saved.secrets['session']?.length,
        big.length,
        'a long session is kept whole, not cut at 512 characters',
    );
    assert.equal(code({ site: 'facebook', session }), 'PLUGIN_SITE_INVALID');
    assert.equal(code({ site: 'x', session: '{"cookies":[]}' }), 'PLUGIN_SESSION_INVALID');

    console.log('plugin.poster: ok');
}

main();
