import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IsNull } from 'typeorm';
import { getAddress, isAddress, recoverMessageAddress } from 'viem';
import {
    ADMIN_ROLE,
    APP_NAME,
    PLANS,
    SESSION_REFRESH_TIME,
    SMS_CODE_ATTEMPTS,
    SMS_CODE_TIME,
    SMS_HOURLY_MAX,
    SMS_RESEND_GAP,
    SMS_SENT,
    SMS_TEXT,
    WALLET_NONCE_TIME,
} from '../../constant.js';

import { authGuard, createAccessToken, createRefreshToken } from '../../plugins/authentication.js';
import { rateLimit } from '../../plugins/ratelimit.js';
import { BadRequestResponse, UnauthorizedResponse } from '../../utils/response.js';
import { audit } from '../audit/audit.log.js';
import { Team } from '../team/team.entity.js';
import { Account, AccountNonce, AccountSession, AccountSmsCode } from './account.entity.js';
import { activePlan } from './account.plan.js';
import {
    schemaAccountMe,
    schemaAccountPlans,
    schemaAccountSmsSend,
    schemaAccountSmsSignIn,
    schemaAccountWalletNonce,
    schemaAccountWalletSignIn,
} from './account.schema.js';
import { codeHash, normalizePhone, plainDigits, sameHash, sendSms } from './account.sms.js';

function buildSignInMessage(address: string, nonce: string, issuedAt: Date, expiresAt: Date) {
    return [
        `${APP_NAME} wants you to sign in with your wallet account:`,
        address,
        '',
        'Sign in. This request will not trigger a transaction or cost any gas.',
        '',
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
        `Expiration Time: ${expiresAt.toISOString()}`,
    ].join('\n');
}

async function startSession(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply,
    account: Account,
) {
    const refreshToken = createRefreshToken(account.id, account.role);

    const refresh = await fastify.db.getRepository(AccountSession).save({
        device: `${request.headers['user-agent'] || ''} ${request.ip}`,
        expires_at: new Date(Date.now() + SESSION_REFRESH_TIME),
        account_id: account.id,
        token: refreshToken,
    });

    ['/account/refresh', '/account/sign-out'].map((path) =>
        reply.setCookie('refresh', refreshToken, {
            path,
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
        }),
    );

    return createAccessToken(account.id, account.role, refresh.id);
}

export function walletNonce(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const input = request.getBody('address').min(42).max(42).asString();

        if (!isAddress(input)) {
            throw new BadRequestResponse('WALLET_ADDRESS_INVALID');
        }

        const address = getAddress(input);

        const nonce = randomBytes(16).toString('hex');
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + WALLET_NONCE_TIME);

        const message = buildSignInMessage(address, nonce, issuedAt, expiresAt);

        await fastify.db.getRepository(AccountNonce).save({
            address: address.toLowerCase(),
            nonce,
            message,
            expires_at: expiresAt,
            consumed_at: null,
        });

        request.log.info({ module: 'account', address, expiresAt }, 'wallet nonce issued');

        reply.send({ message });
    };

    return {
        schema: schemaAccountWalletNonce(),
        config: { ...rateLimit('account-wallet-nonce', 20, 2 * 60 * 1000) },
        handler,
    };
}

export function walletSignIn(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const input = request.getBody('address').min(42).max(42).asString();
        const signature = request.getBody('signature').min(4).max(512).asString();

        if (!isAddress(input)) {
            throw new BadRequestResponse('WALLET_ADDRESS_INVALID');
        }

        const address = getAddress(input).toLowerCase();

        const challenge = await fastify.db
            .getRepository(AccountNonce)
            .findOne({ where: { address, consumed_at: IsNull() }, order: { id: 'DESC' } });

        if (!challenge || challenge.expires_at < new Date()) {
            request.log.warn(
                { module: 'account', address, reason: challenge ? 'expired' : 'missing' },
                'wallet nonce rejected',
            );

            throw new BadRequestResponse('WALLET_NONCE_INVALID');
        }

        const consumed = await fastify.db
            .getRepository(AccountNonce)
            .createQueryBuilder()
            .update(AccountNonce)
            .set({ consumed_at: new Date() })
            .where('id = :id', { id: challenge.id })
            .andWhere('consumed_at IS NULL')
            .execute();

        if (consumed.affected !== 1) {
            request.log.warn(
                { module: 'account', address, reason: 'already-consumed' },
                'wallet nonce rejected',
            );

            throw new BadRequestResponse('WALLET_NONCE_INVALID');
        }

        const recovered = await recoverMessageAddress({
            message: challenge.message,
            signature: signature as `0x${string}`,
        }).catch(() => undefined);

        if (!recovered || recovered.toLowerCase() !== address) {
            request.log.warn(
                { module: 'account', address, recovered },
                'wallet signature rejected',
            );

            throw new UnauthorizedResponse('WALLET_SIGNATURE_INVALID');
        }

        let account = await fastify.db.getRepository(Account).findOneBy({ wallet: address });
        const created = !account;

        if (!account) {
            account = await fastify.db.getRepository(Account).save({ wallet: address });

            request.log.info(
                { module: 'account', accountId: account.id, address },
                'account created',
            );
        }

        const accessToken = await startSession(fastify, request, reply, account);

        await audit(fastify, request.log, {
            accountId: account.id,
            action: created ? 'account.create' : 'account.sign_in',
            target: `account:${account.id}`,
            detail: `${address}${created ? ' · new account' : ''}`,
            changes: {
                wallet: address,
                ip: request.ip,
                agent: request.headers['user-agent'] ?? '',
            },
        });

        request.log.info(
            { module: 'account', accountId: account.id, address },
            'wallet sign-in succeeded',
        );

        reply.send({ accessToken });
    };

    return {
        schema: schemaAccountWalletSignIn(),
        config: { ...rateLimit('account-wallet-sign-in', 20, 2 * 60 * 1000) },
        handler,
    };
}

