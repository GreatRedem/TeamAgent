import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PLUGIN_HOOK_RATE, PLUGIN_HOOK_WINDOW, PLUGIN_KINDS, TEXT_MAX } from '../../constant.js';

import { rateLimit } from '../../plugins/ratelimit.js';
import { BadRequestResponse, UnauthorizedResponse } from '../../utils/response.js';
import { readParamId } from '../team/team.access.js';
import { secretMatches } from '../telegram/telegram.service.js';
import { settingsOf, signature } from './plugin.common.js';
import { TeamPlugin } from './plugin.entity.js';
import { receiveInbound } from './plugin.inbound.js';
import { instagramInbound, instagramMessage, instagramReply } from './plugin.instagram.js';
import { schemaPluginHook } from './plugin.schema.js';

function readJson(raw: unknown): Record<string, unknown> {
    try {
        const parsed: unknown = typeof raw === 'string' && raw !== '' ? JSON.parse(raw) : {};

        return typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        throw new BadRequestResponse('HOOK_BODY_INVALID');
    }
}

async function hookPlugin(fastify: FastifyInstance, request: FastifyRequest): Promise<TeamPlugin> {
    const plugin = await fastify.db
        .getRepository(TeamPlugin)
        .findOneBy({ id: readParamId(request, 'pluginId', 'PLUGIN_ID_INVALID') });

    const inbound = PLUGIN_KINDS.find((kind) => kind.key === plugin?.kind)?.inbound;

    if (!plugin?.enabled || inbound !== 'webhook') {
        throw new BadRequestResponse('PLUGIN_NOT_FOUND');
    }

    return plugin;
}

export function pluginHookVerify(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const plugin = await hookPlugin(fastify, request);
        const query = request.query as Record<string, string | undefined>;

        if (
            plugin.kind !== 'instagram' ||
            query['hub.mode'] !== 'subscribe' ||
            !secretMatches(plugin.hook_secret, query['hub.verify_token'])
        ) {
            throw new UnauthorizedResponse('HOOK_REJECTED');
        }

        reply.type('text/plain').send(query['hub.challenge'] ?? '');
    };

    return {
        config: { ...rateLimit('plugin-hook', PLUGIN_HOOK_RATE, PLUGIN_HOOK_WINDOW) },
        handler,
    };
}

export function pluginHookReceive(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const plugin = await hookPlugin(fastify, request);
        const raw = typeof request.body === 'string' ? request.body : '';
        const { secrets } = settingsOf(plugin);

        if (plugin.kind === 'instagram') {
            const appSecret = secrets['app_secret'] ?? '';

            if (
                appSecret === '' ||
                !secretMatches(signature(appSecret, raw), request.headers['x-hub-signature-256'])
            ) {
                request.log.warn({ module: 'plugin', pluginId: plugin.id }, 'hook rejected');

                throw new UnauthorizedResponse('HOOK_REJECTED');
            }

            const token = secrets['token'] ?? '';

            for (const { account, event } of instagramInbound(readJson(raw))) {
                void receiveInbound(fastify, request.log, plugin, event, (text) =>
                    event.kind === 'comment'
                        ? instagramReply(token, event.ids['comment_id'] ?? '', text)
                        : instagramMessage(token, account, event.author_id, text),
                ).catch((error: unknown) =>
                    request.log.error(
                        { module: 'plugin', pluginId: plugin.id, err: error },
                        'instagram reply crashed',
                    ),
                );
            }

            reply.send({ ok: true });

            return;
        }

        if (!secretMatches(plugin.hook_secret, request.headers['x-nura-secret'])) {
            request.log.warn({ module: 'plugin', pluginId: plugin.id }, 'hook rejected');

            throw new UnauthorizedResponse('HOOK_REJECTED');
        }

        const body = readJson(raw);
        const text = typeof body['text'] === 'string' ? body['text'].trim().slice(0, TEXT_MAX) : '';
        const from = typeof body['from'] === 'string' ? body['from'].trim().slice(0, 64) : '';

        if (text === '') {
            throw new BadRequestResponse('HOOK_TEXT_REQUIRED');
        }

        const result = await receiveInbound(
            fastify,
            request.log,
            plugin,
            {
                kind: 'message',
                thread: `wh:${from === '' ? 'caller' : from}`,
                author: from === '' ? 'a system calling the webhook' : from,
                author_id: from,
                text,
                where: 'a webhook call',
                ids: {},
            },
            () => Promise.resolve({ ok: true, status: 200 }),
        );

        reply.send({
            ok: true,
            answered: result.answered,
            reply: result.answered ? result.text : null,
            error: result.error === '' ? null : result.error,
        });
    };

    return {
        schema: schemaPluginHook(),
        config: { ...rateLimit('plugin-hook', PLUGIN_HOOK_RATE, PLUGIN_HOOK_WINDOW) },
        handler,
    };
}
