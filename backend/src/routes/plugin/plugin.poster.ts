import type { Page } from 'playwright-core';
import {
    BROWSER_IMAGE_MAX,
    BROWSER_LAST_POST,
    BROWSER_POST_GAP,
    BROWSER_QUEUE,
    BROWSER_STEP_TIMEOUT,
    BROWSER_TIMEOUT,
    INSTAGRAM_CAPTION_MAX,
    TELEGRAM_TEXT_MAX,
    X_TEXT_MAX,
} from '../../constant.js';

import { enqueue } from '../../utils/queue.js';
import { checkPublicUrl } from '../mcp/mcp.web.js';
import { argText, failed, type PluginOutcome, type PluginSettings } from './plugin.common.js';
import { xLength } from './plugin.x.js';

export interface BrowserSession {
    cookies: unknown[];
    origins: unknown[];
    userAgent?: string;
}

export interface PostImage {
    name: string;
    mimeType: string;
    buffer: Buffer;
}

export function readSession(raw: string): BrowserSession | null {
    try {
        const parsed = JSON.parse(raw) as Partial<BrowserSession> | null;

        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !Array.isArray(parsed.cookies) ||
            !Array.isArray(parsed.origins)
        ) {
            return null;
        }

        return {
            cookies: parsed.cookies,
            origins: parsed.origins,
            ...(typeof parsed.userAgent === 'string' && { userAgent: parsed.userAgent }),
        };
    } catch {
        return null;
    }
}

export function checkPost(site: string, text: string, hasImage: boolean): string | null {
    if (text.trim() === '' && !hasImage) {
        return 'text is required';
    }

    if (site === 'x' && xLength(text) > X_TEXT_MAX) {
        return `the post is longer than the ${X_TEXT_MAX} characters X allows`;
    }

    if (site === 'instagram' && !hasImage) {
        return 'Instagram posts need an image: pass image_url';
    }

    if (site === 'instagram' && text.length > INSTAGRAM_CAPTION_MAX) {
        return `an Instagram caption holds at most ${INSTAGRAM_CAPTION_MAX} characters`;
    }

    if (site === 'telegram' && hasImage) {
        return 'pictures are not posted through Telegram Web; use the Telegram bot plugin for them';
    }

    if (site === 'telegram' && text.length > TELEGRAM_TEXT_MAX) {
        return `a Telegram message holds at most ${TELEGRAM_TEXT_MAX} characters`;
    }

    return null;
}

