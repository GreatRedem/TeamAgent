import assert from 'node:assert/strict';

import { Logger } from '../utils/logger.js';

function capture(run: (logger: Logger) => void, level = 'info') {
    const lines: string[] = [];
    const write = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((chunk: string) => {
        lines.push(chunk);

        return true;
    }) as typeof process.stdout.write;

    try {
        run(
            new Logger({
                level,
                base: { service: 'backend' },
                time: false,
                redacted: ['token', 'authorization'],
            }),
        );
    } finally {
        process.stdout.write = write;
    }

    return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function main() {
    const [plain] = capture((logger) => logger.info('started'));

    assert.deepEqual(plain, { level: 30, service: 'backend', msg: 'started' });

    const [fields] = capture((logger) =>
        logger.child({ module: 'task' }).warn({ taskId: 4 }, 'slow'),
    );

    assert.deepEqual(fields, {
        level: 40,
        service: 'backend',
        module: 'task',
        taskId: 4,
        msg: 'slow',
    });

    assert.equal(capture((logger) => logger.debug('hidden')).length, 0);
    assert.equal(capture((logger) => logger.debug('shown'), 'trace').length, 1);

    const [secret] = capture((logger) =>
        logger.info({ bot: { token: 'abc', name: 'x' }, headers: { Authorization: 'Bearer y' } }),
    );

    assert.deepEqual(secret?.['bot'], { token: '[redacted]', name: 'x' });
    assert.deepEqual(secret?.['headers'], { Authorization: '[redacted]' });

    const [failure] = capture((logger) => logger.error({ err: new TypeError('boom') }, 'failed'));
    const err = failure?.['err'] as Record<string, unknown>;

    assert.equal(err['type'], 'TypeError');
    assert.equal(err['message'], 'boom');
    assert.ok(String(err['stack']).includes('boom'));

    const loop: Record<string, unknown> = { name: 'loop' };

    loop['self'] = loop;

    const [circular] = capture((logger) => logger.info({ loop }));

    assert.deepEqual(circular?.['loop'], { name: 'loop', self: '[circular]' });

    const [request] = capture((logger) =>
        logger.info({ req: { method: 'GET', url: '/x', ip: '1.2.3.4', hostname: 'h', raw: loop } }),
    );

    assert.deepEqual(request?.['req'], {
        method: 'GET',
        url: '/x',
        host: 'h',
        remoteAddress: '1.2.3.4',
    });

    console.log('logger: ok');
}

main();
