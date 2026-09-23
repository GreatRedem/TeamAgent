import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authGuard } from '../../plugins/authentication.js';
import { BadRequestResponse } from '../../utils/response.js';
import { audit } from '../audit/audit.log.js';
import { TeamTask } from '../task/task.entity.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TeamBot, TeamModel } from '../team/team.entity.js';
import { TelegramUserDocument } from '../telegram/telegram.entity.js';
import { TeamAgent, TeamAgentDocument, TeamAgentExchange } from './agent.entity.js';
import {
    AGENT_PERMISSIONS,
    DEFAULT_AGENT_PERMISSIONS,
    isKnownAgentPermission,
    parseAgentPermissions,
    serializeAgentPermissions,
} from './agent.permission.js';
import {
    schemaAgentCreate,
    schemaAgentDetails,
    schemaAgentDocumentCreate,
    schemaAgentDocumentRemove,
    schemaAgentDocumentUpdate,
    schemaAgentExchanges,
    schemaAgentList,
    schemaAgentPermissionCatalog,
    schemaAgentPermissionUpdate,
    schemaAgentRemove,
    schemaAgentUpdate,
} from './agent.schema.js';
import {
    DEFAULT_DOCUMENTS,
    DOCUMENT_CONTENT_MAX,
    DOCUMENT_NAME_MAX,
    DOCUMENT_NAME_PATTERN,
} from './agent.template.js';
import { exchangeUsage, NO_USAGE } from './agent.usage.js';

const NAME_MIN = 2;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 280;

const EXCHANGE_PAGE = 40;

const LIST_PAGE = 50;

const readAgentId = (request: FastifyRequest) =>
    readParamId(request, 'agentId', 'AGENT_ID_INVALID');
const readDocumentId = (request: FastifyRequest) =>
    readParamId(request, 'documentId', 'DOCUMENT_ID_INVALID');

function toDocumentView(document: TeamAgentDocument) {
    return {
        id: document.id,
        name: document.name,
        content: document.content,
        updated_at: document.updated_at,
    };
}

function toAgentView(agent: TeamAgent, modelName: string, documentCount: number) {
    return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model_id: agent.model_id,
        model_name: modelName,
        document_count: documentCount,
        permissions: parseAgentPermissions(agent.permissions),
        created_at: agent.created_at,
    };
}

async function findOwnedAgent(
    fastify: FastifyInstance,
    teamId: number,
    agentId: number,
    accountId: number,
): Promise<TeamAgent> {
    await findOwnedTeam(fastify, teamId, accountId);

    const agent = await fastify.db
        .getRepository(TeamAgent)
        .findOneBy({ id: agentId, team_id: teamId });

    if (!agent) {
        throw new BadRequestResponse('AGENT_NOT_FOUND');
    }

    return agent;
}

async function readModelId(
    fastify: FastifyInstance,
    request: FastifyRequest,
    teamId: number,
): Promise<number> {
    const raw = (request.body as { model_id?: unknown } | undefined)?.model_id;

    const modelId = Number(raw);

    if (!Number.isInteger(modelId) || modelId < 1) {
        throw new BadRequestResponse('MODEL_ID_INVALID');
    }

    if (!(await fastify.db.getRepository(TeamModel).findOneBy({ id: modelId, team_id: teamId }))) {
        throw new BadRequestResponse('MODEL_NOT_FOUND');
    }

    return modelId;
}