export async function fetchImage(url: string): Promise<PostImage | string> {
    const check = await checkPublicUrl(url);

    if (!check.ok || !check.url) {
        return check.reason ?? 'that address is refused';
    }

    try {
        const response = await fetch(check.url.toString(), {
            redirect: 'manual',
            signal: AbortSignal.timeout(BROWSER_STEP_TIMEOUT),
        });

        if (response.status >= 300 && response.status < 400) {
            return 'that address redirects; give the final address of the image';
        }

        if (!response.ok) {
            return `the image address answered ${response.status}`;
        }

        const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';

        if (!mimeType.startsWith('image/')) {
            return 'that address is not an image';
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        return buffer.length > BROWSER_IMAGE_MAX
            ? 'the image is larger than 8 MB'
            : { name: `image.${mimeType.split('/')[1] ?? 'jpg'}`, mimeType, buffer };
    } catch {
        return 'the image could not be downloaded';
    }
}

async function withBrowser(
    session: BrowserSession,
    run: (page: Page) => Promise<PluginOutcome>,
): Promise<PluginOutcome> {
    let outcome: PluginOutcome = failed('the browser did not run');

    await enqueue(BROWSER_QUEUE, 'browser', async () => {
        let playwright: typeof import('playwright-core');

        try {
            playwright = await import('playwright-core');
        } catch {
            outcome = failed('the browser package is missing on the server');

            return;
        }

        let browser: Awaited<ReturnType<typeof playwright.chromium.launch>>;

        try {
            browser = await playwright.chromium.launch({ headless: true });
        } catch {
            outcome = failed(
                'Chromium is not installed on the server: run npx playwright-core install --with-deps chromium',
            );

            return;
        }

        let timer: ReturnType<typeof setTimeout> | undefined;

        try {
            const context = await browser.newContext({
                storageState: session as never,
                locale: 'en-US',
                ...(session.userAgent !== undefined && { userAgent: session.userAgent }),
            });
            const page = await context.newPage();

            page.setDefaultTimeout(BROWSER_STEP_TIMEOUT);

            outcome = await Promise.race([
                run(page),
                new Promise<PluginOutcome>((resolve) => {
                    timer = setTimeout(
                        () => resolve(failed('the browser took too long')),
                        BROWSER_TIMEOUT,
                    );
                }),
            ]);
        } catch (cause) {
            outcome = failed(
                `the browser stopped: ${cause instanceof Error ? cause.message.split('\n')[0] : 'unknown'}`,
            );
        } finally {
            clearTimeout(timer);
            await browser.close().catch(() => undefined);
        }
    });

    return outcome;
}

function signedOut(site: string): PluginOutcome {
    return failed(
        `the saved ${site} session is signed out; run npm run browser:login -- ${site} and save the plugin with the new session`,
    );
}

async function visible(page: Page, selector: string, timeout: number): Promise<boolean> {
    return page
        .locator(selector)
        .first()
        .waitFor({ state: 'visible', timeout })
        .then(
            () => true,
            () => false,
        );
}

async function xSignedIn(page: Page): Promise<boolean> {
    return (
        !/\/(login|i\/flow\/login)/.test(page.url()) &&
        (await visible(
            page,
            '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="tweetTextarea_0"]',
            BROWSER_STEP_TIMEOUT,
        ))
    );
}

async function postX(page: Page, text: string, image?: PostImage): Promise<PluginOutcome> {
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' });

    if (!(await xSignedIn(page))) {
        return signedOut('x');
    }

    await page.locator('[data-testid="tweetTextarea_0"]').first().click();
    await page.keyboard.insertText(text);

    if (image !== undefined) {
        await page.locator('input[data-testid="fileInput"]').first().setInputFiles(image);
        await page.locator('[data-testid="attachments"]').first().waitFor();
    }

    await page.locator('[data-testid="tweetButton"]').first().click();

    const toast = page.locator('[data-testid="toast"]').first();

    if (
        !(await toast.waitFor({ timeout: BROWSER_STEP_TIMEOUT }).then(
            () => true,
            () => false,
        ))
    ) {
        return failed('could not confirm the post went out; check the account before trying again');
    }

    const link = await toast
        .locator('a[href*="/status/"]')
        .first()
        .getAttribute('href', { timeout: 2000 })
        .catch(() => null);
    const said = ((await toast.textContent().catch(() => '')) ?? '').trim();

    return link === null && !/sent/i.test(said)
        ? failed(`X said: ${said || 'nothing'}`)
        : {
              ok: true,
              status: 200,
              data: {
                  site: 'x',
                  ...(link !== null && { url: new URL(link, 'https://x.com').toString() }),
              },
          };
}

async function postInstagram(page: Page, text: string, image: PostImage): Promise<PluginOutcome> {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });

    if (
        page.url().includes('/accounts/login') ||
        !(await visible(page, 'svg[aria-label="New post"]', BROWSER_STEP_TIMEOUT))
    ) {
        return signedOut('instagram');
    }

    await page.locator('svg[aria-label="New post"]').first().click();

    const choice = page.getByText('Post', { exact: true }).first();

    if (await choice.isVisible().catch(() => false)) {
        await choice.click();
    }

    await page.locator('input[type="file"]').first().setInputFiles(image);

    for (const step of ['first', 'second']) {
        const next = page.getByRole('button', { name: 'Next' }).first();

        if (
            !(await next.waitFor().then(
                () => true,
                () => false,
            ))
        ) {
            return failed(
                `Instagram did not offer the ${step} Next step; its page may have changed`,
            );
        }

        await next.click();
    }

    await page.locator('div[aria-label="Write a caption..."]').first().click();
    await page.keyboard.insertText(text);
    await page.getByRole('button', { name: 'Share' }).first().click();

    const shared = await page
        .getByText(/has been shared/i)
        .first()
        .waitFor({ timeout: BROWSER_TIMEOUT / 2 })
        .then(
            () => true,
            () => false,
        );

    return shared
        ? { ok: true, status: 200, data: { site: 'instagram' } }
        : failed('could not confirm the post went out; check the account before trying again');
}

