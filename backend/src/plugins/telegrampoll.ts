import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { TeamBot } from '../routes/team/team.entity.js';
import { ingestUpdate } from '../routes/telegram/telegram.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('telegram-poll');

const TELEGRAM_API = 'https://api.telegram.org';

const POLL_HOLD = 25;

const POLL_TIMEOUT = (POLL_HOLD + 10) * 1000;

const RESCAN_INTERVAL = 20_000;

const BACKOFF_ERROR = 5_000;

const BACKOFF_REJECTED = 300_000;

const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);

        signal.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);

                resolve();
            },
            { once: true },
        );
    });

interface TelegramReply {
    ok?: boolean;
    result?: unknown;
}

async function call(
    token: string,
    method: string,
    body: unknown,
    signal: AbortSignal,
): Promise<{ status: number; payload: TelegramReply | undefined } | undefined> {
    try {
        const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.any([signal, AbortSignal.timeout(POLL_TIMEOUT)]),
        });

        return {
            status: response.status,
            payload: (await response.json().catch(() => undefined)) as TelegramReply | undefined,
        };
    } catch {
        return undefined;
    }
}

export default fastifyPlugin(async function (fastify: FastifyInstance) {
    const running = new Map<number, AbortController>();

    const supervisor = new AbortController();

    async function poll(botId: number, signal: AbortSignal) {
        await call(
            (await fastify.db.getRepository(TeamBot).findOneBy({ id: botId }))?.token ?? '',
            'deleteWebhook',
            {},
            signal,
        );

        while (!signal.aborted) {
            const bot = await fastify.db.getRepository(TeamBot).findOneBy({ id: botId });

            if (!bot || bot.public_url !== '') {
                return;
            }

            const offset = Number(bot.poll_offset);

            const answer = await call(
                bot.token,
                'getUpdates',
                {
                    ...(offset > 0 && { offset }),
                    timeout: POLL_HOLD,
                    allowed_updates: ['message'],
                },
                signal,
            );

            if (signal.aborted) {
                return;
            }

            if (!answer) {
                await sleep(BACKOFF_ERROR, signal);

                continue;
            }

            if (answer.payload?.ok !== true) {
                log.warn({ botId, status: answer.status }, 'poll refused');

                await sleep(BACKOFF_REJECTED, signal);

                continue;
            }

            const updates = Array.isArray(answer.payload.result) ? answer.payload.result : [];

            let highest = offset > 0 ? offset - 1 : 0;

            for (const update of updates) {
                await ingestUpdate(fastify, bot, update, fastify.log);

                const updateId = Number((update as { update_id?: unknown }).update_id);

                if (Number.isFinite(updateId) && updateId > highest) {
                    highest = updateId;
                }
            }

            if (updates.length > 0) {
                await fastify.db
                    .getRepository(TeamBot)
                    .update({ id: botId }, { poll_offset: String(highest + 1) });
            }
        }
    }

    async function rescan() {
        const bots = await fastify.db.getRepository(TeamBot).findBy({ public_url: '' });

        const wanted = new Set(bots.map((bot) => bot.id));

        for (const [botId, controller] of running) {
            if (!wanted.has(botId)) {
                controller.abort();
                running.delete(botId);

                log.info({ botId }, 'polling stopped');
            }
        }

        for (const bot of bots) {
            if (running.has(bot.id)) {
                continue;
            }

            const controller = new AbortController();

            running.set(bot.id, controller);

            log.info({ botId: bot.id, teamId: bot.team_id }, 'polling started');

            void poll(bot.id, controller.signal)
                .catch((error: unknown) =>
                    log.error({ botId: bot.id, err: error }, 'polling loop failed'),
                )
                .finally(() => running.delete(bot.id));
        }
    }

    fastify.addHook('onReady', async () => {
        void (async () => {
            while (!supervisor.signal.aborted) {
                await rescan().catch((error: unknown) =>
                    log.error({ err: error }, 'polling rescan failed'),
                );

                await sleep(RESCAN_INTERVAL, supervisor.signal);
            }
        })();
    });

    fastify.addHook('onClose', async () => {
        supervisor.abort();

        for (const controller of running.values()) {
            controller.abort();
        }

        running.clear();

        log.info('polling stopped for shutdown');
    });
});
