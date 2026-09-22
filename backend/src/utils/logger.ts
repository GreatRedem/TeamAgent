import { pino } from 'pino';

import config from './config.js';

const isDevelopment = config.NODE_ENV === 'development';

const redactPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',

    'secret',
    '*.secret',
    'token',
    '*.token',
    'password',
    '*.password',
    'signature',
    '*.signature',
    'accessToken',
    '*.accessToken',
    'refreshToken',
    '*.refreshToken',
];

export const logger = pino({
    level: isDevelopment ? 'trace' : 'info',
    base: isDevelopment ? {} : { service: 'backend' },
    timestamp: !isDevelopment,
    redact: { paths: redactPaths, censor: '[redacted]' },
});

export function createLogger(module: string) {
    return logger.child({ module });
}
