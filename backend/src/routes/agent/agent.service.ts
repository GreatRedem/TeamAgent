import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
    AGENT_DESCRIPTION_MAX,
    AGENT_DOCUMENT_CONTENT_MAX,
    AGENT_EXCHANGE_PAGE,
    AGENT_PERMISSIONS,
    DEFAULT_AGENT_PERMISSIONS,
    DEFAULT_DOCUMENTS,
    DOCUMENT_NAME_MAX,
    DOCUMENT_NAME_PATTERN,
    LIST_PAGE,
    NAME_MAX,
    NAME_MIN,
    NO_USAGE,
} from '../../constant.js';

import { authGuard } from '../../plugins/authentication.js';
import { bodyField } from '../../plugins/validator.js';
import { BadRequestResponse } from '../../utils/response.js';
import { type ActedBy, attribution, audit, changed } from '../audit/audit.log.js';
import { TeamTask } from '../task/task.entity.js';
import { findOwnedTeam, readPage, readParamId, readTeamId, takePage } from '../team/team.access.js';
import { TeamBot, TeamModel } from '../team/team.entity.js';
import { TelegramUserDocument } from '../telegram/telegram.entity.js';
import { TeamAgent, TeamAgentDocument, TeamAgentExchange } from './agent.entity.js';
import {
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
import { exchangeUsage } from './agent.usage.js';

function readAgentId(request: FastifyRequest) {
    return readParamId(request, 'agentId', 'AGENT_ID_INVALID');
}
function readDocumentId(request: FastifyRequest) {
    return readParamId(request, 'documentId', 'DOCUMENT_ID_INVALID');
}

function toDocumentView(document: TeamAgentDocument) {
    return {
        id: document.id,
        name: document.name,
        content: document.content,
        updated_at: document.updated_at,
    };
}

export function toAgentView(agent: TeamAgent, modelName: string, documentCount: number) {
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
    raw: unknown,
    teamId: number,
): Promise<number> {
    const modelId = Number((raw as { model_id?: unknown } | undefined)?.model_id);

    if (!Number.isInteger(modelId) || modelId < 1) {
        throw new BadRequestResponse('MODEL_ID_INVALID');
    }

    if (!(await fastify.db.getRepository(TeamModel).findOneBy({ id: modelId, team_id: teamId }))) {
        throw new BadRequestResponse('MODEL_NOT_FOUND');
    }

    return modelId;
}

function readAgentBody(raw: unknown) {
    const name = bodyField(raw, 'name').min(NAME_MIN).max(NAME_MAX).asString().trim();
    const description = bodyField(raw, 'description').max(AGENT_DESCRIPTION_MAX).asString().trim();

    if (name.length < NAME_MIN) {
        throw new BadRequestResponse('ERROR_MIN_LENGTH');
    }

    return { name, description };
}

function readDocumentBody(raw: unknown) {
    const name = bodyField(raw, 'name').min(4).max(DOCUMENT_NAME_MAX).asString().trim();
    const content = bodyField(raw, 'content').max(AGENT_DOCUMENT_CONTENT_MAX).asString();

    if (!DOCUMENT_NAME_PATTERN.test(name)) {
        throw new BadRequestResponse('DOCUMENT_NAME_INVALID');
    }

    return { name, content };
}

export async function modelNames(
    fastify: FastifyInstance,
    teamId: number,
): Promise<Map<number, string>> {
    const models = await fastify.db.getRepository(TeamModel).findBy({ team_id: teamId });

    return new Map(models.map((model) => [model.id, model.name]));
}

export async function createAgent(
    fastify: FastifyInstance,
    teamId: number,
    raw: unknown,
    by: ActedBy,
): Promise<TeamAgent> {
    const credit = attribution(by);
    const { name, description } = readAgentBody(raw);
    const modelId = await readModelId(fastify, raw, teamId);
    const instructions =
        (raw as { instructions?: unknown } | undefined)?.instructions === undefined
            ? ''
            : bodyField(raw, 'instructions').max(AGENT_DOCUMENT_CONTENT_MAX).asString().trim();

    const agent = await fastify.db.getRepository(TeamAgent).save({
        team_id: teamId,
        name,
        description,
        model_id: modelId,
        permissions: serializeAgentPermissions(DEFAULT_AGENT_PERMISSIONS),
    });

    const files = DEFAULT_DOCUMENTS.map((document) => ({
        name: document.name,
        content:
            document.name === 'instructions.md' && instructions !== ''
                ? `${instructions}\n`
                : document.content,
    }));

    await fastify.db
        .getRepository(TeamAgentDocument)
        .save(files.map((file) => ({ agent_id: agent.id, ...file })));

    by.log.info(
        { module: 'agent', teamId, agentId: agent.id, modelId, accountId: by.accountId },
        'agent created',
    );

    await audit(fastify, by.log, {
        teamId,
        ...credit.who,
        action: 'agent.create',
        target: `agent:${agent.id}`,
        detail: `${name} - model ${modelId} - ${files.length} files seeded${credit.note}`,
        changes: {
            name,
            description,
            model_id: modelId,
            permissions: agent.permissions,
            files,
            ...credit.changes,
        },
    });

    return agent;
}

export function agentCreate(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);

        const agent = await createAgent(fastify, teamId, request.body, {
            log: request.log,
            accountId: request.account_id,
        });
        const names = await modelNames(fastify, teamId);

        reply.send(toAgentView(agent, names.get(agent.model_id) ?? '', DEFAULT_DOCUMENTS.length));
    };

    return { schema: schemaAgentCreate(), config: { ...authGuard() }, handler };
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

    return { schema: schemaAgentList(), config: { ...authGuard() }, handler };
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

    return { schema: schemaAgentDetails(), config: { ...authGuard() }, handler };
}

