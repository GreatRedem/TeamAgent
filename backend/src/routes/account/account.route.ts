import type { FastifyInstance } from 'fastify';

import {
    accountMe,
    accountPlans,
    smsSend,
    smsSignIn,
    walletNonce,
    walletSignIn,
} from './account.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.post('/account/wallet/nonce', walletNonce(fastify));
    fastify.post('/account/wallet/sign-in', walletSignIn(fastify));
    fastify.post('/account/sms/send', smsSend(fastify));
    fastify.post('/account/sms/sign-in', smsSignIn(fastify));
    fastify.get('/account/plans', accountPlans());
    fastify.get('/account/me', accountMe(fastify));
}
