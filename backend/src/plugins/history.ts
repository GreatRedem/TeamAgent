import type { FastifyRequest } from 'fastify';

import fastifyPlugin from 'fastify-plugin';

import { AccountHistory } from '../routes/account/account.entity.js';

export default fastifyPlugin(async function(fastify)
{
    fastify.decorateRequest('accountHistory', async function(this: FastifyRequest, tag: string, value1?: string | number, value2?: string | number, value3?: string | number, value4?: string | number, value5?: string | number)
    {
        try
        {
            await fastify.db.getRepository(AccountHistory).save({
                tag,
                ip: this.ip,
                account_id: this.account_id,
                value1: value1 ? `${ value1 }` : undefined,
                value2: value2 ? `${ value2 }` : undefined,
                value3: value3 ? `${ value3 }` : undefined,
                value4: value4 ? `${ value4 }` : undefined,
                value5: value5 ? `${ value5 }` : undefined,
                user_agent: this.headers['user-agent'] || '' });
        }
        catch (error)
        {
            fastify.log.error(error);
        }
    });
});