function readAgentBody(request: FastifyRequest) {
    const name = request.getBody('name').min(NAME_MIN).max(NAME_MAX).asString().trim();
    const description = request.getBody('description').max(DESCRIPTION_MAX).asString().trim();

    if (name.length < NAME_MIN) {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    return { name, description };
}

function readDocumentBody(request: FastifyRequest) {
    const name = request.getBody('name').min(4).max(DOCUMENT_NAME_MAX).asString().trim();
    const content = request.getBody('content').max(DOCUMENT_CONTENT_MAX).asString();

    if (!DOCUMENT_NAME_PATTERN.test(name)) {
        throw new BadRequestResponse('DOCUMENT_NAME_INVALID');
    }

    return { name, content };
}

async function modelNames(fastify: FastifyInstance, teamId: number): Promise<Map<number, string>> {
    const models = await fastify.db.getRepository(TeamModel).findBy({ team_id: teamId });

    return new Map(models.map((model) => [model.id, model.name]));
}

export function agentCreate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { name, description } = readAgentBody(request);
        const modelId = await readModelId(fastify, request, teamId);

        const agent = await fastify.db.getRepository(TeamAgent).save({
            team_id: teamId,
            name,
            description,
            model_id: modelId,
            permissions: serializeAgentPermissions(DEFAULT_AGENT_PERMISSIONS),
        });

        await fastify.db.getRepository(TeamAgentDocument).save(
            DEFAULT_DOCUMENTS.map((document) => ({
                agent_id: agent.id,
                name: document.name,
                content: document.content,
            })),
        );

        request.log.info(
            { module: 'agent', teamId, agentId: agent.id, modelId, accountId: request.account_id },
            'agent created',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.create',
            target: `agent:${agent.id}`,
            detail: `${name} - model ${modelId} - ${DEFAULT_DOCUMENTS.length} files seeded`,
        });

        const names = await modelNames(fastify, teamId);

        reply.send(toAgentView(agent, names.get(modelId) ?? '', DEFAULT_DOCUMENTS.length));
    };

    return { schema: schemaAgentCreate, config: { ...authGuard() }, handler };
}

export function agentList(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const { limit, offset } = readPage(request, LIST_PAGE);

        const [rows, total] = await fastify.db.getRepository(TeamAgent).findAndCount({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items: agents, has_more } = takePage(rows, limit);

        const names = await modelNames(fastify, teamId);

        const counts = new Map<number, number>();

        if (agents.length > 0) {
            const countRows = await fastify.db
                .getRepository(TeamAgentDocument)
                .createQueryBuilder('document')
                .select('document.agent_id', 'agent_id')
                .addSelect('COUNT(*)', 'count')
                .where('document.agent_id IN (:...ids)', { ids: agents.map((agent) => agent.id) })
                .groupBy('document.agent_id')
                .getRawMany<{ agent_id: number; count: string }>();

            for (const row of countRows) {
                counts.set(Number(row.agent_id), Number(row.count));
            }
        }

        const usage = await exchangeUsage(
            fastify,
            teamId,
            'agent_id',
            agents.map((agent) => agent.id),
        );

        reply.send({
            limit,
            offset,
            has_more,
            total,
            agents: agents.map((agent) => ({
                ...toAgentView(agent, names.get(agent.model_id) ?? '', counts.get(agent.id) ?? 0),
                usage: usage.get(agent.id) ?? NO_USAGE,
            })),
        });
    };

    return { schema: schemaAgentList, config: { ...authGuard() }, handler };
}

export function agentDetails(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(
            fastify,
            teamId,
            readAgentId(request),
            request.account_id,
        );

        const documents = await fastify.db
            .getRepository(TeamAgentDocument)
            .find({ where: { agent_id: agent.id }, order: { name: 'ASC' } });

        const names = await modelNames(fastify, teamId);

        reply.send({
            agent: toAgentView(agent, names.get(agent.model_id) ?? '', documents.length),
            documents: documents.map(toDocumentView),
            usage:
                (await exchangeUsage(fastify, teamId, 'agent_id', [agent.id])).get(agent.id) ??
                NO_USAGE,
        });
    };

    return { schema: schemaAgentDetails, config: { ...authGuard() }, handler };
}