async function postTelegram(page: Page, chat: string, text: string): Promise<PluginOutcome> {
    await page.goto(`https://web.telegram.org/k/#${chat}`, { waitUntil: 'domcontentloaded' });

    const input = '.input-message-input[contenteditable="true"]';

    if (!(await visible(page, input, BROWSER_STEP_TIMEOUT))) {
        return (await visible(page, '#column-left', 2000))
            ? failed(
                  `could not open ${chat} to write in; check the chat and that the account may post there`,
              )
            : signedOut('telegram');
    }

    await page.locator(input).first().click();
    await page.keyboard.insertText(text);
    await page.keyboard.press('Enter');

    const snippet = text.trim().split('\n')[0]?.slice(0, 40) ?? '';
    const sent = await page
        .locator('.bubble.is-out')
        .filter({ hasText: snippet })
        .last()
        .waitFor({ timeout: BROWSER_STEP_TIMEOUT })
        .then(
            () => true,
            () => false,
        );

    return sent
        ? { ok: true, status: 200, data: { site: 'telegram', chat } }
        : failed('could not confirm the message went out; check the chat before trying again');
}

export async function posterAct(
    pluginId: number,
    settings: PluginSettings,
    name: string,
    args: Record<string, unknown>,
): Promise<PluginOutcome> {
    if (name !== 'browser_post') {
        return failed('this plugin does not do that');
    }

    const site = settings.config['site'] ?? '';
    const chat = settings.config['chat'] ?? '';
    const session = readSession(settings.secrets['session'] ?? '');
    const text = argText(args, 'text');
    const imageUrl = argText(args, 'image_url');

    if (session === null) {
        return failed('the saved session is not valid; add it again on the Plugins page');
    }

    const problem = checkPost(site, text, imageUrl !== '');

    if (problem !== null) {
        return failed(problem);
    }

    if (site === 'telegram' && !/^@[A-Za-z]\w{3,31}$|^-?\d{5,20}$/.test(chat)) {
        return failed('set the Telegram chat on the plugin first, such as @mychannel');
    }

    const last = BROWSER_LAST_POST.get(pluginId) ?? 0;
    const wait = BROWSER_POST_GAP - (Date.now() - last);

    if (wait > 0) {
        return failed(
            `posts from this account must be two minutes apart; try again in ${Math.ceil(wait / 1000)} seconds`,
        );
    }

    const image = imageUrl === '' ? undefined : await fetchImage(imageUrl);

    if (typeof image === 'string') {
        return failed(image);
    }

    BROWSER_LAST_POST.set(pluginId, Date.now());

    return withBrowser(session, (page) =>
        site === 'x'
            ? postX(page, text, image)
            : site === 'instagram' && image !== undefined
              ? postInstagram(page, text, image)
              : postTelegram(page, chat, text),
    );
}

export async function posterProbe(settings: PluginSettings): Promise<PluginOutcome> {
    const site = settings.config['site'] ?? '';
    const session = readSession(settings.secrets['session'] ?? '');

    if (session === null) {
        return failed('the saved session is not valid');
    }

    return withBrowser(session, async (page) => {
        if (site === 'x') {
            await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

            if (!(await xSignedIn(page))) {
                return signedOut('x');
            }

            const handle = (
                await page
                    .locator('[data-testid="SideNav_AccountSwitcher_Button"]')
                    .first()
                    .textContent()
                    .catch(() => '')
            )?.match(/@\w+/)?.[0];

            return { ok: true, status: 200, data: `${handle ?? 'signed in'} on X` };
        }

        if (site === 'instagram') {
            await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });

            return page.url().includes('/accounts/login') ||
                !(await visible(page, 'svg[aria-label="New post"]', BROWSER_STEP_TIMEOUT))
                ? signedOut('instagram')
                : { ok: true, status: 200, data: 'signed in on Instagram' };
        }

        await page.goto('https://web.telegram.org/k/', { waitUntil: 'domcontentloaded' });

        return (await visible(page, '#column-left .chatlist', BROWSER_STEP_TIMEOUT))
            ? { ok: true, status: 200, data: 'signed in on Telegram Web' }
            : signedOut('telegram');
    });
}
