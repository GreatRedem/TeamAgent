import type { FastifyBaseLogger } from 'fastify';

type Fields = Record<string, unknown>;

export interface LoggerOptions {
    level: string;
    base: Fields;
    time: boolean;
    redacted: readonly string[];
    bindings?: Fields;
}

function levelValue(level: string): number {
    switch (level) {
        case 'trace':
            return 10;
        case 'debug':
            return 20;
        case 'info':
            return 30;
        case 'warn':
            return 40;
        case 'error':
            return 50;
        case 'fatal':
            return 60;
        default:
            return Number.POSITIVE_INFINITY;
    }
}

function describeError(error: Error): Fields {
    return {
        type: error.name,
        message: error.message,
        stack: error.stack,
        ...('code' in error && { code: (error as { code?: unknown }).code }),
    };
}

function replacer(redacted: Set<string>) {
    const seen = new WeakSet<object>();

    return function (this: unknown, key: string, value: unknown): unknown {
        if (redacted.has(key.toLowerCase())) {
            return '[redacted]';
        }

        if (typeof value === 'bigint') {
            return value.toString();
        }

        if (value instanceof Error) {
            return describeError(value);
        }

        if (typeof value !== 'object' || value === null) {
            return value;
        }

        if (key === 'req' && 'method' in value && 'url' in value) {
            const request = value as {
                method: string;
                url: string;
                ip?: string;
                hostname?: string;
            };

            return {
                method: request.method,
                url: request.url,
                host: request.hostname,
                remoteAddress: request.ip,
            };
        }

        if (key === 'res' && 'statusCode' in value) {
            return { statusCode: (value as { statusCode: number }).statusCode };
        }

        if (seen.has(value)) {
            return '[circular]';
        }

        seen.add(value);

        return value;
    };
}

export class Logger implements FastifyBaseLogger {
    readonly options: LoggerOptions;

    level: string;

    constructor(options: LoggerOptions) {
        this.options = options;
        this.level = options.level;
    }

    fatal = (...args: unknown[]) => this.write(60, args);

    error = (...args: unknown[]) => this.write(50, args);

    warn = (...args: unknown[]) => this.write(40, args);

    info = (...args: unknown[]) => this.write(30, args);

    debug = (...args: unknown[]) => this.write(20, args);

    trace = (...args: unknown[]) => this.write(10, args);

    silent = () => {};

    child(bindings: Fields): Logger {
        return new Logger({
            ...this.options,
            level: this.level,
            bindings: { ...this.options.bindings, ...bindings },
        });
    }

    private write(level: number, args: unknown[]): void {
        if (level < levelValue(this.level)) {
            return;
        }

        const [first, ...rest] = args;
        const fields: Fields =
            first instanceof Error
                ? { err: first }
                : typeof first === 'object' && first !== null
                  ? (first as Fields)
                  : {};
        const words = typeof first === 'string' ? args : rest;
        const message = words.map((word) => String(word)).join(' ');

        const record = {
            level,
            ...(this.options.time && { time: Date.now() }),
            ...this.options.base,
            ...this.options.bindings,
            ...fields,
            ...(message !== '' && { msg: message }),
        };

        process.stdout.write(
            `${JSON.stringify(record, replacer(new Set(this.options.redacted.map((name) => name.toLowerCase()))))}\n`,
        );
    }
}