export async function updateAgent(
    fastify: FastifyInstance,
    agent: TeamAgent,
    raw: unknown,
    by: ActedBy,
): Promise<TeamAgent> {
    const credit = attribution(by);
    const teamId = agent.team_id;
    const { name, description } = readAgentBody(raw);
    const modelId = await readModelId(fastify, raw, teamId);
    const diff = changed(agent, { name, description, model_id: modelId });

    await fastify.db
        .getRepository(TeamAgent)
        .update({ id: agent.id, team_id: teamId }, { name, description, model_id: modelId });

    by.log.info(
        { module: 'agent', teamId, agentId: agent.id, modelId, accountId: by.accountId },
        'agent updated',
    );

    await audit(fastify, by.log, {
        teamId,
        ...credit.who,
        action: 'agent.update',
        target: `agent:${agent.id}`,
        detail: `${name} - changed ${Object.keys(diff).join(', ') || 'nothing'}${credit.note}`,
        changes: { ...diff, ...credit.changes },
    });

    return { ...agent, name, description, model_id: modelId };
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
        const saved = await updateAgent(fastify, agent, request.body, {
            log: request.log,
            accountId: request.account_id,
        });
        const documents = await fastify.db
            .getRepository(TeamAgentDocument)
            .countBy({ agent_id: agent.id });
        const names = await modelNames(fastify, teamId);

        reply.send(toAgentView(saved, names.get(saved.model_id) ?? '', documents));
    };

    return { schema: schemaAgentUpdate(), config: { ...authGuard() }, handler };
}

