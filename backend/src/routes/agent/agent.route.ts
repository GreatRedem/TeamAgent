import type { FastifyInstance } from 'fastify';

import {
    agentCreate, agentDetails, agentDocumentCreate, agentDocumentRemove,
    agentDocumentUpdate, agentList, agentRemove, agentUpdate } from './agent.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.post('/team/:id/agent', agentCreate(fastify));
    fastify.get('/team/:id/agent', agentList(fastify));
    fastify.get('/team/:id/agent/:agentId', agentDetails(fastify));
    fastify.patch('/team/:id/agent/:agentId', agentUpdate(fastify));
    fastify.delete('/team/:id/agent/:agentId', agentRemove(fastify));

    fastify.post('/team/:id/agent/:agentId/document', agentDocumentCreate(fastify));
    fastify.patch('/team/:id/agent/:agentId/document/:documentId', agentDocumentUpdate(fastify));
    fastify.delete('/team/:id/agent/:agentId/document/:documentId', agentDocumentRemove(fastify));
}
