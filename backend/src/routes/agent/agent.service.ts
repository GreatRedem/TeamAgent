import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';

import { TeamBot, TeamModel } from '../team/team.entity.js';
import { findOwnedTeam, readParamId, readTeamId } from '../team/team.access.js';
import { TeamAgent, TeamAgentDocument, TeamAgentExchange } from './agent.entity.js';
import { AGENT_PERMISSIONS, DEFAULT_AGENT_PERMISSIONS, isKnownAgentPermission, parseAgentPermissions, serializeAgentPermissions } from './agent.permission.js';
import { DEFAULT_DOCUMENTS, DOCUMENT_CONTENT_MAX, DOCUMENT_NAME_MAX, DOCUMENT_NAME_PATTERN } from './agent.template.js';
import {
    schemaAgentCreate, schemaAgentDetails, schemaAgentDocumentCreate, schemaAgentDocumentRemove,
    schemaAgentDocumentUpdate, schemaAgentExchanges, schemaAgentList, schemaAgentPermissionCatalog,
    schemaAgentPermissionUpdate, schemaAgentRemove, schemaAgentUpdate } from './agent.schema.js';

import { audit } from '../audit/audit.log.js';

import { BadRequestResponse } from '../../utils/response.js';

const NAME_MIN = 2;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 280;

const readAgentId = (request: FastifyRequest) => readParamId(request, 'agentId', 'AGENT_ID_INVALID');
const readDocumentId = (request: FastifyRequest) => readParamId(request, 'documentId', 'DOCUMENT_ID_INVALID');

function toDocumentView(document: TeamAgentDocument)
{
    return { id: document.id, name: document.name, content: document.content, updated_at: document.updated_at };
}

function toAgentView(agent: TeamAgent, modelName: string, documentCount: number)
{
    return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model_id: agent.model_id,
        // Empty when the attached model has been removed, which the client
        // shows as "no model" rather than a broken id.
        model_name: modelName,
        document_count: documentCount,
        permissions: parseAgentPermissions(agent.permissions),
        created_at: agent.created_at
    };
}

async function findOwnedAgent(fastify: FastifyInstance, teamId: number, agentId: number, accountId: number): Promise<TeamAgent>
{
    await findOwnedTeam(fastify, teamId, accountId);

    const agent = await fastify.db.getRepository(TeamAgent).findOneBy({ id: agentId, team_id: teamId });

    if (!agent)
    {
        throw new BadRequestResponse('AGENT_NOT_FOUND');
    }

    return agent;
}

/**
 * The model must belong to the same team.
 *
 * Without this check an agent could be pointed at another account's model by
 * id, and every message it sent would be billed to, and logged against, that
 * account's key.
 */
async function readModelId(fastify: FastifyInstance, request: FastifyRequest, teamId: number): Promise<number>
{
    const raw = (request.body as { model_id?: unknown } | undefined)?.model_id;

    const modelId = Number(raw);

    if (!Number.isInteger(modelId) || modelId < 1)
    {
        throw new BadRequestResponse('MODEL_ID_INVALID');
    }

    if (!await fastify.db.getRepository(TeamModel).findOneBy({ id: modelId, team_id: teamId }))
    {
        throw new BadRequestResponse('MODEL_NOT_FOUND');
    }

    return modelId;
}

function readAgentBody(request: FastifyRequest)
{
    const name = request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim();
    const description = request.getBody('description').max(DESCRIPTION_MAX).asString().trim();

    if (name.length < NAME_MIN)
    {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    return { name, description };
}

function readDocumentBody(request: FastifyRequest)
{
    const name = request.getBody('name').min(4).max(DOCUMENT_NAME_MAX).asString().trim();
    const content = request.getBody('content').max(DOCUMENT_CONTENT_MAX).asString();

    // The name is an identifier inside the agent, so it is constrained rather
    // than accepted as free text -- no paths, no spaces, always markdown.
    if (!DOCUMENT_NAME_PATTERN.test(name))
    {
        throw new BadRequestResponse('DOCUMENT_NAME_INVALID');
    }

    return { name, content };
}

/** Names of every model the team owns, for labelling agents in one query. */
async function modelNames(fastify: FastifyInstance, teamId: number): Promise<Map<number, string>>
{
    const models = await fastify.db.getRepository(TeamModel).findBy({ team_id: teamId });

    return new Map(models.map((model) => [ model.id, model.name ]));
}

export function agentCreate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { name, description } = readAgentBody(request);
        const modelId = await readModelId(fastify, request, teamId);

        const agent = await fastify.db.getRepository(TeamAgent).save({
            team_id: teamId,
            name,
            description,
            model_id: modelId,
            permissions: serializeAgentPermissions(DEFAULT_AGENT_PERMISSIONS) });

        // Seeded from the template, then owned by the team: later template
        // changes do not rewrite an existing agent's documents.
        await fastify.db.getRepository(TeamAgentDocument).save(
            DEFAULT_DOCUMENTS.map((document) => ({ agent_id: agent.id, name: document.name, content: document.content })));

        request.log.info({ module: 'agent', teamId, agentId: agent.id, modelId, accountId: request.account_id }, 'agent created');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'agent.create', target: `agent:${ agent.id }`, detail: `${ name } - model ${ modelId } - ${ DEFAULT_DOCUMENTS.length } files seeded` });

        const names = await modelNames(fastify, teamId);

        reply.send(toAgentView(agent, names.get(modelId) ?? '', DEFAULT_DOCUMENTS.length));
    };

    return { schema: schemaAgentCreate, config: { ...authGuard() }, handler };
}

