import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { randomBytes } from 'node:crypto';

import { IsNull } from 'typeorm';
import { getAddress, isAddress, recoverMessageAddress } from 'viem';

import { rateLimit } from '../../plugins/ratelimit.js';
import { createRefreshToken, createAccessToken, SESSION_REFRESH_TIME } from '../../plugins/authentication.js';

import { Account, AccountNonce, AccountSession } from './account.entity.js';
import { schemaAccountWalletNonce, schemaAccountWalletSignIn } from './account.schema.js';

import { BadRequestResponse, UnauthorizedResponse } from '../../utils/response.js';

const APP_NAME = 'NuraAI';

const WALLET_NONCE_TIME = 5 * 60 * 1000;

function buildSignInMessage(address: string, nonce: string, issuedAt: Date, expiresAt: Date)
{
    return [
        `${ APP_NAME } wants you to sign in with your wallet account:`,
        address,
        '',
        'Sign in. This request will not trigger a transaction or cost any gas.',
        '',
        `Nonce: ${ nonce }`,
        `Issued At: ${ issuedAt.toISOString() }`,
        `Expiration Time: ${ expiresAt.toISOString() }`
    ].join('\n');
}

async function startSession(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply, account: Account)
{
    const refreshToken = createRefreshToken(account.id, account.role);

    const refresh = await fastify.db.getRepository(AccountSession).save({
        device: (request.headers['user-agent'] || '') + ' ' + request.ip,
        expires_at: new Date(Date.now() + SESSION_REFRESH_TIME),
        account_id: account.id,
        token: refreshToken });

    [ '/account/refresh', '/account/sign-out' ].map((path) => reply.setCookie('refresh', refreshToken, { path, httpOnly: true, secure: true, sameSite: 'strict' }));

    return createAccessToken(account.id, account.role, refresh.id);
}

export function walletNonce(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const input = request.getBody('address').min(42).max(42).asString();

        if (!isAddress(input))
        {
            throw new BadRequestResponse('WALLET_ADDRESS_INVALID');
        }

        const address = getAddress(input);

        const nonce = randomBytes(16).toString('hex');
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + WALLET_NONCE_TIME);

        const message = buildSignInMessage(address, nonce, issuedAt, expiresAt);

        await fastify.db.getRepository(AccountNonce).save({ address: address.toLowerCase(), nonce, message, expires_at: expiresAt, consumed_at: null });

        request.log.info({ module: 'account', address, expiresAt }, 'wallet nonce issued');

        reply.send({ message });
    };

    return { schema: schemaAccountWalletNonce, config: { ...rateLimit('account-wallet-nonce', 20, 2 * 60 * 1000) }, handler };
}

export function walletSignIn(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const input = request.getBody('address').min(42).max(42).asString();
        const signature = request.getBody('signature').min(4).max(512).asString();

        if (!isAddress(input))
        {
            throw new BadRequestResponse('WALLET_ADDRESS_INVALID');
        }

        const address = getAddress(input).toLowerCase();

        const challenge = await fastify.db.getRepository(AccountNonce).findOne({ where: { address, consumed_at: IsNull() }, order: { id: 'DESC' } });

        if (!challenge || challenge.expires_at < new Date())
        {
            request.log.warn({ module: 'account', address, reason: challenge ? 'expired' : 'missing' }, 'wallet nonce rejected');

            throw new BadRequestResponse('WALLET_NONCE_INVALID');
        }

        // consume before verifying, and only proceed if this request is the one that claimed it
        const consumed = await fastify.db.getRepository(AccountNonce).createQueryBuilder().update(AccountNonce)
            .set({ consumed_at: new Date() })
            .where('id = :id', { id: challenge.id })
            .andWhere('consumed_at IS NULL')
            .execute();

        if (consumed.affected !== 1)
        {
            request.log.warn({ module: 'account', address, reason: 'already-consumed' }, 'wallet nonce rejected');

            throw new BadRequestResponse('WALLET_NONCE_INVALID');
        }

        const recovered = await recoverMessageAddress({ message: challenge.message, signature: signature as `0x${ string }` }).catch(() => undefined);

        if (!recovered || recovered.toLowerCase() !== address)
        {
            request.log.warn({ module: 'account', address, recovered }, 'wallet signature rejected');

            throw new UnauthorizedResponse('WALLET_SIGNATURE_INVALID');
        }

        let account = await fastify.db.getRepository(Account).findOneBy({ wallet: address });

        if (!account)
        {
            account = await fastify.db.getRepository(Account).save({ wallet: address });

            request.log.info({ module: 'account', accountId: account.id, address }, 'account created');
        }

        const accessToken = await startSession(fastify, request, reply, account);

        request.log.info({ module: 'account', accountId: account.id, address }, 'wallet sign-in succeeded');

        reply.send({ accessToken });
    };

    return { schema: schemaAccountWalletSignIn, config: { ...rateLimit('account-wallet-sign-in', 20, 2 * 60 * 1000) }, handler };
}
