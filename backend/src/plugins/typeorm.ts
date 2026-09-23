import { readFileSync } from 'node:fs';
import path from 'node:path';

import fastifyPlugin from 'fastify-plugin';
import { DataSource } from 'typeorm';

import { CONFIG, IS_DEVELOPMENT, LOGGER } from '../constant.js';

export default fastifyPlugin(async (fastify, options: { dir: string; matchFilter: string }) => {
    const log = LOGGER.child({ module: 'database' });

    const url = CONFIG.NODE_DB_CA
        ? CONFIG.NODE_DB.replace(/[?&]sslmode=[^&]*/, '')
        : CONFIG.NODE_DB;

    const connection = new DataSource({
        type: 'postgres',
        url,
        ssl: CONFIG.NODE_DB_CA ? { ca: readFileSync(CONFIG.NODE_DB_CA, 'utf8') } : undefined,
        synchronize: IS_DEVELOPMENT,
        logging: false,
        entities: [path.join(options.dir, options.matchFilter)],
    });

    await connection.initialize();

    log.info(
        { synchronize: IS_DEVELOPMENT, entities: connection.entityMetadatas.length },
        'database connected',
    );

    fastify.decorate('db', connection);

    fastify.addHook('onClose', async () => {
        await connection.destroy();

        log.info('database connection closed');
    });
});
