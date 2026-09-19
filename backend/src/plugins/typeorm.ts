import path from 'node:path';

import fastifyPlugin from 'fastify-plugin';

import { DataSource } from 'typeorm';

import config from '../utils/config.js';

export default fastifyPlugin(async function(fastify, options: { dir: string; matchFilter: string })
{
    const connection = new DataSource({
        // @ts-expect-error Silent Error - type from env Database type (mysql, postgres, sqlite, etc.)
        type: config.DB_WEB_TYPE,
        host: config.DB_WEB_HOST,
        port: config.DB_WEB_PORT,
        username: config.DB_WEB_USERNAME,
        password: config.DB_WEB_PASSWORD,
        database: config.DB_WEB_DATABASE,
        synchronize: config.DB_WEB_SYNC,
        logging: config.DB_WEB_LOG,
        entities: [ path.join(options.dir, options.matchFilter) ]
    });

    await connection.initialize();

    fastify.decorate('db', connection);

    fastify.addHook('onClose', async() =>
    {
        await connection.destroy();
    });
});
