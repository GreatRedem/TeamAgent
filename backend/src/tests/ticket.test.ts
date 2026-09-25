import assert from 'node:assert/strict';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ADMIN_ROLE } from '../constant.js';
import { bodyField } from '../plugins/validator.js';
import { Account } from '../routes/account/account.entity.js';
import { Ticket, TicketMessage } from '../routes/ticket/ticket.entity.js';
import {
    supportList,
    supportPlan,
    ticketCreate,
    ticketDetails,
    ticketList,
    ticketReply,
    ticketStatus,
} from '../routes/ticket/ticket.service.js';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
        const listed = (value as { _value?: unknown } | null)?._value;

        return Array.isArray(listed) ? listed.includes(row[key]) : row[key] === value;
    });
}

function table(rows: Row[]) {
    let next = rows.length + 1;

    return {
        rows,
        find: async (options: { where?: Row } = {}) =>
            rows.filter((row) => matches(row, options.where)),
        findBy: async (where: Row) => rows.filter((row) => matches(row, where)),
        findOneBy: async (where: Row) => rows.find((row) => matches(row, where)) ?? null,
        countBy: async (where: Row) => rows.filter((row) => matches(row, where)).length,
        findAndCount: async (options: { where?: Row; skip?: number; take?: number }) => {
            const found = rows.filter((row) => matches(row, options.where));

            return [
                found.slice(options.skip ?? 0, (options.skip ?? 0) + (options.take ?? 50)),
                found.length,
            ];
        },
        save: async (row: Row) => {
            const saved = { id: next++, created_at: new Date(), updated_at: new Date(), ...row };

            rows.push(saved);

            return saved;
        },
        update: async (where: Row, patch: Row) => {
            for (const row of rows.filter((item) => matches(item, where))) {
                Object.assign(row, patch);
            }
        },
    };
}

async function main() {
    const tables = new Map<unknown, ReturnType<typeof table>>([
        [
            Account,
            table([
                {
                    id: 1,
                    role: 0,
                    wallet: null,
                    phone: '+989121234567',
                    plan: 'free',
                    plan_until: null,
                },
                { id: 2, role: 0, wallet: '0xabc', phone: null, plan: 'free', plan_until: null },
                {
                    id: 3,
                    role: ADMIN_ROLE,
                    wallet: '0xadmin',
                    phone: null,
                    plan: 'free',
                    plan_until: null,
                },
            ]),
        ],
        [Ticket, table([])],
        [TicketMessage, table([])],
    ]);
    const log = { info() {}, warn() {}, error() {} };
    const fastify = {
        log,
        db: { getRepository: (entity: unknown) => tables.get(entity) ?? table([]) },
    } as unknown as FastifyInstance;
    const as = (accountId: number, body: Row = {}, params: Row = {}, query: Row = {}) =>
        ({
            account_id: accountId,
            account_role: accountId === 3 ? ADMIN_ROLE : 0,
            body,
            params,
            query,
            log,
            getBody: (field: string) => bodyField(body, field),
        }) as unknown as FastifyRequest;
    const run = async (
        route: { handler: (request: FastifyRequest, reply: FastifyReply) => unknown },
        request: FastifyRequest,
    ) => {
        let sent: unknown;

        try {
            await route.handler(request, {
                send: (value: unknown) => (sent = value),
            } as FastifyReply);
        } catch (cause) {
            return { error: (cause as { result?: string }).result ?? String(cause) };
        }

        return sent as Record<string, unknown>;
    };

    const opened = await run(
        ticketCreate(fastify),
        as(1, { subject: 'Custom plan', body: 'We need 40 bots.' }),
    );

    assert.equal(opened['status'], 'open');
    assert.equal(opened['customer'], '+989121234567');

    const ticketId = String(opened['id']);
    const other = { ticketId };

    assert.equal(
        (await run(ticketCreate(fastify), as(1, { subject: ' ', body: 'x' })))['error'],
        'TICKET_EMPTY',
    );

    assert.equal(
        (await run(ticketDetails(fastify), as(2, {}, other)))['error'],
        'TICKET_NOT_FOUND',
        'another customer cannot read it',
    );
    assert.equal(
        (await run(ticketReply(fastify), as(2, { body: 'hi' }, other)))['error'],
        'TICKET_NOT_FOUND',
        'or reply to it',
    );
    assert.equal(
        (await run(ticketStatus(fastify), as(2, { status: 'closed' }, other)))['error'],
        'TICKET_NOT_FOUND',
        'or close it',
    );
    assert.equal(tables.get(TicketMessage)?.rows.length, 1);
    assert.equal(
        ((await run(ticketList(fastify), as(2)))['tickets'] as unknown[]).length,
        0,
        'a customer lists only their own tickets',
    );

    const own = await run(ticketDetails(fastify), as(1, {}, other));

    assert.equal(own['account'], null, 'a customer does not get the account panel');

    const seen = await run(ticketDetails(fastify), as(3, {}, other));

    assert.equal((seen['account'] as Row)['phone'], '+989121234567', 'support sees the customer');

    const answer = await run(ticketReply(fastify), as(3, { body: 'Happy to help.' }, other));

    assert.equal(answer['staff'], true);
    assert.equal(tables.get(Ticket)?.rows[0]?.['status'], 'answered');

    await run(ticketReply(fastify), as(1, { body: 'Thanks!' }, other));

    assert.equal(tables.get(Ticket)?.rows[0]?.['status'], 'open', 'a customer reply reopens it');

    assert.equal(
        (await run(ticketStatus(fastify), as(1, { status: 'closed' }, other)))['status'],
        'closed',
    );

    assert.deepEqual(supportList(fastify).config, { authentication: true, role: ADMIN_ROLE });
    assert.deepEqual(supportPlan(fastify).config, { authentication: true, role: ADMIN_ROLE });
    assert.equal(
        (
            (await run(supportList(fastify), as(3, {}, {}, { status: 'closed' })))[
                'tickets'
            ] as unknown[]
        ).length,
        1,
    );

    assert.equal(
        (
            await run(
                supportPlan(fastify),
                as(3, { plan: 'gold', plan_until: null }, { accountId: '1' }),
            )
        )['error'],
        'PLAN_INVALID',
    );
    assert.equal(
        (
            await run(
                supportPlan(fastify),
                as(3, { plan: 'pro', plan_until: '2026-12-01' }, { accountId: '1' }),
            )
        )['plan'],
        'pro',
    );
    assert.equal(tables.get(Account)?.rows[0]?.['plan'], 'pro');

    console.log('ticket: ok');
}

main();