export function agentList(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const agents = await fastify.db.getRepository(TeamAgent).find({ where: { team_id: teamId }, order: { id: 'DESC' } });

        const names = await modelNames(fastify, teamId);

        // Counted in one grouped query rather than one per agent.
        const counts = new Map<number, number>();

        if (agents.length > 0)
        {
            const rows = await fastify.db.getRepository(TeamAgentDocument)
                .createQueryBuilder('document')
                .select('document.agent_id', 'agent_id')
                .addSelect('COUNT(*)', 'count')
                .where('document.agent_id IN (:...ids)', { ids: agents.map((agent) => agent.id) })
                .groupBy('document.agent_id')
                .getRawMany<{ agent_id: number; count: string }>();

            for (const row of rows)
            {
                counts.set(Number(row.agent_id), Number(row.count));
            }
        }

        reply.send({ agents: agents.map((agent) => toAgentView(agent, names.get(agent.model_id) ?? '', counts.get(agent.id) ?? 0)) });
    };

    return { schema: schemaAgentList, config: { ...authGuard() }, handler };
}

export function agentDetails(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(fastify, teamId, readAgentId(request), request.account_id);

        const documents = await fastify.db.getRepository(TeamAgentDocument).find({ where: { agent_id: agent.id }, order: { name: 'ASC' } });

        const names = await modelNames(fastify, teamId);

        reply.send({
            agent: toAgentView(agent, names.get(agent.model_id) ?? '', documents.length),
            documents: documents.map(toDocumentView) });
    };

    return { schema: schemaAgentDetails, config: { ...authGuard() }, handler };
}

export function agentUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(fastify, teamId, readAgentId(request), request.account_id);

        const { name, description } = readAgentBody(request);
        const modelId = await readModelId(fastify, request, teamId);

        await fastify.db.getRepository(TeamAgent).update({ id: agent.id, team_id: teamId }, { name, description, model_id: modelId });

        const documents = await fastify.db.getRepository(TeamAgentDocument).countBy({ agent_id: agent.id });
        const names = await modelNames(fastify, teamId);

        request.log.info({ module: 'agent', teamId, agentId: agent.id, modelId, accountId: request.account_id }, 'agent updated');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'agent.update', target: `agent:${ agent.id }`, detail: `${ name } - model ${ modelId }` });

        reply.send(toAgentView({ ...agent, name, description, model_id: modelId }, names.get(modelId) ?? '', documents));
    };

    return { schema: schemaAgentUpdate, config: { ...authGuard() }, handler };
}

export function agentRemove(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agentId = readAgentId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const removed = await fastify.db.getRepository(TeamAgent).delete({ id: agentId, team_id: teamId });

        if (removed.affected !== 1)
        {
            throw new BadRequestResponse('AGENT_NOT_FOUND');
        }

        // No cascade is configured, so the documents are removed explicitly --
        // otherwise they would outlive the agent and leak into a reused id.
        await fastify.db.getRepository(TeamAgentDocument).delete({ agent_id: agentId });

        // Bots answering through this agent fall silent rather than pointing at
        // an id that no longer resolves.
        const detached = await fastify.db.getRepository(TeamBot).update({ team_id: teamId, agent_id: agentId }, { agent_id: 0 });

        request.log.info({ module: 'agent', teamId, agentId, accountId: request.account_id, detachedBots: detached.affected ?? 0 }, 'agent removed');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'agent.remove', target: `agent:${ agentId }`, detail: `${ detached.affected ?? 0 } bot(s) detached` });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaAgentRemove, config: { ...authGuard() }, handler };
}

export function agentDocumentCreate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(fastify, teamId, readAgentId(request), request.account_id);

        const { name, content } = readDocumentBody(request);

        const repository = fastify.db.getRepository(TeamAgentDocument);

        if (await repository.findOneBy({ agent_id: agent.id, name }))
        {
            throw new BadRequestResponse('DOCUMENT_ALREADY_EXISTS');
        }

        const document = await repository.save({ agent_id: agent.id, name, content });

        request.log.info({ module: 'agent', teamId, agentId: agent.id, documentId: document.id, accountId: request.account_id }, 'agent document created');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'agent.document.create', target: `agent:${ agent.id }`, detail: name });

        reply.send(toDocumentView(document));
    };

    return { schema: schemaAgentDocumentCreate, config: { ...authGuard() }, handler };
}

