import assert from 'node:assert/strict';

import { toolGuidance } from '../routes/agent/agent.reply.js';
import { parseBing, parseDuckDuckGo, relevant } from '../routes/mcp/mcp.search.js';
import { describe } from '../routes/mcp/mcp.weather.js';
import { decodeEntities, htmlToText } from '../routes/mcp/mcp.web.js';

function main() {
    const wrapped = `https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${Buffer.from('https://example.com/karaj?x=1').toString('base64url')}&amp;ntb=1`;
    const bing = `
        <ol id="b_results">
            <li class="b_algo" data-id=""><h2><a href="https://weather.example/karaj" h="ID=1">Karaj <strong>Weather</strong> &amp; Forecast</a></h2>
                <div class="b_caption"><p class="b_lineclamp2">Sunny, 33&#176;C today in Karaj.</p></div></li>
            <li class="b_algo"><h2><a href="${wrapped}">Wrapped result</a></h2><p>Second snippet</p></li>
            <li class="b_algo"><h2><a href="/search?q=related">Related searches</a></h2></li>
        </ol>`;

    assert.deepEqual(parseBing(bing), [
        {
            title: 'Karaj Weather & Forecast',
            url: 'https://weather.example/karaj',
            snippet: 'Sunny, 33°C today in Karaj.',
        },
        {
            title: 'Wrapped result',
            url: 'https://example.com/karaj?x=1',
            snippet: 'Second snippet',
        },
    ]);

    const duck = `
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnews.example%2Fa%3Fb%3D1&amp;rut=x">News <b>story</b></a>
        <a class="result__snippet" href="x">What <b>happened</b> today</a>
        <a rel="nofollow" class="result__a" href="https://direct.example/">Direct</a>
        <a class="result__snippet" href="y">Plain</a>`;

    assert.deepEqual(parseDuckDuckGo(duck), [
        { title: 'News story', url: 'https://news.example/a?b=1', snippet: 'What happened today' },
        { title: 'Direct', url: 'https://direct.example/', snippet: 'Plain' },
    ]);

    const junk = {
        title: 'Happy synonyms',
        url: 'https://thesaurus.example/happy',
        snippet: 'Words',
    };
    const hit = { title: 'Forecast', url: 'https://w.example/', snippet: 'Karaj today' };

    assert.deepEqual(relevant('Karaj weather today', [junk, hit]), [hit]);
    assert.deepEqual(relevant('a b', [junk]), [junk]);

    assert.equal(
        decodeEntities('a &amp; b &lt;c&gt; &#8364; &#x20AC; &quot;q&quot;'),
        'a & b <c> € € "q"',
    );

    const page = `<!doctype html><html><head><title>Karaj &amp; weather</title><style>p{color:red}</style>
        <script>var secret = 1;</script></head><body><nav>Menu</nav><footer>Legal</footer>
        <h1>Today</h1><p>Sunny   and <b>warm</b>.</p><ul><li>High 33</li><li>Low 18</li></ul>
        <!-- hidden --><p>Wind 10&nbsp;km/h<br>Humidity 20%</p></body></html>`;
    const text = htmlToText(page);

    assert.ok(text.startsWith('Karaj & weather\n\n'), text);
    assert.ok(text.includes('Sunny and warm .') || text.includes('Sunny and warm.'), text);
    assert.ok(text.includes('- High 33'));
    assert.ok(text.includes('Wind 10 km/h\nHumidity 20%'), text);
    assert.ok(
        !text.includes('secret') &&
            !text.includes('color:red') &&
            !text.includes('hidden') &&
            !text.includes('Menu') &&
            !text.includes('Legal'),
    );

    assert.equal(describe(0), 'clear sky');
    assert.equal(describe(95), 'thunderstorm');
    assert.equal(describe(12), 'code 12');
    assert.equal(describe(undefined), 'unknown');

    assert.equal(toolGuidance(['time_now']), '');
    assert.ok(toolGuidance(['web_search', 'weather']).includes('web_search, weather'));

    console.log('mcp.search: ok');
}

main();
