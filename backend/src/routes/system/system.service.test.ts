import assert from 'node:assert/strict';
import os from 'node:os';

import { cpuPercent, disk } from './system.service.js';

const tests: Array<[string, () => void | Promise<void>]> = [
    [
        'cpu use is a percentage, not a jiffy count',
        () => {
            for (let i = 0; i < 3; i += 1) {
                const percent = cpuPercent();

                assert.ok(Number.isInteger(percent), `not an integer: ${percent}`);
                assert.ok(percent >= 0 && percent <= 100, `out of range: ${percent}`);
            }
        },
    ],

    [
        'two readings in the same tick keep the last answer rather than reading idle',
        () => {
            const first = cpuPercent();
            const second = cpuPercent();

            assert.equal(second, first);
        },
    ],

    [
        'memory used is inside the memory the machine has',
        () => {
            const total = os.totalmem();
            const used = total - os.freemem();

            assert.ok(total > 0, 'no total memory reported');
            assert.ok(used >= 0 && used <= total, `used ${used} of ${total}`);
        },
    ],

    [
        'disk reports used inside total, or zeroes where it cannot be read',
        async () => {
            const volume = await disk();

            assert.ok(volume.total >= 0 && volume.used >= 0, 'negative bytes');
            assert.ok(volume.used <= volume.total, `used ${volume.used} of ${volume.total}`);

            if (volume.total === 0) {
                assert.equal(volume.used, 0, 'used bytes on a volume with no size');
            }
        },
    ],
];

let failed = 0;

for (const [label, run] of tests) {
    try {
        await run();

        console.log(`  ok    ${label}`);
    } catch (cause) {
        failed += 1;

        console.log(`  FAIL  ${label}`);
        console.log(`        ${cause instanceof Error ? cause.message : String(cause)}`);
    }
}

console.log(failed === 0 ? `\n${tests.length} passed` : `\n${failed} of ${tests.length} failed`);

process.exit(failed === 0 ? 0 : 1);
