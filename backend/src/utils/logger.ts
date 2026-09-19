import { pino } from 'pino';

import config from './config.js';

const isDevelopment = config.NODE_ENV === 'development';

/**
 * Paths censored before a line is written.
 *
 * Redaction is structural rather than a denylist of names checked at each call
 * site, so a credential nested inside an error or a config blob is caught too.
 * Paths are case sensitive; `*` matches one level.
 */
const redactPaths =
[
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',

    'secret', '*.secret',
    'token', '*.token',
    'password', '*.password',
    'signature', '*.signature',
    'accessToken', '*.accessToken',
    'refreshToken', '*.refreshToken'
];

/**
 * The single logger instance for the process.
 *
 * `main.ts` hands this to Fastify as `loggerInstance`, so `request.log` is a
 * child of it carrying the request id. Prefer `request.log` inside a request —
 * it correlates the line to the request. Use `createLogger()` only outside
 * request scope, such as startup, shutdown and plugin wiring.
 */
export const logger = pino({
    level: isDevelopment ? 'trace' : 'info',
    base: isDevelopment ? { } : { service: 'backend' },
    timestamp: !isDevelopment,
    redact: { paths: redactPaths, censor: '[redacted]' }
});

/**
 * A child logger that tags every line with the module it came from.
 */
export function createLogger(module: string)
{
    return logger.child({ module });
}