export async function removeAgent(
    fastify: FastifyInstance,
    teamId: number,
    agentId: number,
    by: ActedBy,
) {
    const credit = attribution(by);
    const gone = await fastify.db
        .getRepository(TeamAgent)
        .findOneBy({ id: agentId, team_id: teamId });
    const files = await fastify.db.getRepository(TeamAgentDocument).findBy({ agent_id: agentId });

    const removed = await fastify.db
        .getRepository(TeamAgent)
        .delete({ id: agentId, team_id: teamId });

    if (removed.affected !== 1) {
        throw new BadRequestResponse('AGENT_NOT_FOUND');
    }

    await fastify.db.getRepository(TeamAgentDocument).delete({ agent_id: agentId });

    const personal = await fastify.db
        .getRepository(TelegramUserDocument)
        .delete({ agent_id: agentId });

    const cancelled = await fastify.db
        .getRepository(TeamTask)
        .update(
            { team_id: teamId, agent_id: agentId, status: 'scheduled' },
            { status: 'cancelled' },
        );

    const detached = await fastify.db
        .getRepository(TeamBot)
        .update({ team_id: teamId, agent_id: agentId }, { agent_id: 0 });

    by.log.info(
        {
            module: 'agent',
            teamId,
            agentId,
            accountId: by.accountId,
            detachedBots: detached.affected ?? 0,
        },
        'agent removed',
    );

    await audit(fastify, by.log, {
        teamId,
        ...credit.who,
        action: 'agent.remove',
        target: `agent:${agentId}`,
        detail: `${gone?.name ?? agentId} - ${detached.affected ?? 0} bot(s) detached, ${cancelled.affected ?? 0} task(s) cancelled${credit.note}`,
        changes: {
            agent: gone,
            files: files.map((file) => ({ name: file.name, content: file.content })),
            personal_files_removed: personal.affected ?? 0,
            tasks_cancelled: cancelled.affected ?? 0,
            bots_detached: detached.affected ?? 0,
            ...credit.changes,
        },
    });

    return {
        bots_detached: detached.affected ?? 0,
        tasks_cancelled: cancelled.affected ?? 0,
    };
}

export function agentRemove(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const teamId = readTeamId(request);
        const agentId = readAgentId(request);

        await findOwnedTeam(fastify, teamId, request.account_id);
        await removeAgent(fastify, teamId, agentId, {
            log: request.log,
            accountId: request.account_id,
        });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaAgentRemove(), config: { ...authGuard() }, handler };
}

export async function createAgentDocument(
    fastify: FastifyInstance,
    agent: TeamAgent,
    raw: unknown,
    by: ActedBy,
): Promise<TeamAgentDocument> {
    const credit = attribution(by);
    const { name, content } = readDocumentBody(raw);
    const repository = fastify.db.getRepository(TeamAgentDocument);

    if (await repository.findOneBy({ agent_id: agent.id, name })) {
        throw new BadRequestResponse('DOCUMENT_ALREADY_EXISTS');
    }

    const document = await repository.save({ agent_id: agent.id, name, content });

    by.log.info(
        {
            module: 'agent',
            teamId: agent.team_id,
            agentId: agent.id,
            documentId: document.id,
            accountId: by.accountId,
        },
        'agent document created',
    );

    await audit(fastify, by.log, {
        teamId: agent.team_id,
        ...credit.who,
        action: 'agent.document.create',
        target: `agent:${agent.id}`,
        detail: `${agent.name} - ${name} - ${content.length} chars${credit.note}`,
        changes: { name, content, ...credit.changes },
    });

    return document;
}

export async function updateAgentDocument(
    fastify: FastifyInstance,
    agent: TeamAgent,
    documentId: number,
    raw: unknown,
    by: ActedBy,
): Promise<TeamAgentDocument> {
    const credit = attribution(by);
    const { name, content } = readDocumentBody(raw);
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

    by.log.info(
        {
            module: 'agent',
            teamId: agent.team_id,
            agentId: agent.id,
            documentId: document.id,
            accountId: by.accountId,
        },
        'agent document updated',
    );

    await audit(fastify, by.log, {
        teamId: agent.team_id,
        ...credit.who,
        action: 'agent.document.update',
        target: `agent:${agent.id}`,
        detail: `${agent.name} - ${name} - ${content.length} chars${credit.note}`,
        changes: { ...changed(document, { name, content }), ...credit.changes },
    });

    return { ...document, name, content, updated_at: new Date() };
}