export function agentDocumentUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(fastify, teamId, readAgentId(request), request.account_id);
        const documentId = readDocumentId(request);

        const { name, content } = readDocumentBody(request);

        const repository = fastify.db.getRepository(TeamAgentDocument);

        // Matched on the agent too, so a document id from another agent cannot
        // be edited through one the caller happens to own.
        const document = await repository.findOneBy({ id: documentId, agent_id: agent.id });

        if (!document)
        {
            throw new BadRequestResponse('DOCUMENT_NOT_FOUND');
        }

        const clash = await repository.findOneBy({ agent_id: agent.id, name });

        if (clash && clash.id !== document.id)
        {
            throw new BadRequestResponse('DOCUMENT_ALREADY_EXISTS');
        }

        await repository.update({ id: document.id, agent_id: agent.id }, { name, content });

        request.log.info({ module: 'agent', teamId, agentId: agent.id, documentId: document.id, accountId: request.account_id }, 'agent document updated');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'agent.document.update', target: `agent:${ agent.id }`, detail: `${ name } - ${ content.length } chars` });

        reply.send(toDocumentView({ ...document, name, content, updated_at: new Date() }));
    };

    return { schema: schemaAgentDocumentUpdate, config: { ...authGuard() }, handler };
}

export function agentDocumentRemove(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(fastify, teamId, readAgentId(request), request.account_id);
        const documentId = readDocumentId(request);

        const removed = await fastify.db.getRepository(TeamAgentDocument).delete({ id: documentId, agent_id: agent.id });

        if (removed.affected !== 1)
        {
            throw new BadRequestResponse('DOCUMENT_NOT_FOUND');
        }

        request.log.info({ module: 'agent', teamId, agentId: agent.id, documentId, accountId: request.account_id }, 'agent document removed');

        await audit(fastify, request.log, { teamId, accountId: request.account_id, action: 'agent.document.remove', target: `agent:${ agent.id }`, detail: `document ${ documentId }` });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaAgentDocumentRemove, config: { ...authGuard() }, handler };
}

export function agentPermissionCatalog(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({ permissions: AGENT_PERMISSIONS });
    };

    return { schema: schemaAgentPermissionCatalog, config: { ...authGuard() }, handler };
}

/** Replaces an agent's capabilities with exactly what was sent. */
export function agentPermissionUpdate(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(fastify, teamId, readAgentId(request), request.account_id);

        const requested = (request.body as { permissions?: unknown } | undefined)?.permissions;

        if (!Array.isArray(requested) || requested.some((key) => typeof key !== 'string'))
        {
            throw new BadRequestResponse('PERMISSIONS_INVALID');
        }

        // Rejected rather than quietly dropped: reporting success for a
        // capability that was never granted is worse than an error.
        for (const key of requested as string[])
        {
            if (!isKnownAgentPermission(key))
            {
                throw new BadRequestResponse('PERMISSION_UNKNOWN');
            }
        }

        const permissions = serializeAgentPermissions(requested as string[]);

        await fastify.db.getRepository(TeamAgent).update({ id: agent.id, team_id: teamId }, { permissions });

        const documents = await fastify.db.getRepository(TeamAgentDocument).countBy({ agent_id: agent.id });
        const names = await modelNames(fastify, teamId);

        request.log.info({ module: 'agent', teamId, agentId: agent.id, accountId: request.account_id, permissions }, 'agent permissions updated');

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.permissions',
            target: `agent:${ agent.id }`,
            detail: `${ agent.name } -> ${ permissions === '' ? 'none' : permissions }` });

        reply.send(toAgentView({ ...agent, permissions }, names.get(agent.model_id) ?? '', documents));
    };

    return { schema: schemaAgentPermissionUpdate, config: { ...authGuard() }, handler };
}

/** The recorded conversation between this agent and its model, newest first. */
export function agentExchanges(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(fastify, teamId, readAgentId(request), request.account_id);

        const exchanges = await fastify.db.getRepository(TeamAgentExchange).find({
            where: { team_id: teamId, agent_id: agent.id },
            order: { id: 'DESC' },
            take: 40 });

        reply.send({
            exchanges: exchanges.map((exchange) => ({
                id: exchange.id,
                user_id: exchange.user_id,
                round: exchange.round,
                request: exchange.request,
                response: exchange.response,
                tool_calls: exchange.tool_calls,
                duration_ms: exchange.duration_ms,
                outcome: exchange.outcome,
                reason: exchange.reason,
                created_at: exchange.created_at
            })) });
    };

    return { schema: schemaAgentExchanges, config: { ...authGuard() }, handler };
}
