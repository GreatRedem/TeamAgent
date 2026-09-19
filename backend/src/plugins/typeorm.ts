import path from 'node:path';

import fastifyPlugin from 'fastify-plugin';

import { DataSource } from 'typeorm';

import config from '../utils/config.js';

import { createLogger } from '../utils/logger.js';

const log = createLogger('database');

export default fastifyPlugin(async function(fastify, options: { dir: string; matchFilter: string })
{
    const isDevelopment = config.NODE_ENV === 'development';

    const connection = new DataSource({
        type: 'postgres',
        url: config.NODE_DB,
        synchronize: isDevelopment,
        logging: isDevelopment,
        entities: [ path.join(options.dir, options.matchFilter) ]
    });

    await connection.initialize();

    log.info({ synchronize: isDevelopment, entities: connection.entityMetadatas.length }, 'database connected');

    fastify.decorate('db', connection);

    fastify.addHook('onClose', async() =>
    {
        await connection.destroy();

        log.info('database connection closed');
    });
});
