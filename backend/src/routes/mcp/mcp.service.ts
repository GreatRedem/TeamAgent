import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';

import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TelegramUser, TelegramUserDocument } from '../telegram/telegram.entity.js';
import { TOOLS } from './mcp.tools.js';
import { schemaMcpTools, schemaProfileFiles } from './mcp.schema.js';

import { BadRequestResponse } from '../../utils/response.js';

/** Files per page. Small: every row carries a whole document, not a label. */
const FILE_PAGE = 20;

/**
 * The tool catalog, so the owner can see exactly what an agent is able to do
 * and which permission each capability costs.
 */
export function mcpTools(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({ tools: TOOLS.map((tool) => ({ name: tool.name, description: tool.description, permission: tool.permission })) });
    };

    return { schema: schemaMcpTools, config: { ...authGuard() }, handler };
}

/**
 * The files an agent has written for one person.
 *
 * Read-only over HTTP: these are written on the person's behalf by an agent,
 * and an owner editing them by hand would be changing what the agent believes
 * without the agent ever seeing it happen.
 */
export function profileFiles(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const profileId = readParamId(request, 'profileId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const user = await fastify.db.getRepository(TelegramUser).findOneBy({ id: profileId, team_id: teamId });

        if (!user)
        {
            throw new BadRequestResponse('PROFILE_NOT_FOUND');
        }

        const { limit, offset } = readPage(request, FILE_PAGE);

        // Each row carries a whole document, so a page here is a page of text,
        // not of names -- smaller than the lists that only carry labels.
        const [ rows, total ] = await fastify.db.getRepository(TelegramUserDocument).findAndCount({
            where: { user_id: user.id },
            order: { name: 'ASC' },
            skip: offset,
            take: limit + 1 });

        const { items, has_more } = takePage(rows, limit);

        reply.send({
            limit,
            offset,
            has_more,
            total,
            files: items.map((file) => ({ id: file.id, name: file.name, content: file.content, updated_at: file.updated_at })) });
    };

    return { schema: schemaProfileFiles, config: { ...authGuard() }, handler };
}
