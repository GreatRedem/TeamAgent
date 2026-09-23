import type { FastifyInstance } from 'fastify';

import {
    teamArchive,
    teamBotCreate,
    teamBotList,
    teamBotRemove,
    teamBotTest,
    teamBotUpdate,
    teamCreate,
    teamDetails,
    teamList,
    teamRemove,
    teamRosterMemberRemove,
    teamRosterMemberSave,
    teamRosterRead,
    teamRosterWrite,
    teamUpdate,
} from './team.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.post('/team', teamCreate(fastify));
    fastify.get('/team', teamList(fastify));
    fastify.get('/team/:id', teamDetails(fastify));
    fastify.patch('/team/:id', teamUpdate(fastify));
    fastify.delete('/team/:id', teamRemove(fastify));
    fastify.patch('/team/:id/archive', teamArchive(fastify));

    fastify.get('/team/:id/roster', teamRosterRead(fastify));
    fastify.put('/team/:id/roster', teamRosterWrite(fastify));
    fastify.put('/team/:id/roster/member', teamRosterMemberSave(fastify));
    fastify.delete('/team/:id/roster/member', teamRosterMemberRemove(fastify));

    fastify.post('/team/:id/bot', teamBotCreate(fastify));
    fastify.get('/team/:id/bot', teamBotList(fastify));
    fastify.delete('/team/:id/bot/:botId', teamBotRemove(fastify));
    fastify.patch('/team/:id/bot/:botId', teamBotUpdate(fastify));
    fastify.post('/team/:id/bot/:botId/test', teamBotTest(fastify));
}
