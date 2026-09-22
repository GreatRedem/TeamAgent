import path from 'node:path';
import { readFileSync } from 'node:fs';

import fastifyPlugin from 'fastify-plugin';

import { DataSource } from 'typeorm';

import config from '../utils/config.js';

import { createLogger } from '../utils/logger.js';

const log = createLogger('database');

export default fastifyPlugin(async function(fastify, options: { dir: string; matchFilter: string })
{
    const isDevelopment = config.NODE_ENV === 'development';

    const url = config.NODE_DB_CA ? config.NODE_DB.replace(/[?&]sslmode=[^&]*/, '') : config.NODE_DB;

    const connection = new DataSource({
        type: 'postgres',
        url,
        ssl: config.NODE_DB_CA ? { ca: readFileSync(config.NODE_DB_CA, 'utf8') } : undefined,
        synchronize: isDevelopment,
        logging: false,
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
