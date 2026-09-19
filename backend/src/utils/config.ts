import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

/**
 * `.env` lives at the repository root, but the backend is started from
 * different working directories -- `backend/` under `npm run dev`, the repo
 * root under systemd. Resolving from `process.cwd()` therefore finds it in one
 * case and silently loads nothing in the other, so walk up from this module
 * instead. The compiled output sits at a different depth than the source, which
 * is why this searches rather than using a fixed relative path.
 */
function findEnvFile(from: string): string | undefined
{
    let directory = from;

    for (;;)
    {
        const candidate = join(directory, '.env');

        if (existsSync(candidate))
        {
            return candidate;
        }

        const parent = dirname(directory);

        if (parent === directory)
        {
            return undefined;
        }

        directory = parent;
    }
}

// path undefined -> dotenv falls back to its own cwd lookup
const envFile = findEnvFile(import.meta.dirname);

loadEnv({ path: envFile });

const builder = (name: string) =>
{
    const value = process.env[name];

    if (value === undefined)
    {
        throw new TypeError(`Missing required environment variable: ${ name }`);
    }

    const asNumber = () =>
    {
        const result = Number.parseInt(value, 10);

        if (Number.isNaN(result))
        {
            throw new TypeError(`Invalid value for environment variable: ${ name } - ${ typeof value } - ${ value }`);
        }

        return result;
    };

    const asString = () =>
    {
        return value;
    };

    return { asNumber, asString };
};

const NODE_PORT = builder('NODE_PORT').asNumber();

const NODE_ENV = (() =>
{
    const value = builder('NODE_ENV').asString();

    if (![ 'development', 'production' ].includes(value))
    {
        throw new TypeError(`Invalid format type for environment variable: NODE_ENV - ${ value }`);
    }

    return value as 'development' | 'production';
})();

const NODE_DB = builder('NODE_DB').asString();

/**
 * Optional: path to the CA certificate the database server's chain is signed
 * by. Managed providers (Aiven, and others) sign with a private per-project CA
 * that is not in the system trust store, so TLS verification fails without it.
 * Unset means "verify against the system CAs", which is what a local Postgres
 * or a publicly-trusted provider needs.
 */
const NODE_DB_CA = (() =>
{
    const value = process.env['NODE_DB_CA'];

    if (!value)
    {
        return undefined;
    }

    // Resolved against `.env`'s own directory, not `process.cwd()`, for the same
    // reason `findEnvFile` exists: cwd is `backend/` under `npm run dev` and the
    // repository root under systemd, so a relative path would point at two
    // different files. An absolute path is returned unchanged.
    return envFile ? resolve(dirname(envFile), value) : resolve(value);
})();
const NODE_COOKIE = builder('NODE_COOKIE').asString();

const SESSION_ACCESS_SECRET = builder('SESSION_ACCESS_SECRET').asString();
const SESSION_REFRESH_SECRET = builder('SESSION_REFRESH_SECRET').asString();

export default
{
    NODE_PORT,
    NODE_ENV,
    NODE_DB,
    NODE_DB_CA,
    NODE_COOKIE,

    SESSION_ACCESS_SECRET,
    SESSION_REFRESH_SECRET
};
