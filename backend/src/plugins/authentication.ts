import type { FastifyRequest, FastifyReply } from 'fastify';

import { createHmac, timingSafeEqual } from 'node:crypto';

import fastifyPlugin from 'fastify-plugin';

import config from '../utils/config.js';

import { STATUS_FORBIDDEN, STATUS_UNAUTHORIZED } from '../utils/status.js';

export const SESSION_ACCESS_TIME = 15 * 60 * 1000;
export const SESSION_REFRESH_TIME = 30 * 24 * 60 * 60 * 1000;

export function verifyAccessToken(token: string)
{
    const accessToken = token.split('.');

    if (accessToken.length !== 2)
    {
        return;
    }

    const payload = Buffer.from(accessToken[0], 'base64url');
    const signature = Buffer.from(accessToken[1], 'base64url');

    const signatureServer = createHmac('sha512', config.SESSION_ACCESS_SECRET).update(accessToken[0]).digest();

    if (signatureServer.length !== signature.length || !timingSafeEqual(signatureServer, signature))
    {
        return;
    }

    let decoded: { id: number; role: number; sid: number; expires_at: number };

    try
    {
        decoded = JSON.parse(payload.toString());

        if (typeof decoded.id !== 'number' || typeof decoded.sid !== 'number' || typeof decoded.role !== 'number' || typeof decoded.expires_at !== 'number')
        {
            return;
        }
    }
    catch
    {
        return;
    }

    if (decoded.expires_at < Math.floor(Date.now() / 1000))
    {
        return;
    }

    return { id: decoded.id, role: decoded.role, sid: decoded.sid };
}


export function createAccessToken(id: number, role: number, sessionId: number): string
{
    const payload = Buffer.from(JSON.stringify({ id, role, sid: sessionId, expires_at: Math.floor((Date.now() + SESSION_ACCESS_TIME) / 1000) })).toString('base64url');

    const signature = createHmac('sha512', config.SESSION_ACCESS_SECRET).update(payload).digest('base64url');

    return `${ payload }.${ signature }`;
}

export function createRefreshToken(id: number, role: number): string
{
    const payload = Buffer.from(JSON.stringify({ id, role, expires_at: Math.floor(((Date.now() + SESSION_REFRESH_TIME)) / 1000) })).toString('base64url');

    const signature = createHmac('sha512', config.SESSION_REFRESH_SECRET).update(payload).digest('base64url');

    return `${ payload }.${ signature }`;
}

export function authGuard()
{
    return { authentication: true };
}

export function authRole(role: number)
{
    return { role };
}

export default fastifyPlugin(async function(fastify)
{
    fastify.addHook('preHandler', async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const routeConfig = request.routeOptions.config?.authentication;

        if (!routeConfig)
        {
            return;
        }

        const accessToken = request.headers['authorization'];

        if (typeof accessToken === 'string')
        {
            const bearer = accessToken.split(' ');

            if (bearer.length === 2)
            {
                const payload = verifyAccessToken(bearer[1]);

                if (payload)
                {
                    request.account_id = payload.id;
                    request.session_id = payload.sid;
                    request.account_role = payload.role;

                    return;
                }
            }
        }

        reply.status(STATUS_UNAUTHORIZED).send();
    });

    fastify.addHook('preHandler', async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const routeRole = request.routeOptions.config?.role;

        if (routeRole === undefined)
        {
            return;
        }

        if (request.account_role >= routeRole)
        {
            return;
        }

        reply.status(STATUS_FORBIDDEN).send();
    });
});
