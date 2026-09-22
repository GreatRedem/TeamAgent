import type { FastifyInstance } from 'fastify';

import { conversationList, conversationMessages, permissionCatalog, profileDetails, profilePermissionUpdate, telegramWebhook, telegramWebhookRegister } from './telegram.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.post('/telegram/webhook/:botId', telegramWebhook(fastify));

    fastify.get('/team/:id/conversation', conversationList(fastify));
    fastify.get('/team/:id/conversation/:userId', conversationMessages(fastify));

    fastify.get('/team/:id/profile/:profileId', profileDetails(fastify));
    fastify.patch('/team/:id/profile/:profileId/permission', profilePermissionUpdate(fastify));

    fastify.get('/team/:id/permission', permissionCatalog(fastify));

    fastify.post('/team/:id/bot/:botId/webhook', telegramWebhookRegister(fastify));
}
