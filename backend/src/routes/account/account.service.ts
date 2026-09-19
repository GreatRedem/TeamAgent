import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { rateLimit } from '../../plugins/ratelimit.js';
import { createRefreshToken, createAccessToken, authGuard, verifyRefreshToken, SESSION_REFRESH_TIME } from '../../plugins/authentication.js';

import { Account, AccountSession, AccountTransfer } from './account.entity.js';
import { schemaAccountPassword, schemaAccountRefresh, schemaAccountSignIn, schemaAccountSignOut, schemaAccountSignUp, schemaAccountSwap, schemaAccountTransfer } from './account.schema.js';

import { BadRequestResponse, UnauthorizedResponse } from '../../utils/response.js';

export function signUp(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const username = request.getBody('username').min(4).max(32).asString();
        const password = request.getBody('password').min(5).max(32).asString();
        const email = request.getBody('email').min(5).max(256).toLowerCase().asEmail();
        const phone = request.getBody('phone').min(11).max(11).toLowerCase().asString();
        const source = request.getBody('source').max(64).asStringOptional();

        if (await fastify.db.getRepository(Account).findOneBy({ username }))
        {
            throw new BadRequestResponse('SIGN_UP_USERNAME_EXIST');
        }

        if (await fastify.db.getRepository(Account).findOneBy({ email }))
        {
            throw new BadRequestResponse('SIGN_UP_EMAIL_EXIST');
        }

        if (await fastify.db.getRepository(Account).findOneBy({ phone }))
        {
            throw new BadRequestResponse('SIGN_UP_PHONE_EXIST');
        }

        await fastify.db.getRepository(Account).save({ username, email, password, phone, source });

        reply.send();
    };

    return { schema: schemaAccountSignUp, config: { ...rateLimit('account-sign-up', 20, 2 * 60 * 1000) }, handler };
}

export function signIn(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const password = request.getBody('password').min(5).max(32).asString();
        const email = request.getBody('email').max(256).toLowerCase().asStringOptional();
        const username = request.getBody('username').max(32).toLowerCase().asStringOptional();

        if (!email && !username)
        {
            throw new BadRequestResponse('SIGN_IN_EMAIL_OR_USERNAME_REQUIRED');
        }

        const account = await fastify.db.getRepository(Account).findOneBy({ email, password, username });

        if (!account)
        {
            throw new BadRequestResponse('SIGN_IN_EMAIL_OR_PASSWORD_INVALID');
        }

        const refreshToken = createRefreshToken(account.id, account.role);

        const refresh = await fastify.db.getRepository(AccountSession).save({
            device: (request.headers['user-agent'] || '') + ' ' + request.ip,
            expires_at: new Date(Date.now() + SESSION_REFRESH_TIME),
            account_id: account.id,
            token: refreshToken });

        [ '/account/refresh', '/account/sign-out' ].map((path) => reply.setCookie('refresh', refreshToken, { path, httpOnly: true, secure: true, sameSite: 'strict' }));

        reply.send({ accessToken: createAccessToken(account.id, account.role, refresh.id) });
    };

    return { schema: schemaAccountSignIn, config: { ...rateLimit('account-sign-in', 20, 2 * 60 * 1000) }, handler };
}

export function signOut(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const refreshToken = request.cookies['refresh'];

        if (refreshToken)
        {
            const accountSession = await fastify.db.getRepository(AccountSession).findOneBy({ token: refreshToken });

            if (accountSession && !accountSession.revoked_at)
            {
                accountSession.revoked_at = new Date();

                await fastify.db.getRepository(AccountSession).save(accountSession);
            }
        }

        reply.send();
    };

    return { schema: schemaAccountSignOut, config: { ...rateLimit('account-sign-out', 20, 2 * 60 * 1000), ...authGuard() }, handler };
}

export function refresh(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const refreshToken = request.cookies['refresh'];

        if (refreshToken === undefined)
        {
            throw new UnauthorizedResponse('REFRESH_REQUEST_INVALID');
        }

        const account = verifyRefreshToken(refreshToken);

        if (account === undefined)
        {
            throw new UnauthorizedResponse('REFRESH_REQUEST_INVALID');
        }

        const accountSession = await fastify.db.getRepository(AccountSession).findOneBy({ account_id: account.id, token: refreshToken });

        if (!accountSession || accountSession.revoked_at || accountSession.expires_at < new Date())
        {
            throw new UnauthorizedResponse('REFRESH_REQUEST_INVALID');
        }

        const refreshTokenNew = createRefreshToken(account.id, account.role);

        const refresh = await fastify.db.getRepository(AccountSession).save({
            id: accountSession.id,
            expires_at: new Date(Date.now() + SESSION_REFRESH_TIME),
            device: (request.headers['user-agent'] || '') + ' ' + request.ip,
            account_id: account.id,
            token: refreshTokenNew });

        [ '/account/refresh', '/account/sign-out' ].map((path) => reply.setCookie('refresh', refreshTokenNew, { path, httpOnly: true, secure: true, sameSite: 'strict' }));

        reply.send({ accessToken: createAccessToken(account.id, account.role, refresh.id) });
    };

    return { schema: schemaAccountRefresh, config: { ...rateLimit('account-refresh', 20, 2 * 60 * 1000) }, handler };
}

