import path from 'node:path';

import fastifyPlugin from 'fastify-plugin';

import { DataSource } from 'typeorm';

import config from '../utils/config.js';

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

    fastify.decorate('db', connection);

    fastify.addHook('onClose', async() =>
    {
        await connection.destroy();
    });
});
