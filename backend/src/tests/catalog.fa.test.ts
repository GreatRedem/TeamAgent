import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
    AGENT_PERMISSIONS,
    PERMISSIONS,
    PLUGIN_KINDS,
    PLUGIN_TOOLS,
    PROVIDERS,
    TOOLS,
} from '../constant.js';

function main() {
    const overlay = readFileSync(
        new URL('../../../frontend/src/locales/fa/catalog.ts', import.meta.url),
        'utf8',
    );
    const present = new Set([...overlay.matchAll(/'(catalog\.[^']+)':/g)].map((match) => match[1]));

    const routes = new URL('../routes/', import.meta.url);
    const actions = new Set<string>();

    for (const file of readdirSync(routes, { recursive: true, encoding: 'utf8' })) {
        if (!file.endsWith('.ts')) {
            continue;
        }

        const source = readFileSync(new URL(file.replaceAll('\\', '/'), routes), 'utf8');

        for (const match of source.matchAll(
            /action:\s*(?:[^,\n]*\?\s*)?'([a-z_]+\.[a-z_.]+)'(?:\s*:\s*'([a-z_]+\.[a-z_.]+)')?/g,
        )) {
            actions.add(match[1]);

            if (match[2] !== undefined) {
                actions.add(match[2]);
            }
        }
    }

    const expected = [
        ...AGENT_PERMISSIONS.flatMap((item) => [
            `catalog.capability.${item.key}.label`,
            `catalog.capability.${item.key}.description`,
        ]),
        ...[...TOOLS, ...PLUGIN_TOOLS].map((tool) => `catalog.tool.${tool.name}`),
        ...PERMISSIONS.flatMap((item) => [
            `catalog.permission.${item.key}.label`,
            `catalog.permission.${item.key}.description`,
        ]),
        ...PLUGIN_KINDS.flatMap((kind) => [
            `catalog.kind.${kind.key}.label`,
            `catalog.kind.${kind.key}.description`,
            ...(kind.inbound_hint === '' ? [] : [`catalog.kind.${kind.key}.inbound_hint`]),
            ...kind.fields.flatMap((field) => [
                `catalog.kind.${kind.key}.field.${field.key}.label`,
                ...(field.hint === '' ? [] : [`catalog.kind.${kind.key}.field.${field.key}.hint`]),
            ]),
        ]),
        ...PROVIDERS.flatMap((provider) => [
            `catalog.provider.${provider.key}.label`,
            ...(provider.hint === '' ? [] : [`catalog.provider.${provider.key}.hint`]),
        ]),
        ...[...actions].map((action) => `catalog.action.${action}`),
    ];
    const known = new Set(expected);

    const missing = expected.filter((key) => !present.has(key));
    const stale = [...present].filter((key) => !key.startsWith('catalog.role.') && !known.has(key));

    assert.ok(actions.size > 40, `only ${actions.size} activity actions were found in the routes`);
    assert.deepEqual(
        missing,
        [],
        'these have no Persian text in frontend/src/locales/fa/catalog.ts',
    );
    assert.deepEqual(stale, [], 'these Persian entries no longer match anything in the backend');

    console.log(`catalog.fa: ok (${expected.length} entries)`);
}

main();
