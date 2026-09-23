import { readConfig } from './utils/config.js';
import { Logger } from './utils/logger.js';

export const CONFIG = readConfig();

export const IS_DEVELOPMENT = CONFIG.NODE_ENV === 'development';

export const LOG_REDACTED = [
    'authorization',
    'cookie',
    'set-cookie',
    'secret',
    'token',
    'password',
    'signature',
    'accessToken',
    'refreshToken',
    'api_key',
    'apiKey',
];

export const LOGGER = new Logger({
    level: IS_DEVELOPMENT ? 'trace' : 'info',
    base: IS_DEVELOPMENT ? {} : { service: 'backend' },
    time: !IS_DEVELOPMENT,
    redacted: LOG_REDACTED,
});