export function agentUpdate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(
            fastify,
            teamId,
            readAgentId(request),
            request.account_id,
        );

        const { name, description } = readAgentBody(request);
        const modelId = await readModelId(fastify, request, teamId);

        await fastify.db
            .getRepository(TeamAgent)
            .update({ id: agent.id, team_id: teamId }, { name, description, model_id: modelId });

        const documents = await fastify.db
            .getRepository(TeamAgentDocument)
            .countBy({ agent_id: agent.id });
        const names = await modelNames(fastify, teamId);

        request.log.info(
            { module: 'agent', teamId, agentId: agent.id, modelId, accountId: request.account_id },
            'agent updated',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.update',
            target: `agent:${agent.id}`,
            detail: `${name} - model ${modelId}`,
        });

        reply.send(
            toAgentView(
                { ...agent, name, description, model_id: modelId },
                names.get(modelId) ?? '',
                documents,
            ),
        );
    };

    return { schema: schemaAgentUpdate, config: { ...authGuard() }, handler };
}

export function agentRemove(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agentId = readAgentId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const removed = await fastify.db
            .getRepository(TeamAgent)
            .delete({ id: agentId, team_id: teamId });

        if (removed.affected !== 1) {
            throw new BadRequestResponse('AGENT_NOT_FOUND');
        }

        await fastify.db.getRepository(TeamAgentDocument).delete({ agent_id: agentId });

        // The notes it kept on people go with it; no other agent could read them.
        await fastify.db.getRepository(TelegramUserDocument).delete({ agent_id: agentId });

        // Its waiting tasks are cancelled rather than left to fail each time they come round.
        await fastify.db
            .getRepository(TeamTask)
            .update(
                { team_id: teamId, agent_id: agentId, status: 'scheduled' },
                { status: 'cancelled' },
            );

        const detached = await fastify.db
            .getRepository(TeamBot)
            .update({ team_id: teamId, agent_id: agentId }, { agent_id: 0 });

        request.log.info(
            {
                module: 'agent',
                teamId,
                agentId,
                accountId: request.account_id,
                detachedBots: detached.affected ?? 0,
            },
            'agent removed',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.remove',
            target: `agent:${agentId}`,
            detail: `${detached.affected ?? 0} bot(s) detached`,
        });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaAgentRemove, config: { ...authGuard() }, handler };
}

export function agentDocumentCreate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(
            fastify,
            teamId,
            readAgentId(request),
            request.account_id,
        );

        const { name, content } = readDocumentBody(request);

        const repository = fastify.db.getRepository(TeamAgentDocument);

        if (await repository.findOneBy({ agent_id: agent.id, name })) {
            throw new BadRequestResponse('DOCUMENT_ALREADY_EXISTS');
        }

        const document = await repository.save({ agent_id: agent.id, name, content });

        request.log.info(
            {
                module: 'agent',
                teamId,
                agentId: agent.id,
                documentId: document.id,
                accountId: request.account_id,
            },
            'agent document created',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.document.create',
            target: `agent:${agent.id}`,
            detail: name,
        });

        reply.send(toDocumentView(document));
    };

    return { schema: schemaAgentDocumentCreate, config: { ...authGuard() }, handler };
}

export function agentDocumentUpdate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(
            fastify,
            teamId,
            readAgentId(request),
            request.account_id,
        );
        const documentId = readDocumentId(request);

        const { name, content } = readDocumentBody(request);

        const repository = fastify.db.getRepository(TeamAgentDocument);

        const document = await repository.findOneBy({ id: documentId, agent_id: agent.id });

        if (!document) {
            throw new BadRequestResponse('DOCUMENT_NOT_FOUND');
        }

        const clash = await repository.findOneBy({ agent_id: agent.id, name });

        if (clash && clash.id !== document.id) {
            throw new BadRequestResponse('DOCUMENT_ALREADY_EXISTS');
        }

        await repository.update({ id: document.id, agent_id: agent.id }, { name, content });

        request.log.info(
            {
                module: 'agent',
                teamId,
                agentId: agent.id,
                documentId: document.id,
                accountId: request.account_id,
            },
            'agent document updated',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.document.update',
            target: `agent:${agent.id}`,
            detail: `${name} - ${content.length} chars`,
        });

        reply.send(toDocumentView({ ...document, name, content, updated_at: new Date() }));
    };

    return { schema: schemaAgentDocumentUpdate, config: { ...authGuard() }, handler };
}

