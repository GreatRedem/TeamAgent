import path from 'node:path';

import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import autoLoadPlugin from '@fastify/autoload';
import cookiePlugin from '@fastify/cookie';
import type { FastifyError } from 'fastify';
import fastify from 'fastify';

import authenticationPlugin from './plugins/authentication.js';
import ratelimitPlugin from './plugins/ratelimit.js';
import taskRunnerPlugin from './plugins/taskrunner.js';
import telegramPollPlugin from './plugins/telegrampoll.js';
import typeormPlugin from './plugins/typeorm.js';
import validatorPlugin from './plugins/validator.js';
import config from './utils/config.js';
import { createLogger, logger } from './utils/logger.js';
import {
    STATUS_BAD_REQUEST,
    STATUS_FORBIDDEN,
    STATUS_INTERNAL_ERROR,
    STATUS_TOO_MANY_REQUEST,
    STATUS_UNAUTHORIZED,
} from './utils/status.js';

const isDevelopment = config.NODE_ENV === 'development';

const log = createLogger('server');

const dirName = path.dirname(fileURLToPath(import.meta.url));

const main = async () => {
    const app = fastify({
        loggerInstance: logger,
        trustProxy: '127.0.0.1',
        pluginTimeout: 30000,
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
        if (
            error.statusCode !== undefined &&
            [
                STATUS_BAD_REQUEST,
                STATUS_UNAUTHORIZED,
                STATUS_FORBIDDEN,
                STATUS_TOO_MANY_REQUEST,
            ].includes(error.statusCode)
        ) {
            reply.status(error.statusCode).send({ result: error.result });

            return;
        }

        request.log.error({ err: error }, 'unhandled request error');

        reply
            .status(STATUS_INTERNAL_ERROR)
            .send({ result: 'INTERNAL_ERROR', ...(isDevelopment && { message: error.message }) });
    });

    app.setValidatorCompiler(() => {
        return () => true;
    });

    await app.register(typeormPlugin, {
        dir: path.join(dirName, 'routes'),
        matchFilter: '**/*.entity.{ts,js}',
    });

    await app.register(authenticationPlugin);

    await app.register(ratelimitPlugin);

    await app.register(validatorPlugin);

    await app.register(cookiePlugin, {
        secret: config.NODE_COOKIE,
        hook: 'onRequest',
        parseOptions: { secure: true, httpOnly: true, sameSite: 'strict' },
    });

    await app.register(autoLoadPlugin, {
        dir: path.join(dirName, 'routes'),
        matchFilter: /\.route\.(ts|js)$/,
        dirNameRoutePrefix: false,
    });

    await app.register(telegramPollPlugin);

    await app.register(taskRunnerPlugin);

    await app.listen({ port: config.NODE_PORT, host: '127.0.0.1' });

    log.info(
        { port: config.NODE_PORT, host: '127.0.0.1', env: config.NODE_ENV },
        'server listening',
    );

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, async () => {
            log.info({ signal }, 'shutdown signal received');

            await app.close();

            log.info('shutdown complete');

            process.exit(0);
        });
    }
};

main().catch((error) => {
    log.fatal({ err: error }, 'failed to start server');

    process.exit(1);
});
