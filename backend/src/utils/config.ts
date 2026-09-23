import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

function findEnvFile(from: string): string | undefined {
    let directory = from;

    for (;;) {
        const candidate = join(directory, '.env');

        if (existsSync(candidate)) {
            return candidate;
        }

        const parent = dirname(directory);

        if (parent === directory) {
            return undefined;
        }

        directory = parent;
    }
}

function readString(name: string): string {
    const value = process.env[name];

    if (value === undefined) {
        throw new TypeError(`Missing required environment variable: ${name}`);
    }

    return value;
}

function readNumber(name: string): number {
    const value = readString(name);
    const result = Number.parseInt(value, 10);

    if (Number.isNaN(result)) {
        throw new TypeError(
            `Invalid value for environment variable: ${name} - ${typeof value} - ${value}`,
        );
    }

    return result;
}

function readEnvironment(): 'development' | 'production' {
    const value = readString('NODE_ENV');

    if (value !== 'development' && value !== 'production') {
        throw new TypeError(`Invalid format type for environment variable: NODE_ENV - ${value}`);
    }

    return value;
}

export function readConfig() {
    const envFile = findEnvFile(import.meta.dirname);

    loadEnv({ path: envFile });

    const ca = process.env['NODE_DB_CA'];

    return {
        NODE_PORT: readNumber('NODE_PORT'),
        NODE_ENV: readEnvironment(),
        NODE_DB: readString('NODE_DB'),
        NODE_DB_CA: ca ? (envFile ? resolve(dirname(envFile), ca) : resolve(ca)) : undefined,
        NODE_COOKIE: readString('NODE_COOKIE'),

        SESSION_ACCESS_SECRET: readString('SESSION_ACCESS_SECRET'),
        SESSION_REFRESH_SECRET: readString('SESSION_REFRESH_SECRET'),
    };
}