export function password(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const passwordOld = request.getBody('password_old').min(5).asString();
        const passwordNew = request.getBody('password_new').min(5).asString();

        const account = await fastify.db.getRepository(Account).findOneBy({ id: request.account_id, password: passwordOld });

        if (!account)
        {
            throw new BadRequestResponse('PASSWORD_REQUEST_INVALID');
        }

        account.password = passwordNew;

        await fastify.db.getRepository(Account).save(account);

        await fastify.db.getRepository(AccountSession).createQueryBuilder().update(AccountSession)
            .set({ revoked_at: new Date() })
            .where('account_id = :accountId', { accountId: request.account_id })
            .andWhere('revoked_at IS NULL')
            .andWhere('id != :sessionId', { sessionId: request.session_id })
            .execute();

        // Fix Me Send Notify To Email

        reply.send();
    };

    return { schema: schemaAccountPassword, config: { ...rateLimit('account-password', 20, 2 * 60 * 1000), ...authGuard() }, handler };
}

export function swap(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const amount = request.getBody('amount').min(1).asNumber();
        const email = request.getBody('email').min(5).toLowerCase().asEmail();

        const accountTarget = await fastify.db.getRepository(Account).findOneBy({ email });

        if (!accountTarget)
        {
            throw new BadRequestResponse('SWAP_EMAIL_INVALID');
        }

        const account = await fastify.db.getRepository(Account).findOneBy({ id: request.account_id });

        if (!account || account.usdt < amount)
        {
            throw new BadRequestResponse('SWAP_USDT_INSUFFICIENT');
        }

        account.usdt -= amount;
        accountTarget.usdt += amount;

        await fastify.db.getRepository(Account).save(account);
        await fastify.db.getRepository(Account).save(accountTarget);

        // Fix Me Send Notify To Email

        reply.send();
    };

    return { schema: schemaAccountSwap, config: { ...rateLimit('account-transfer', 100, 30 * 60 * 1000), ...authGuard() }, handler };
}

export function transfer(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const username = request.getBody('username').min(4).max(32).asString();
        const password = request.getBody('password').min(5).max(32).asString();
        const email = request.getBody('email').min(5).max(256).toLowerCase().asEmail();
        const phone = request.getBody('phone').min(5).max(16).toLowerCase().asString();
        const realm = request.getBody('realm').min(5).max(64).asString();

        await fastify.db.getRepository(AccountTransfer).save({ account_id: request.account_id, username, email, password, phone, realm });

        reply.send();
    };

    return { schema: schemaAccountTransfer, config: { ...rateLimit('account-transfer', 20, 2 * 60 * 1000), ...authGuard() }, handler };
}

