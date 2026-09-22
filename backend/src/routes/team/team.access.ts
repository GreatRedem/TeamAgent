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

/** The largest page a caller may ask for, whatever it sends. */
export const PAGE_LIMIT_MAX = 200;

export interface Page
{
    limit: number;
    offset: number;
}

/**
 * `?limit=&offset=` for the lists that grow without bound -- the audit trail,
 * conversations, messages and model exchanges. The small lists (a team's bots,
 * models, agents) are deliberately not paged: they are bounded by how many a
 * person configures, and paging them would be ceremony around six rows.
 *
 * A bad value is clamped rather than refused. This is a page of a list, not a
 * write: answering `?limit=0` with an error trades a usable response for a
 * pedantic one, and the clamp is what actually protects the database.
 */
export function readPage(request: FastifyRequest, fallback: number): Page
{
    const query = request.query as Record<string, string | undefined>;

    const limit = Number(query['limit']);
    const offset = Number(query['offset']);

    return {
        limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, PAGE_LIMIT_MAX) : fallback,
        offset: Number.isInteger(offset) && offset > 0 ? offset : 0
    };
}

/**
 * Splits a `limit + 1` result into the page and whether anything follows.
 *
 * Every list also returns `total`, from `findAndCount`: the footer shows the
 * range and the total (`1–12 OF 3,481`), so the count is not optional. It is
 * one indexed `COUNT(*)` per page load on tables that grow without bound --
 * the price of a footer that says where you are rather than only "more".
 */
export function takePage<T>(rows: T[], limit: number): { items: T[]; has_more: boolean }
{
    return { items: rows.slice(0, limit), has_more: rows.length > limit };
}

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
