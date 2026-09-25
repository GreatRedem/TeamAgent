import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { In } from 'typeorm';
import {
    ADMIN_ROLE,
    PLANS,
    TICKET_BODY_MAX,
    TICKET_MESSAGES_MAX,
    TICKET_PAGE,
    TICKET_STATUSES,
    TICKET_SUBJECT_MAX,
} from '../../constant.js';

import { authGuard, authRole } from '../../plugins/authentication.js';
import { bodyField } from '../../plugins/validator.js';
import { BadRequestResponse } from '../../utils/response.js';
import { Account } from '../account/account.entity.js';
import { activePlan } from '../account/account.plan.js';
import { audit } from '../audit/audit.log.js';
import { readPage, readParamId, takePage } from '../team/team.access.js';
import { Ticket, TicketMessage } from './ticket.entity.js';
import {
    schemaSupportList,
    schemaSupportPlan,
    schemaTicketCreate,
    schemaTicketDetails,
    schemaTicketList,
    schemaTicketReply,
    schemaTicketStatus,
} from './ticket.schema.js';

function isStaff(request: FastifyRequest): boolean {
    return request.account_role >= ADMIN_ROLE;
}

function customerLabel(account: Account | null | undefined, accountId: number): string {
    return account?.phone ?? account?.wallet ?? `#${accountId}`;
}

function readText(raw: unknown, field: string, max: number): string {
    const text = bodyField(raw, field).max(max).asString().trim();

    if (text === '') {
        throw new BadRequestResponse('TICKET_EMPTY');
    }

    return text;
}

async function ticketViews(fastify: FastifyInstance, tickets: Ticket[]) {
    const ids = [...new Set(tickets.map((ticket) => ticket.account_id))];
    const accounts =
        ids.length === 0 ? [] : await fastify.db.getRepository(Account).findBy({ id: In(ids) });

    return tickets.map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        customer: customerLabel(
            accounts.find((account) => account.id === ticket.account_id),
            ticket.account_id,
        ),
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
    }));
}

export async function visibleTicket(
    fastify: FastifyInstance,
    request: FastifyRequest,
): Promise<Ticket> {
    const ticket = await fastify.db
        .getRepository(Ticket)
        .findOneBy({ id: readParamId(request, 'ticketId', 'TICKET_ID_INVALID') });

    if (!ticket || (ticket.account_id !== request.account_id && !isStaff(request))) {
        throw new BadRequestResponse('TICKET_NOT_FOUND');
    }

    return ticket;
}

async function listTickets(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply,
    where: Partial<Pick<Ticket, 'account_id' | 'status'>>,
) {
    const { limit, offset } = readPage(request, TICKET_PAGE);

    const [rows, total] = await fastify.db.getRepository(Ticket).findAndCount({
        where,
        order: { updated_at: 'DESC', id: 'DESC' },
        skip: offset,
        take: limit + 1,
    });

    const { items, has_more } = takePage(rows, limit);

    reply.send({ limit, offset, has_more, total, tickets: await ticketViews(fastify, items) });
}

export function ticketList(fastify: FastifyInstance) {
    const handler = (request: FastifyRequest, reply: FastifyReply) =>
        listTickets(fastify, request, reply, { account_id: request.account_id });

    return { schema: schemaTicketList(), config: { ...authGuard() }, handler };
}

export function supportList(fastify: FastifyInstance) {
    const handler = (request: FastifyRequest, reply: FastifyReply) => {
        const status = (request.query as Record<string, unknown>)['status'];

        return listTickets(
            fastify,
            request,
            reply,
            typeof status === 'string' && TICKET_STATUSES.includes(status) ? { status } : {},
        );
    };

    return {
        schema: schemaSupportList(),
        config: { ...authGuard(), ...authRole(ADMIN_ROLE) },
        handler,
    };
}

export function ticketCreate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const subject = readText(request.body, 'subject', TICKET_SUBJECT_MAX);
        const body = readText(request.body, 'body', TICKET_BODY_MAX);

        const ticket = await fastify.db
            .getRepository(Ticket)
            .save({ account_id: request.account_id, subject, status: 'open' });

        await fastify.db
            .getRepository(TicketMessage)
            .save({ ticket_id: ticket.id, account_id: request.account_id, staff: false, body });

        await audit(fastify, request.log, {
            accountId: request.account_id,
            action: 'ticket.create',
            target: `ticket:${ticket.id}`,
            detail: subject,
            changes: { subject },
        });

        const [view] = await ticketViews(fastify, [ticket]);

        reply.send(view);
    };

    return { schema: schemaTicketCreate(), config: { ...authGuard() }, handler };
}