/*

export async function googleCallback(app: FastifyInstance) {

  app.get("/auth/google/callback", async (req, reply) => {
    const code = (req.query as any).code;
    if (!code) return reply.code(400).send("Missing code");

    // 1. Exchange code for tokens
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const { access_token } = tokenRes.data;

    // 2. Fetch user info
    const userRes = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const decoded = jwtDecode.decode(tokenRes.data.id_token) as any;

if (decoded.aud !== process.env.GOOGLE_CLIENT_ID) {
  throw new Error("Invalid token");
}

    const googleUser = userRes.data;

    const googleId = googleUser.sub;
    const email = googleUser.email;
    const name = googleUser.name;
    const avatar = googleUser.picture;

    // 3. Create or find user in DB
    const user = await findOrCreateUser({ googleId, email, name, avatar });

    // 4. Issue JWT
    const token = app.jwt.sign({ id: user.id });

    return reply.send({ token });
  });
}

export function forgot(fastify: FastifyInstance)
{
    const body = Type.Object({ email: Type.String({ minLength: 5, maxLength: 256, format: 'email' }) });

    const handler = async(request: FastifyRequest<{ Body: Static<typeof body> }>, reply: FastifyReply) =>
    {
        const email = request.body.email.toLowerCase();

        const account = await fastify.web.getRepository(Account).findOneBy({ email });

        if (!account)
        {
            throw new BadRequestResponse('ACCOUNT_FORGOT_EMAIL_NOT_FOUND', 'email');
        }

        const device = request.headers['user-agent'] || '';
        const token = Buffer.from(crypto.randomBytes(24)).toString('base64url').slice(0, 32);

        await fastify.web.getRepository(AccountRecovery).save({ token, device, account_id: account.id });

        //mailer.forgot(account.email, token);

        reply.send();
    };

    return [ { schema: { body }, ...rateLimit('account-forgot', 10, 60 * 60 * 1000) }, handler ] as const;
}

export function verify(fastify: FastifyInstance)
{
    const body = Type.Object({ token: Type.String({ minLength: 32, maxLength: 32 }), password: Type.String({ minLength: 5, maxLength: 32 }) });

    const handler = async(request: FastifyRequest<{ Body: Static<typeof body> }>, reply: FastifyReply) =>
    {
        const token = request.body.token;
        const password = request.body.password.toLowerCase();

        const accountRecovery = await fastify.web.getRepository(AccountRecovery).findOneBy({ token });

        if (!accountRecovery || accountRecovery.used_at || accountRecovery.created_at < new Date(Date.now() - config.NODE_RECOVERY_TIME))
        {
            throw new BadRequestResponse('ACCOUNT_VERIFY_TOKEN_NOT_FOUND', 'token');
        }

        const account = await fastify.web.getRepository(Account).findOneBy({ id: accountRecovery.account_id });

        if (!account)
        {
            throw new BadRequestResponse('ACCOUNT_VERIFY_ACCOUNT_NOT_FOUND', 'token');
        }

        account.password = password;

        accountRecovery.used_at = new Date();

        await fastify.web.getRepository(Account).save(account);

        await fastify.web.getRepository(AccountRecovery).save(accountRecovery);

        // mailer.verify(account.email);

        reply.send();
    };

    return [ { schema: { body }, ...rateLimit('account-forgot', 10, 60 * 60 * 1000) }, handler ] as const;
}

export function sessionList(fastify: FastifyInstance)
{
    const query = Type.Object({ page: Type.Number({ minimum: 1, default: 1 }), limit: Type.Number({ minimum: 1, maximum: 30, default: 10 }) });

    const response = Type.Object({
        total: Type.Number(),
        items: Type.Array(Type.Object({
            id: Type.Number(),
            device: Type.String(),
            expiresAt: Type.String(),
            createdAt: Type.String() })) });

    const handler = async(request: FastifyRequest<{ Querystring: Static<typeof query> }>, reply: FastifyReply<{ Reply: Static<typeof response> }>) =>
    {
        const offset = (request.query.page - 1) * request.query.limit;

        const [ items, total ] = await fastify.web.getRepository(AccountSession).findAndCount({
            take: request.query.limit,
            skip: offset,
            where:
            {
                account_id: request.account_id
            },
            order:
            {
                created_at: 'DESC'
            } });

        reply.send({ total, items: items.map((s) => ({ id: s.id, device: s.device, expiresAt: s.expires_at.toISOString(), createdAt: s.created_at.toISOString() })) });
    };

    return [ { schema: { querystring: query, response: { 200: response } }, ...rateLimit('account-session', 100, 60 * 60 * 1000), ...authGuard() }, handler ] as const;
}

export function sessionDelete(fastify: FastifyInstance)
{
    const body = Type.Object({ id: Type.Number({ minimum: 1 }) });

    const handler = async(request: FastifyRequest<{ Body: Static<typeof body> }>, reply: FastifyReply) =>
    {
        const session = await fastify.web.getRepository(AccountSession).findOneBy({ id: request.body.id, account_id: request.account_id });

        if (session === null || session.revoked_at)
        {
            throw new BadRequestResponse('ACCOUNT_SESSION_NOT_FOUND_OR_REVOKED', 'id');
        }

        session.revoked_at = new Date();

        await fastify.web.getRepository(AccountSession).save(session);

        reply.send();
    };

    return [ { schema: { body }, ...rateLimit('account-session-delete', 30, 60 * 60 * 1000), ...authGuard() }, handler ] as const;
}

export function history(fastify: FastifyInstance)
{
    const query = Type.Object({ tag: Type.String({ minLength: 1, default: 'ACCOUNT_SIGN_IN' }), page: Type.Number({ minimum: 1, default: 1 }), limit: Type.Number({ minimum: 1, maximum: 30, default: 10 }) });

    const response = Type.Object({
        total: Type.Number(),
        items: Type.Array(Type.Object({
            id: Type.Number(),
            ip: Type.String(),
            userAgent: Type.String(),
            createdAt: Type.String() })) });

    const handler = async(request: FastifyRequest<{ Querystring: Static<typeof query> }>, reply: FastifyReply<{ Reply: Static<typeof response> }>) =>
    {
        const offset = (request.query.page - 1) * request.query.limit;

        const [ items, total ] = await fastify.web.getRepository(AccountHistory).findAndCount({
            take: request.query.limit,
            skip: offset,
            where:
            {
                tag: request.query.tag,
                account_id: request.account_id
            },
            order:
            {
                created_at: 'DESC'
            }
        });

        reply.send({ total, items: items.map((s) => ({ id: s.id, ip: s.ip, value1: s.value1, value2: s.value2, value3: s.value3, value4: s.value4, value5: s.value5, userAgent: s.user_agent, createdAt: s.created_at.toISOString() })) });
    };

    return [ { schema: { querystring: query, response: { 200: response } }, ...rateLimit('account-history', 100, 60 * 60 * 1000), ...authGuard() }, handler ] as const;
}
*/
