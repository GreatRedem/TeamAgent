import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

import { BROWSER_LOGIN_URLS, BROWSER_SITES } from '../constant.js';

async function main() {
    const site = process.argv[2] ?? '';

    if (!BROWSER_SITES.includes(site)) {
        console.error(`Usage: npm run browser:login -- ${BROWSER_SITES.join('|')}`);
        process.exit(1);
    }

    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ headless: false });

    try {
        const context = await browser.newContext({ locale: 'en-US' });
        const page = await context.newPage();

        await page.goto(BROWSER_LOGIN_URLS[site] ?? '');

        const prompt = createInterface({ input: process.stdin, output: process.stdout });

        await prompt.question('Sign in in the browser window, then press Enter here. ');
        prompt.close();

        const state = await context.storageState({ indexedDB: true });
        const userAgent = await page.evaluate(() => navigator.userAgent);
        const file = path.join(tmpdir(), `nura-${site}-session-${Date.now()}.json`);

        writeFileSync(file, JSON.stringify({ ...state, userAgent }), { mode: 0o600 });

        console.log(`Saved to ${file}`);
        console.log(
            'Paste its whole content into the plugin field "Signed-in session", save the plugin, then delete the file. Anyone holding it is signed in as you.',
        );
    } finally {
        await browser.close();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
