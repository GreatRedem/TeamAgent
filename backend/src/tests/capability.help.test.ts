import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AGENT_PERMISSIONS } from '../constant.js';

function main() {
    const english = readFileSync(
        new URL('../../../frontend/src/locales/en/tools.ts', import.meta.url),
        'utf8',
    );
    const present = new Set(
        [...english.matchAll(/'(tools\.help\.[^']+)':/g)].map((match) => match[1]),
    );
    const known = new Set(AGENT_PERMISSIONS.map((capability) => capability.key));

    const missing = AGENT_PERMISSIONS.flatMap((capability) =>
        ['summary', 'example1', 'example2']
            .map((part) => `tools.help.${capability.key}.${part}`)
            .filter((key) => !present.has(key)),
    );
    const stale = [...present].filter((key) => {
        const capability = key.slice('tools.help.'.length).replace(/\.[^.]+$/, '');

        return (
            !['open', 'examples'].includes(key.slice('tools.help.'.length)) &&
            !known.has(capability)
        );
    });

    assert.deepEqual(
        missing,
        [],
        'every capability needs help text with two examples in both languages',
    );
    assert.deepEqual(stale, [], 'help text for a capability that no longer exists');

    console.log(`capability.help: ok (${known.size} capabilities)`);
}

main();
