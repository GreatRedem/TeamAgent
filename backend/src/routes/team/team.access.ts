import type { FastifyInstance, FastifyRequest } from 'fastify';

import { Team } from './team.entity.js';

import { BadRequestResponse } from '../../utils/response.js';

/**
 * Shared route-parameter and ownership checks.
 *
 * These live here rather than in each service because every module hanging off
 * `/team/:id` needs the same two things, and an authorisation check copied per
 * module is one that eventually drifts in a single copy.
 */

/**
 * `request.getBody(...)` only reads the body, and the builder has no number
 * rule, so a route parameter is parsed here instead. `Number` rather than
 * `Number.parseInt`, which would read '12abc' as 12.
 */
export function readParamId(request: FastifyRequest, key: string, result: string): number
{
    const parsed = Number((request.params as Record<string, string | undefined>)[key]);

    if (!Number.isInteger(parsed) || parsed < 1)
    {
        throw new BadRequestResponse(result);
    }

    return parsed;
}

export const readTeamId = (request: FastifyRequest) => readParamId(request, 'id', 'TEAM_ID_INVALID');

/**
 * Scoped to the caller on purpose: a team owned by another account answers the
 * same as one that was never created, so the endpoint does not confirm which
 * ids exist.
 */
export async function findOwnedTeam(fastify: FastifyInstance, id: number, accountId: number): Promise<Team>
{
    const team = await fastify.db.getRepository(Team).findOneBy({ id, account_id: accountId });

    if (!team)
    {
        throw new BadRequestResponse('TEAM_NOT_FOUND');
    }

    return team;
}
