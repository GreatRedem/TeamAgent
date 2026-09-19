import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';

import { Team } from './team.entity.js';
import { schemaTeamCreate, schemaTeamDetails, schemaTeamList, schemaTeamUpdate } from './team.schema.js';

import { BadRequestResponse } from '../../utils/response.js';

const NAME_MIN = 2;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 280;

/**
 * `request.getBody(...)` only reads the body, and the builder has no number
 * rule, so a route parameter is parsed here instead. `Number.parseInt` would
 * accept '12abc', hence the round-trip comparison.
 */
function readTeamId(request: FastifyRequest): number
{
    const { id } = request.params as { id?: string };

    const parsed = Number(id);

    if (!Number.isInteger(parsed) || parsed < 1)
    {
        throw new BadRequestResponse('TEAM_ID_INVALID');
    }

    return parsed;
}

/**
 * Scoped to the caller on purpose: a team owned by another account answers the
 * same as one that was never created, so the endpoint does not confirm which
 * ids exist.
 */
async function findOwnedTeam(fastify: FastifyInstance, id: number, accountId: number): Promise<Team>
{
    const team = await fastify.db.getRepository(Team).findOneBy({ id, account_id: accountId });

    if (!team)
    {
        throw new BadRequestResponse('TEAM_NOT_FOUND');
    }

    return team;
}

// `description` is required rather than optional because the validator builder
// has no notion of an absent field -- the client sends '' for "none".
function readTeamBody(request: FastifyRequest)
{
    return {
        name: request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim(),
        description: request.getBody('description').max(DESCRIPTION_MAX).asString().trim()
    };
}

export function teamCreate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const { name, description } = readTeamBody(request);

        if (name.length < NAME_MIN)
        {
            throw new BadRequestResponse('ERROR_MIN_LENGTH');
        }

        const team = await fastify.db.getRepository(Team).save({ name, description, account_id: request.account_id });

        request.log.info({ module: 'team', teamId: team.id, accountId: request.account_id }, 'team created');

        reply.send(team);
    };

    return { schema: schemaTeamCreate, config: { ...authGuard() }, handler };
}

export function teamList(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teams = await fastify.db.getRepository(Team).find({ where: { account_id: request.account_id }, order: { id: 'DESC' } });

        reply.send({ teams });
    };

    return { schema: schemaTeamList, config: { ...authGuard() }, handler };
}

export function teamDetails(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const team = await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send(team);
    };

    return { schema: schemaTeamDetails, config: { ...authGuard() }, handler };
}

export function teamUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const id = readTeamId(request);

        const { name, description } = readTeamBody(request);

        if (name.length < NAME_MIN)
        {
            throw new BadRequestResponse('ERROR_MIN_LENGTH');
        }

        // Establishes ownership before the write; the update itself repeats the
        // account filter so the row cannot change hands between the two.
        await findOwnedTeam(fastify, id, request.account_id);

        await fastify.db.getRepository(Team).update({ id, account_id: request.account_id }, { name, description });

        const team = await findOwnedTeam(fastify, id, request.account_id);

        request.log.info({ module: 'team', teamId: id, accountId: request.account_id }, 'team updated');

        reply.send(team);
    };

    return { schema: schemaTeamUpdate, config: { ...authGuard() }, handler };
}
