import type { FastifyInstance, FastifyRequest } from 'fastify';

import { BadRequestResponse } from '../../utils/response.js';
import { Team } from './team.entity.js';

export function readParamId(request: FastifyRequest, key: string, result: string): number {
    const parsed = Number((request.params as Record<string, string | undefined>)[key]);

    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new BadRequestResponse(result);
    }

    return parsed;
}

export const readTeamId = (request: FastifyRequest) =>
    readParamId(request, 'id', 'TEAM_ID_INVALID');

export const PAGE_LIMIT_MAX = 200;

export interface Page {
    limit: number;
    offset: number;
}

export function readPage(request: FastifyRequest, fallback: number): Page {
    const query = request.query as Record<string, string | undefined>;

    const limit = Number(query['limit']);
    const offset = Number(query['offset']);

    return {
        limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, PAGE_LIMIT_MAX) : fallback,
        offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
    };
}

export function takePage<T>(rows: T[], limit: number): { items: T[]; has_more: boolean } {
    return { items: rows.slice(0, limit), has_more: rows.length > limit };
}

export async function findOwnedTeam(
    fastify: FastifyInstance,
    id: number,
    accountId: number,
): Promise<Team> {
    const team = await fastify.db.getRepository(Team).findOneBy({ id, account_id: accountId });

    if (!team) {
        throw new BadRequestResponse('TEAM_NOT_FOUND');
    }

    return team;
}
