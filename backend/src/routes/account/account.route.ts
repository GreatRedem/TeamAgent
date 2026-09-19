import type { FastifyInstance } from 'fastify';

import { walletNonce, walletSignIn } from './account.service.js';

export default async function(fastify: FastifyInstance)
{
    fastify.post('/account/wallet/nonce', walletNonce(fastify));
    fastify.post('/account/wallet/sign-in', walletSignIn(fastify));
}