export async function removeAgentDocument(
    fastify: FastifyInstance,
    agent: TeamAgent,
    documentId: number,
    by: ActedBy,
) {
    const credit = attribution(by);
    const gone = await fastify.db
        .getRepository(TeamAgentDocument)
        .findOneBy({ id: documentId, agent_id: agent.id });

    const removed = await fastify.db
        .getRepository(TeamAgentDocument)
        .delete({ id: documentId, agent_id: agent.id });

    if (removed.affected !== 1) {
        throw new BadRequestResponse('DOCUMENT_NOT_FOUND');
    }

    by.log.info(
        {
            module: 'agent',
            teamId: agent.team_id,
            agentId: agent.id,
            documentId,
            accountId: by.accountId,
        },
        'agent document removed',
    );

    await audit(fastify, by.log, {
        teamId: agent.team_id,
        ...credit.who,
        action: 'agent.document.remove',
        target: `agent:${agent.id}`,
        detail: `${agent.name} - ${gone?.name ?? `document ${documentId}`}${credit.note}`,
        changes: { name: gone?.name, content: gone?.content, ...credit.changes },
    });
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
        const document = await createAgentDocument(fastify, agent, request.body, {
            log: request.log,
            accountId: request.account_id,
        });

        reply.send(toDocumentView(document));
    };

    return { schema: schemaAgentDocumentCreate(), config: { ...authGuard() }, handler };
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
        const document = await updateAgentDocument(
            fastify,
            agent,
            readDocumentId(request),
            request.body,
            { log: request.log, accountId: request.account_id },
        );

        reply.send(toDocumentView(document));
    };

    return { schema: schemaAgentDocumentUpdate(), config: { ...authGuard() }, handler };
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

        await removeAgentDocument(fastify, agent, readDocumentId(request), {
            log: request.log,
            accountId: request.account_id,
        });

        reply.send({ result: 'OK' });
    };

    return { schema: schemaAgentDocumentRemove(), config: { ...authGuard() }, handler };
}

export function agentPermissionCatalog(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        await findOwnedTeam(fastify, readTeamId(request), request.account_id);

        reply.send({ permissions: AGENT_PERMISSIONS });
    };

    return { schema: schemaAgentPermissionCatalog(), config: { ...authGuard() }, handler };
}

export async function setAgentPermissions(
    fastify: FastifyInstance,
    agent: TeamAgent,
    requested: unknown,
    by: ActedBy,
): Promise<TeamAgent> {
    const credit = attribution(by);

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
        .update({ id: agent.id, team_id: agent.team_id }, { permissions });

    by.log.info(
        {
            module: 'agent',
            teamId: agent.team_id,
            agentId: agent.id,
            accountId: by.accountId,
            permissions,
        },
        'agent permissions updated',
    );

    await audit(fastify, by.log, {
        teamId: agent.team_id,
        ...credit.who,
        action: 'agent.permissions',
        target: `agent:${agent.id}`,
        detail: `${agent.name} -> ${permissions === '' ? 'none' : permissions}${credit.note}`,
        changes: {
            ...changed(
                { permissions: parseAgentPermissions(agent.permissions) },
                { permissions: parseAgentPermissions(permissions) },
            ),
            ...credit.changes,
        },
    });

    return { ...agent, permissions };
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
        const saved = await setAgentPermissions(
            fastify,
            agent,
            (request.body as { permissions?: unknown } | undefined)?.permissions,
            { log: request.log, accountId: request.account_id },
        );
        const documents = await fastify.db
            .getRepository(TeamAgentDocument)
            .countBy({ agent_id: agent.id });
        const names = await modelNames(fastify, teamId);

        reply.send(toAgentView(saved, names.get(agent.model_id) ?? '', documents));
    };

    return { schema: schemaAgentPermissionUpdate(), config: { ...authGuard() }, handler };
}

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

        const { limit, offset } = readPage(request, AGENT_EXCHANGE_PAGE);

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

    return { schema: schemaAgentExchanges(), config: { ...authGuard() }, handler };
}
