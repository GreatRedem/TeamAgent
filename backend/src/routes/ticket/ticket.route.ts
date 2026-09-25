import type { FastifyInstance } from 'fastify';

import {
    supportList,
    supportPlan,
    ticketCreate,
    ticketDetails,
    ticketList,
    ticketReply,
    ticketStatus,
} from './ticket.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.get('/ticket', ticketList(fastify));
    fastify.post('/ticket', ticketCreate(fastify));
    fastify.get('/ticket/:ticketId', ticketDetails(fastify));
    fastify.post('/ticket/:ticketId/message', ticketReply(fastify));
    fastify.patch('/ticket/:ticketId', ticketStatus(fastify));
    fastify.get('/support/ticket', supportList(fastify));
    fastify.patch('/support/account/:accountId', supportPlan(fastify));
}
