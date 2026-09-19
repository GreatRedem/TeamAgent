import type { FastifyError } from 'fastify';

import 'reflect-metadata';

import path from 'node:path';
import fastify from 'fastify';

import staticPlugin from '@fastify/static';
import cookiePlugin from '@fastify/cookie';
import autoLoadPlugin from '@fastify/autoload';
import multipartPlugin from '@fastify/multipart';

import historyPlugin from './plugins/history.js';
import typeormPlugin from './plugins/typeorm.js';
import ratelimitPlugin from './plugins/ratelimit.js';
import validatorPlugin from './plugins/validator.js';
import authenticationPlugin from './plugins/authentication.js';

import { fileURLToPath } from 'node:url';

import config from './utils/config.js';

import { STATUS_BAD_REQUEST, STATUS_FORBIDDEN, STATUS_INTERNAL_ERROR, STATUS_TOO_MANY_REQUEST, STATUS_UNAUTHORIZED } from './utils/status.js';

const dirName = path.dirname(fileURLToPath(import.meta.url));

const main = async() =>
{
    const app = fastify({ logger: config.NODE_ENV === 'development' && { level: 'trace', timestamp: false, base: { } }, trustProxy: true, pluginTimeout: 30000 });

    app.setErrorHandler((error: FastifyError, _request, reply) =>
    {
        switch (error.statusCode)
        {
            case STATUS_BAD_REQUEST:
            {
                reply.status(error.statusCode).send({ result: error.result });

                break;
            }
            case STATUS_UNAUTHORIZED:
            {
                reply.status(error.statusCode).send({ result: error.result });

                break;
            }
            case STATUS_FORBIDDEN:
            {
                reply.status(error.statusCode).send({ result: error.result });

                break;
            }
            case STATUS_TOO_MANY_REQUEST:
            {
                reply.status(error.statusCode).send({ result: error.result });

                break;
            }
            default:
            {
                console.log(error.name, error.message, error.stack);

                reply.status(STATUS_INTERNAL_ERROR).send({ result: 'INTERNAL_ERROR', message: config.NODE_ENV === 'development' && error.message });
            }
        }
    });

    app.setValidatorCompiler(() =>
    {
        return () => true;
    });

    await app.register(typeormPlugin, { dir: path.join(dirName, 'routes'), matchFilter: '**/*.entity.{ts,js}' });

    await app.register(ratelimitPlugin);

    await app.register(authenticationPlugin);

    await app.register(validatorPlugin);

    await app.register(staticPlugin, { root: path.join(dirName, '..', 'public'), prefix: '/' });

    await app.register(multipartPlugin, { limits: { fileSize: 5 * 1024 * 1024 } });

    await app.register(cookiePlugin, { secret: config.NODE_COOKIE, hook: 'onRequest', parseOptions: { secure: true, httpOnly: true, sameSite: 'strict' } });

    await app.register(historyPlugin);

    await app.register(autoLoadPlugin, { dir: path.join(dirName, 'routes'), matchFilter: /\.route\.(ts|js)$/, dirNameRoutePrefix: false });

    try
    {
        await app.listen({ port: config.NODE_PORT, host: config.NODE_ENV === 'development' ? '0.0.0.0' : '127.0.0.1' });
    }
    catch (error)
    {
        app.log.error(error);

        process.exit(1);
    }

    if (config.NODE_ENV === 'development')
    {
        app.log.info(`Swagger UI available at http://localhost:${ config.NODE_PORT }/api`);
    }

    process.on('SIGTERM', async() =>
    {
        await app.close();

        process.exit(0);
    });

    process.on('SIGINT', async() =>
    {
        await app.close();

        process.exit(0);
    });
};

void main();
