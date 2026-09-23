import assert from 'node:assert/strict';

import { telegramHtml } from '../routes/telegram/telegram.format.js';

assert.equal(
    telegramHtml('**bold** and *italic* and _also_'),
    '<b>bold</b> and <i>italic</i> and <i>also</i>',
);
assert.equal(
    telegramHtml('__bold__ ~~gone~~ ||secret||'),
    '<b>bold</b> <s>gone</s> <tg-spoiler>secret</tg-spoiler>',
);
assert.equal(telegramHtml('run `a < b && *c*`'), 'run <code>a &lt; b &amp;&amp; *c*</code>');
assert.equal(
    telegramHtml('see [the docs](https://x.dev/a_b_c?q=1&r="2") now'),
    'see <a href="https://x.dev/a_b_c?q=1&amp;r=&quot;2&quot;">the docs</a> now',
);
assert.equal(
    telegramHtml('[bad](javascript:alert(1))'),
    '[bad](javascript:alert(1))',
    'unsafe link',
);

assert.equal(telegramHtml('snake_case_name and 2 * 3 * 4'), 'snake_case_name and 2 * 3 * 4');
assert.equal(telegramHtml('a <tag> & more'), 'a &lt;tag&gt; &amp; more');

assert.equal(telegramHtml('## Title'), '<b>Title</b>');
assert.equal(telegramHtml('# **Loud** title #'), '<b>Loud title</b>');
assert.equal(telegramHtml('- one\n* two\n  + three'), '• one\n• two\n  • three');
assert.equal(telegramHtml('1. first\n2. second'), '1. first\n2. second');
assert.equal(telegramHtml('> said\n> **this**'), '<blockquote>said\n<b>this</b></blockquote>');
assert.equal(telegramHtml('---'), '───');
assert.equal(
    telegramHtml('```ts\nconst a = 1 < 2;\n```'),
    '<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>',
);
assert.equal(telegramHtml('```\n**not bold**\n```'), '<pre>**not bold**</pre>');
assert.equal(
    telegramHtml('| a | **b** |\n|---|---|\n| 1 | 2 |'),
    '<pre>| a | b |\n|---|---|\n| 1 | 2 |</pre>',
);
assert.equal(telegramHtml('| not a table |'), '| not a table |');

assert.equal(
    telegramHtml('text\n```py\nprint(1)'),
    'text\n<pre><code class="language-py">print(1)</code></pre>',
);
assert.equal(telegramHtml('half **bold'), 'half **bold');

{
    const reply = [
        '# Plan',
        'Here is **the plan** with `code`, a [link](https://t.me/x) and _notes_.',
        '',
        '> quoted **line**',
        '',
        '- step *one*',
        '- step ~~two~~',
        '',
        '| k | v |',
        '|---|---|',
        '| a | 1 |',
        '',
        '```js',
        'if (a < b && c > d) {}',
        '```',
        '---',
        'Done ||secret||.',
    ].join('\n');

    const visible = (html: string) =>
        html.replace(/<[^>]+>/g, '').replace(/&(lt|gt|amp|quot);/g, '_');

    for (let end = 1; end <= reply.length; end += 1) {
        const source = reply.slice(0, end);
        const html = telegramHtml(source);
        const open: string[] = [];

        for (const [, closing, name] of html.matchAll(/<(\/?)([a-z-]+)[^>]*>/g)) {
            if (closing === '') {
                open.push(name);
            } else {
                assert.equal(open.pop(), name, `mis-nested tag at ${end}: ${html}`);
            }
        }

        assert.equal(open.length, 0, `unclosed tag at ${end}: ${html}`);
        assert.ok(visible(html).length <= source.length, `longer at ${end}: ${html}`);
    }
}

console.log('telegram.format: ok');
