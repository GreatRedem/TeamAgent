import assert from 'node:assert/strict';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SMS_CODE_ATTEMPTS, SMS_SENT } from '../constant.js';
import { bodyField } from '../plugins/validator.js';
import { Account, AccountSmsCode } from '../routes/account/account.entity.js';
import { smsSend, smsSignIn } from '../routes/account/account.service.js';
import { codeHash, normalizePhone, sameHash } from '../routes/account/account.sms.js';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) =>
        typeof value === 'object' && value !== null ? row[key] === null : row[key] === value,
    );
}

function table(rows: Row[]) {
    let next = 1;

    return {
        rows,
        findOneBy: async (where: Row) => rows.find((row) => matches(row, where)) ?? null,
        findOne: async (options: { where: Row }) =>
            rows.filter((row) => matches(row, options.where)).at(-1) ?? null,
        save: async (row: Row) => {
            const saved = { id: next++, ...row };

            rows.push(saved);

            return saved;
        },
        update: async (where: Row, patch: Row) => {
            for (const row of rows.filter((item) => matches(item, where))) {
                Object.assign(row, patch);
            }
        },
        increment: async (where: Row, key: string, by: number) => {
            for (const row of rows.filter((item) => matches(item, where))) {
                row[key] = Number(row[key]) + by;
            }
        },
        createQueryBuilder: () => {
            let id = 0;
            let patch: Row = {};
            const builder = {
                update: () => builder,
                set: (values: Row) => {
                    patch = values;

                    return builder;
                },
                where: (_sql: string, params: { id: number }) => {
                    id = params.id;

                    return builder;
                },
                andWhere: () => builder,
                execute: async () => {
                    const row = rows.find(
                        (item) => item['id'] === id && item['consumed_at'] === null,
                    );

                    if (row) {
                        Object.assign(row, patch);
                    }

                    return { affected: row ? 1 : 0 };
                },
            };

            return builder;
        },
    };
}

async function refusal(run: () => Promise<unknown>): Promise<string> {
    try {
        await run();
    } catch (cause) {
        return (cause as { result?: string }).result ?? String(cause);
    }

    return 'allowed';
}

async function main() {
    assert.equal(normalizePhone('09121234567'), '+989121234567');
    assert.equal(normalizePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷'), '+989121234567', 'Persian digits and spaces');
    assert.equal(normalizePhone('٠٩١٢١٢٣٤٥٦٧'), '+989121234567', 'Arabic digits');
    assert.equal(normalizePhone('00989121234567'), '+989121234567');
    assert.equal(normalizePhone('+1 (415) 555-0100'), '+14155550100');
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone('+0123456789'), null);
    assert.ok(sameHash(codeHash('+1', '123456'), codeHash('+1', '123456')));
    assert.ok(!sameHash(codeHash('+1', '123456'), codeHash('+1', '123457')));

    const tables = new Map<unknown, ReturnType<typeof table>>([
        [Account, table([])],
        [AccountSmsCode, table([])],
    ]);
    const printed: string[] = [];
    const log = {
        info: (fields: { text?: string }) => {
            if (typeof fields.text === 'string') {
                printed.push(fields.text);
            }
        },
        warn() {},
        error() {},
    };
    const fastify = {
        log,
        db: { getRepository: (entity: unknown) => tables.get(entity) ?? table([]) },
    } as unknown as FastifyInstance;
    const request = (body: Row) =>
        ({
            body,
            log,
            ip: '127.0.0.1',
            headers: {},
            getBody: (field: string) => bodyField(body, field),
        }) as unknown as FastifyRequest;
    const reply = () => {
        const sent: Row[] = [];

        return {
            sent,
            send: (value: Row) => sent.push(value),
            setCookie() {},
        } as unknown as FastifyReply & { sent: Row[] };
    };
    const send = (phone: string) =>
        smsSend(fastify).handler(request({ phone, locale: 'en' }), reply());
    const signIn = async (phone: string, code: string) => {
        const answer = reply();

        await smsSignIn(fastify).handler(request({ phone, code }), answer);

        return answer.sent[0];
    };
    const lastCode = () => /(\d{6})/.exec(printed.at(-1) ?? '')?.[1] ?? '';

    await send('09121234567');

    const first = lastCode();

    assert.match(first, /^\d{6}$/, 'the code is printed when no sms service is set');
    assert.equal(await refusal(() => send('09121234567')), 'SMS_TOO_SOON', 'one code a minute');
    assert.equal(await refusal(() => send('12345')), 'PHONE_INVALID');

    const codes = tables.get(AccountSmsCode)?.rows ?? [];

    assert.ok(!JSON.stringify(codes).includes(first), 'only a hash is stored');

    const wrong = first === '000000' ? '111111' : '000000';

    assert.equal(await refusal(() => signIn('09121234567', wrong)), 'SMS_CODE_INVALID');
    assert.equal(codes.at(-1)?.['attempts'], 1);

    const session = await signIn('۰۹۱۲۱۲۳۴۵۶۷', first);

    assert.equal(typeof session?.['accessToken'], 'string', 'the right code signs in');
    assert.equal(tables.get(Account)?.rows[0]?.['phone'], '+989121234567');
    assert.equal(tables.get(Account)?.rows[0]?.['wallet'], undefined, 'no wallet needed');
    assert.equal(
        await refusal(() => signIn('09121234567', first)),
        'SMS_CODE_INVALID',
        'a code works once',
    );

    SMS_SENT.clear();
    await send('+14155550100');

    const second = lastCode();

    for (let n = 0; n < SMS_CODE_ATTEMPTS; n += 1) {
        await refusal(() => signIn('+14155550100', second === '000000' ? '111111' : '000000'));
    }

    assert.equal(
        await refusal(() => signIn('+14155550100', second)),
        'SMS_CODE_INVALID',
        'too many wrong tries burn the code',
    );

    SMS_SENT.clear();
    await send('+14155550100');
    await send('+442071838750');
    SMS_SENT.clear();
    await send('+14155550100');

    assert.equal(
        codes.filter((row) => row['phone'] === '+14155550100' && row['consumed_at'] === null)
            .length,
        1,
        'a new code replaces the one before',
    );

    console.log('account.sms: ok');
}

main();