export function agentDocumentRemove(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(
            fastify,
            teamId,
            readAgentId(request),
            request.account_id,
        );
        const documentId = readDocumentId(request);

        const removed = await fastify.db
            .getRepository(TeamAgentDocument)
            .delete({ id: documentId, agent_id: agent.id });

        if (removed.affected !== 1) {
            throw new BadRequestResponse('DOCUMENT_NOT_FOUND');
        }

        request.log.info(
            {
                module: 'agent',
                teamId,
                agentId: agent.id,
                documentId,
                accountId: request.account_id,
            },
            'agent document removed',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.document.remove',
            target: `agent:${agent.id}`,
            detail: `document ${documentId}`,
        });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaAgentDocumentRemove, config: { ...authGuard() }, handler };
}

export function agentPermissionCatalog(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({ permissions: AGENT_PERMISSIONS });
    };

    return { schema: schemaAgentPermissionCatalog, config: { ...authGuard() }, handler };
}

export function agentPermissionUpdate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(
            fastify,
            teamId,
            readAgentId(request),
            request.account_id,
        );

        const requested = (request.body as { permissions?: unknown } | undefined)?.permissions;

        if (!Array.isArray(requested) || requested.some((key) => typeof key !== 'string')) {
            throw new BadRequestResponse('PERMISSIONS_INVALID');
        }

        for (const key of requested as string[]) {
            if (!isKnownAgentPermission(key)) {
                throw new BadRequestResponse('PERMISSION_UNKNOWN');
            }
        }

        const permissions = serializeAgentPermissions(requested as string[]);

        await fastify.db
            .getRepository(TeamAgent)
            .update({ id: agent.id, team_id: teamId }, { permissions });

        const documents = await fastify.db
            .getRepository(TeamAgentDocument)
            .countBy({ agent_id: agent.id });
        const names = await modelNames(fastify, teamId);

        request.log.info(
            {
                module: 'agent',
                teamId,
                agentId: agent.id,
                accountId: request.account_id,
                permissions,
            },
            'agent permissions updated',
        );

        await audit(fastify, request.log, {
            teamId,
            accountId: request.account_id,
            action: 'agent.permissions',
            target: `agent:${agent.id}`,
            detail: `${agent.name} -> ${permissions === '' ? 'none' : permissions}`,
        });

        reply.send(
            toAgentView({ ...agent, permissions }, names.get(agent.model_id) ?? '', documents),
        );
    };

    return { schema: schemaAgentPermissionUpdate, config: { ...authGuard() }, handler };
}

// One model round-trip as the agent and model pages show it. `agentName` is empty for an agent
// since removed.
export function exchangeView(exchange: TeamAgentExchange, agentName: string) {
    return {
        id: exchange.id,
        agent_id: exchange.agent_id,
        agent_name: agentName,
        user_id: exchange.user_id,
        round: exchange.round,
        request: exchange.request,
        response: exchange.response,
        tool_calls: exchange.tool_calls,
        prompt_tokens: exchange.prompt_tokens,
        completion_tokens: exchange.completion_tokens,
        tokens_estimated: exchange.tokens_estimated,
        duration_ms: exchange.duration_ms,
        outcome: exchange.outcome,
        reason: exchange.reason,
        created_at: exchange.created_at,
    };
}

export function agentExchanges(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agent = await findOwnedAgent(
            fastify,
            teamId,
            readAgentId(request),
            request.account_id,
        );

        const { limit, offset } = readPage(request, EXCHANGE_PAGE);

        const [rows, total] = await fastify.db.getRepository(TeamAgentExchange).findAndCount({
            where: { team_id: teamId, agent_id: agent.id },
            order: { id: 'DESC' },
            skip: offset,
            take: limit + 1,
        });

        const { items, has_more } = takePage(rows, limit);

        reply.send({
            limit,
            offset,
            has_more,
            total,
            exchanges: items.map((exchange) => exchangeView(exchange, agent.name)),
        });
    };

    return { schema: schemaAgentExchanges, config: { ...authGuard() }, handler };
}
