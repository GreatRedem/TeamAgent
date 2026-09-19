import type { FastifyInstance } from 'fastify';

import { signUp, signIn, signOut, refresh, password, swap, transfer } from './account.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.post('/account/sign-up', signUp(fastify));
    fastify.post('/account/sign-in', signIn(fastify));
    fastify.post('/account/sign-out', signOut(fastify));
    fastify.post('/account/refresh', refresh(fastify));
    fastify.post('/account/password', password(fastify));
    fastify.post('/account/swap', swap(fastify));
    fastify.post('/account/transfer', transfer(fastify));

    // fastify.post('/account/forgot', google());
    // fastify.post('/account/forgot-verify', google());

    // fastify.get('/account/session', google());
    // fastify.delete('/account/session', google());

    // fastify.get('/account/history', google());
}
