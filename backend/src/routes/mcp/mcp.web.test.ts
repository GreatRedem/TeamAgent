import assert from 'node:assert/strict';

import { checkPublicUrl, isPrivateAddress } from './mcp.web.js';

const BLOCKED = [
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.20.10.5',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '239.255.255.250',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:10.0.0.1',
];

const ALLOWED = [
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '172.32.0.1',
    '172.15.0.1',
    '192.167.1.1',
    '2606:4700:4700::1111',
];

const tests: Array<[string, () => void | Promise<void>]> = [
    [
        'every private, loopback and link-local address is refused',
        () => {
            for (const ip of BLOCKED) {
                assert.equal(isPrivateAddress(ip), true, `allowed ${ip}`);
            }
        },
    ],

    [
        'cloud metadata is refused in both v4 and v6-mapped form',
        () => {
            assert.equal(isPrivateAddress('169.254.169.254'), true);
            assert.equal(isPrivateAddress('::ffff:169.254.169.254'), true);
        },
    ],

    [
        'public addresses are allowed',
        () => {
            for (const ip of ALLOWED) {
                assert.equal(isPrivateAddress(ip), false, `refused ${ip}`);
            }
        },
    ],

    [
        'boundaries of the private ranges are respected',
        () => {
            assert.equal(isPrivateAddress('172.15.255.255'), false);
            assert.equal(isPrivateAddress('172.16.0.0'), true);
            assert.equal(isPrivateAddress('172.31.255.255'), true);
            assert.equal(isPrivateAddress('172.32.0.0'), false);

            assert.equal(isPrivateAddress('192.168.255.255'), true);
            assert.equal(isPrivateAddress('192.169.0.1'), false);
        },
    ],

    [
        'anything unrecognised is refused rather than allowed',
        () => {
            for (const junk of ['', 'not-an-ip', 'localhost', '999.999.999.999', '12']) {
                assert.equal(isPrivateAddress(junk), true, `allowed ${junk}`);
            }
        },
    ],

    [
        'non-http schemes are refused',
        async () => {
            for (const url of [
                'file:///etc/passwd',
                'ftp://example.com',
                'gopher://x',
                'data:text/plain,hi',
            ]) {
                const result = await checkPublicUrl(url);

                assert.equal(result.ok, false, `allowed ${url}`);
            }
        },
    ],

    [
        'malformed urls are refused',
        async () => {
            for (const url of ['', 'not a url', 'http://', '///']) {
                assert.equal((await checkPublicUrl(url)).ok, false, `allowed ${url}`);
            }
        },
    ],

    [
        'literal internal addresses are refused without needing DNS',
        async () => {
            for (const url of [
                'http://127.0.0.1/',
                'http://169.254.169.254/latest/meta-data/',
                'http://10.0.0.5:8080/admin',
                'http://[::1]:1000/',
            ]) {
                const result = await checkPublicUrl(url);

                assert.equal(result.ok, false, `allowed ${url}`);
                assert.match(result.reason ?? '', /not publicly routable/);
            }
        },
    ],

    [
        'a hostname resolving to loopback is refused',
        async () => {
            const result = await checkPublicUrl('http://localhost:1000/');

            assert.equal(result.ok, false);
        },
    ],

    [
        'a public hostname is allowed',
        async () => {
            const result = await checkPublicUrl('https://one.one.one.one/');

            if (result.reason === 'host does not resolve') {
                console.log('        (skipped: no DNS in this environment)');

                return;
            }

            assert.equal(result.ok, true, result.reason ?? 'refused');
        },
    ],
];

let failed = 0;

for (const [title, run] of tests) {
    try {
        await run();

        console.log(`  ok    ${title}`);
    } catch (error) {
        failed += 1;

        console.log(`  FAIL  ${title}`);
        console.log(`        ${error instanceof Error ? error.message : String(error)}`);
    }
}

console.log(failed === 0 ? `\n${tests.length} passed` : `\n${failed} of ${tests.length} failed`);

process.exit(failed === 0 ? 0 : 1);
