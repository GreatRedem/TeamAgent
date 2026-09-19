import type { FastifyInstance } from 'fastify';

import { conversationList, conversationMessages, telegramWebhook, telegramWebhookRegister } from './telegram.service.js';

export default async function(fastify: FastifyInstance)
{
    // Called by Telegram, not by the client: no session, guarded by the bot's
    // webhook secret instead.
    fastify.post('/telegram/webhook/:botId', telegramWebhook(fastify));

    fastify.get('/team/:id/conversation', conversationList(fastify));
    fastify.get('/team/:id/conversation/:userId', conversationMessages(fastify));

    fastify.post('/team/:id/bot/:botId/webhook', telegramWebhookRegister(fastify));
}
