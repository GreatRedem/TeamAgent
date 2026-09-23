import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { In } from 'typeorm';

import { LOGGER, PLUGIN_STATUS, RESCAN_INTERVAL } from '../constant.js';
import { sleep } from '../routes/plugin/plugin.common.js';
import { TeamPlugin } from '../routes/plugin/plugin.entity.js';
import { listenDiscord, listenTelegram } from '../routes/plugin/plugin.listen.js';

function stampOf(plugin: TeamPlugin): string {
    return [plugin.secrets, plugin.hook_agent_id, plugin.hook_url, plugin.hook_events].join('|');
}

export default fastifyPlugin(async (fastify: FastifyInstance) => {
    const log = LOGGER.child({ module: 'plugin-listen' });

    const running = new Map<number, { controller: AbortController; stamp: string }>();

    const supervisor = new AbortController();

    async function rescan() {
        const plugins = await fastify.db
            .getRepository(TeamPlugin)
            .findBy({ enabled: true, kind: In(['telegram', 'discord']) });

        const wanted = new Map(
            plugins
                .filter((plugin) => plugin.hook_agent_id > 0 || plugin.hook_url !== '')
                .map((plugin) => [plugin.id, plugin]),
        );

        for (const [pluginId, entry] of running) {
            const plugin = wanted.get(pluginId);

            if (!plugin || stampOf(plugin) !== entry.stamp) {
                entry.controller.abort();
                running.delete(pluginId);
                PLUGIN_STATUS.delete(pluginId);

                log.info({ pluginId }, 'listening stopped');
            }
        }

        for (const plugin of wanted.values()) {
            if (running.has(plugin.id)) {
                continue;
            }

            const controller = new AbortController();

            running.set(plugin.id, { controller, stamp: stampOf(plugin) });

            log.info({ pluginId: plugin.id, kind: plugin.kind }, 'listening started');

            const listen = plugin.kind === 'telegram' ? listenTelegram : listenDiscord;

            void listen(fastify, plugin, controller.signal, log)
                .catch((error: unknown) =>
                    log.error({ pluginId: plugin.id, err: error }, 'listening failed'),
                )
                .finally(() => {
                    if (running.get(plugin.id)?.controller === controller) {
                        running.delete(plugin.id);
                    }
                });
        }
    }

    fastify.addHook('onReady', async () => {
        void (async () => {
            while (!supervisor.signal.aborted) {
                await rescan().catch((error: unknown) =>
                    log.error({ err: error }, 'plugin rescan failed'),
                );

                await sleep(RESCAN_INTERVAL, supervisor.signal);
            }
        })();
    });

    fastify.addHook('onClose', async () => {
        supervisor.abort();

        for (const entry of running.values()) {
            entry.controller.abort();
        }

        running.clear();
    });
});