export function ticketDetails(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const ticket = await visibleTicket(fastify, request);

        const messages = await fastify.db.getRepository(TicketMessage).find({
            where: { ticket_id: ticket.id },
            order: { id: 'ASC' },
            take: TICKET_MESSAGES_MAX,
        });

        const account = isStaff(request)
            ? await fastify.db.getRepository(Account).findOneBy({ id: ticket.account_id })
            : null;

        const [view] = await ticketViews(fastify, [ticket]);

        reply.send({
            ticket: view,
            messages: messages.map((message) => ({
                id: message.id,
                staff: message.staff,
                body: message.body,
                created_at: message.created_at,
            })),
            account:
                account === null
                    ? null
                    : {
                          id: account.id,
                          wallet: account.wallet,
                          phone: account.phone,
                          plan: activePlan(account).key,
                          chosen_plan: account.plan,
                          plan_until: account.plan_until?.toISOString() ?? null,
                      },
        });
    };

    return { schema: schemaTicketDetails(), config: { ...authGuard() }, handler };
}

export function ticketReply(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const ticket = await visibleTicket(fastify, request);
        const body = readText(request.body, 'body', TICKET_BODY_MAX);
        const staff = isStaff(request) && ticket.account_id !== request.account_id;

        if (
            (await fastify.db.getRepository(TicketMessage).countBy({ ticket_id: ticket.id })) >=
            TICKET_MESSAGES_MAX
        ) {
            throw new BadRequestResponse('TICKET_FULL');
        }

        const message = await fastify.db
            .getRepository(TicketMessage)
            .save({ ticket_id: ticket.id, account_id: request.account_id, staff, body });

        await fastify.db
            .getRepository(Ticket)
            .update(
                { id: ticket.id },
                { status: staff ? 'answered' : 'open', updated_at: new Date() },
            );

        await audit(fastify, request.log, {
            accountId: request.account_id,
            action: 'ticket.reply',
            target: `ticket:${ticket.id}`,
            detail: `${ticket.subject} · ${staff ? 'support replied' : 'customer wrote'}`,
            changes: { ticket_id: ticket.id, staff },
        });

        reply.send({
            id: message.id,
            staff: message.staff,
            body: message.body,
            created_at: message.created_at,
        });
    };

    return { schema: schemaTicketReply(), config: { ...authGuard() }, handler };
}

export function ticketStatus(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const ticket = await visibleTicket(fastify, request);
        const status = (request.body as { status: 'open' | 'closed' }).status;

        await fastify.db.getRepository(Ticket).update({ id: ticket.id }, { status });

        await audit(fastify, request.log, {
            accountId: request.account_id,
            action: 'ticket.status',
            target: `ticket:${ticket.id}`,
            detail: `${ticket.subject} · ${ticket.status} -> ${status}`,
            changes: { from: ticket.status, to: status },
        });

        const [view] = await ticketViews(fastify, [{ ...ticket, status }]);

        reply.send(view);
    };

    return { schema: schemaTicketStatus(), config: { ...authGuard() }, handler };
}

export function supportPlan(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const accountId = readParamId(request, 'accountId', 'ACCOUNT_NOT_FOUND');
        const { plan, plan_until } = request.body as { plan: string; plan_until: string | null };
        const until = plan_until === null ? null : new Date(plan_until);

        if (!PLANS.some((candidate) => candidate.key === plan)) {
            throw new BadRequestResponse('PLAN_INVALID');
        }

        if (until !== null && Number.isNaN(until.getTime())) {
            throw new BadRequestResponse('PLAN_UNTIL_INVALID');
        }

        const account = await fastify.db.getRepository(Account).findOneBy({ id: accountId });

        if (!account) {
            throw new BadRequestResponse('ACCOUNT_NOT_FOUND');
        }

        await fastify.db
            .getRepository(Account)
            .update({ id: accountId }, { plan, plan_until: until });

        await audit(fastify, request.log, {
            accountId: request.account_id,
            action: 'account.plan',
            target: `account:${accountId}`,
            detail: `${customerLabel(account, accountId)} · ${account.plan} -> ${plan}${until === null ? '' : ` until ${until.toISOString().slice(0, 10)}`}`,
            changes: {
                account_id: accountId,
                from: { plan: account.plan, plan_until: account.plan_until },
                to: { plan, plan_until: until },
            },
        });

        reply.send({ plan, plan_until: until?.toISOString() ?? null });
    };

    return {
        schema: schemaSupportPlan(),
        config: { ...authGuard(), ...authRole(ADMIN_ROLE) },
        handler,
    };
}
