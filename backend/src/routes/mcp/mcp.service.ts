import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';
import { BadRequestResponse } from '../../utils/response.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TelegramUser, TelegramUserDocument } from '../telegram/telegram.entity.js';
import { schemaMcpTools, schemaProfileFiles } from './mcp.schema.js';
import { TOOLS } from './mcp.tools.js';

const FILE_PAGE = 20;

export function mcpTools(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({
            tools: TOOLS.map((tool) => ({
                name: tool.name,
                description: tool.description,
                permission: tool.permission,
            })),
        });
    };

    return { schema: schemaMcpTools, config: { ...authGuard() }, handler };
}

export function profileFiles(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const profileId = readParamId(request, 'profileId', 'PROFILE_ID_INVALID');

        await findOwnedTeam(fastify, teamId, request.account_id);

        const user = await fastify.db
            .getRepository(TelegramUser)
            .findOneBy({ id: profileId, team_id: teamId });

        if (!user) {
            throw new BadRequestResponse('PROFILE_NOT_FOUND');
        }

        const { limit, offset } = readPage(request, FILE_PAGE);

        const [rows, total] = await fastify.db.getRepository(TelegramUserDocument).findAndCount({
            where: { user_id: user.id },
            order: { name: 'ASC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        reply.send({
            limit,
            offset,
            has_more,
            total,
            files: items.map((file) => ({
                id: file.id,
                name: file.name,
                content: file.content,
                updated_at: file.updated_at,
            })),
        });
    };

    return { schema: schemaProfileFiles, config: { ...authGuard() }, handler };
}