export function accountPlans() {
    const handler = async (_request: FastifyRequest, reply: FastifyReply) => {
        reply.send({ plans: PLANS });
    };

    return { schema: schemaAccountPlans(), handler };
}

export function accountMe(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const account = await fastify.db
            .getRepository(Account)
            .findOneBy({ id: request.account_id });

        if (!account) {
            throw new UnauthorizedResponse('ACCOUNT_NOT_FOUND');
        }

        const plan = activePlan(account);

        reply.send({
            id: account.id,
            admin: request.account_role >= ADMIN_ROLE,
            wallet: account.wallet,
            phone: account.phone,
            plan: plan.key,
            chosen_plan: account.plan,
            plan_until: account.plan_until?.toISOString() ?? null,
            limits: plan.limits,
            projects: await fastify.db.getRepository(Team).countBy({ account_id: account.id }),
        });
    };

    return { schema: schemaAccountMe(), config: { ...authGuard() }, handler };
}

function readPhone(request: FastifyRequest): string {
    const phone = normalizePhone(request.getBody('phone').min(4).max(32).asString());

    if (phone === null) {
        throw new BadRequestResponse('PHONE_INVALID');
    }

    return phone;
}

export function smsSend(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const phone = readPhone(request);
        const locale = (request.body as { locale?: unknown }).locale;
        const now = Date.now();
        const recent = (SMS_SENT.get(phone) ?? []).filter((at) => now - at < 60 * 60 * 1000);

        if (recent.length >= SMS_HOURLY_MAX || (recent.at(-1) ?? 0) > now - SMS_RESEND_GAP) {
            throw new BadRequestResponse('SMS_TOO_SOON');
        }

        SMS_SENT.set(phone, [...recent, now]);

        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const codes = fastify.db.getRepository(AccountSmsCode);

        await codes.update({ phone, consumed_at: IsNull() }, { consumed_at: new Date(now) });
        await codes.save({
            phone,
            code_hash: codeHash(phone, code),
            attempts: 0,
            expires_at: new Date(now + SMS_CODE_TIME),
            consumed_at: null,
        });

        const text = (
            SMS_TEXT[typeof locale === 'string' ? locale : 'en'] ??
            SMS_TEXT['en'] ??
            ''
        ).replace('{code}', code);
        const sent = await sendSms(request.log, phone, text);

        if (!sent.ok) {
            request.log.error({ module: 'sms', phone, error: sent.error }, 'sms not sent');

            throw new BadRequestResponse('SMS_UNAVAILABLE');
        }

        request.log.info({ module: 'account', phone }, 'sms code sent');

        reply.send({ phone, resend_after: SMS_RESEND_GAP / 1000 });
    };

    return {
        schema: schemaAccountSmsSend(),
        config: { ...rateLimit('account-sms-send', 10, 10 * 60 * 1000) },
        handler,
    };
}

export function smsSignIn(fastify: FastifyInstance) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
        const phone = readPhone(request);
        const code = plainDigits(request.getBody('code').min(4).max(12).asString()).replace(
            /\s/g,
            '',
        );
        const codes = fastify.db.getRepository(AccountSmsCode);

        const challenge = await codes.findOne({
            where: { phone, consumed_at: IsNull() },
            order: { id: 'DESC' },
        });

        if (
            !challenge ||
            challenge.expires_at < new Date() ||
            challenge.attempts >= SMS_CODE_ATTEMPTS
        ) {
            throw new BadRequestResponse('SMS_CODE_INVALID');
        }

        if (!sameHash(challenge.code_hash, codeHash(phone, code))) {
            await codes.increment({ id: challenge.id }, 'attempts', 1);

            request.log.warn({ module: 'account', phone }, 'sms code rejected');

            throw new BadRequestResponse('SMS_CODE_INVALID');
        }

        const consumed = await codes
            .createQueryBuilder()
            .update(AccountSmsCode)
            .set({ consumed_at: new Date() })
            .where('id = :id', { id: challenge.id })
            .andWhere('consumed_at IS NULL')
            .execute();

        if (consumed.affected !== 1) {
            throw new BadRequestResponse('SMS_CODE_INVALID');
        }

        let account = await fastify.db.getRepository(Account).findOneBy({ phone });
        const created = !account;

        if (!account) {
            account = await fastify.db.getRepository(Account).save({ phone });

            request.log.info({ module: 'account', accountId: account.id }, 'account created');
        }

        const accessToken = await startSession(fastify, request, reply, account);

        await audit(fastify, request.log, {
            accountId: account.id,
            action: created ? 'account.create' : 'account.sign_in',
            target: `account:${account.id}`,
            detail: `${phone}${created ? ' · new account' : ''}`,
            changes: {
                phone,
                ip: request.ip,
                agent: request.headers['user-agent'] ?? '',
            },
        });

        reply.send({ accessToken });
    };

    return {
        schema: schemaAccountSmsSignIn(),
        config: { ...rateLimit('account-sms-sign-in', 20, 10 * 60 * 1000) },
        handler,
    };
}
