import assert from 'node:assert/strict';
import { crc32, deflateRawSync } from 'node:zlib';

import { packFile, unzip, zip } from '../utils/zip.js';

async function* parts(...values: string[]) {
    for (const value of values) {
        yield value;
    }
}

async function main() {
    const limits = { files: 8, bytes: 1_000_000 };
    const big = 'نورا '.repeat(20_000);
    const archive = zip([
        await packFile('nura.json', parts('{"format":1}')),
        await packFile('agents.json', parts('[', big, ']')),
        await packFile('empty.json', parts()),
    ]);

    const tests: Array<[string, () => void]> = [
        [
            'what is zipped comes back byte for byte',
            () => {
                const files = unzip(archive, limits);

                assert.deepEqual(
                    files.map((file) => file.name),
                    ['nura.json', 'agents.json', 'empty.json'],
                );
                assert.equal(files[0]?.data.toString('utf8'), '{"format":1}');
                assert.equal(files[1]?.data.toString('utf8'), `[${big}]`);
                assert.equal(files[2]?.data.length, 0);
            },
        ],

        [
            'it compresses',
            () => {
                assert.ok(archive.length < Buffer.byteLength(big) / 10);
            },
        ],

        [
            'a damaged file is refused',
            () => {
                const broken = Buffer.from(archive);
                const at = broken.indexOf(Buffer.from('agents.json')) + 40;

                broken[at] = (broken[at] ?? 0) ^ 0xff;

                assert.throws(() => unzip(broken, limits));
            },
        ],

        [
            'something that is not a zip is refused',
            () => {
                assert.throws(() => unzip(Buffer.from('hello'), limits), /not a zip/);
            },
        ],

        [
            'a zip that unpacks past the limit is refused',
            () => {
                assert.throws(
                    () => unzip(archive, { files: 8, bytes: 1000 }),
                    /more than is allowed/,
                );
                assert.throws(() => unzip(archive, { files: 2, bytes: 1_000_000 }), /too many/);
            },
        ],

        [
            'a file that lies about its size cannot inflate past it',
            () => {
                const data = Buffer.alloc(100_000);
                const packed = deflateRawSync(data);
                const lying = zip([{ name: 'bomb.json', packed, crc: crc32(data), size: 10 }]);

                assert.throws(() => unzip(lying, limits));
            },
        ],
    ];

    let failed = 0;

    for (const [title, run] of tests) {
        try {
            run();

            console.log(`  ok    ${title}`);
        } catch (error) {
            failed += 1;

            console.log(`  FAIL  ${title}`);
            console.log(`        ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log(`\n${tests.length - failed} passed`);

    if (process.argv[2] !== undefined) {
        const { writeFileSync } = await import('node:fs');

        writeFileSync(process.argv[2], archive);
    }

    if (failed > 0) {
        process.exit(1);
    }
}

void main();
