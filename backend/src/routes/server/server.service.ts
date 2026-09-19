import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { rateLimit } from '../../plugins/ratelimit.js';
import { authGuard } from '../../plugins/authentication.js';

import { Account } from '../account/account.entity.js';

import { schemaCharacterChange, schemaCharacterList, schemaRealmList } from './server.schema.js';

import { PRICE } from '../../utils/constants.js';
import { executeCommand } from '../../utils/soap.js';
import { BadRequestResponse, InternalErrorResponse } from '../../utils/response.js';

export function realmList()
{
    const handler = async(_request: FastifyRequest, reply: FastifyReply) =>
    {
        const response = await executeCommand(0, `.website realmlist`);

        if (typeof response === 'boolean')
        {
            throw new InternalErrorResponse();
        }

        const message: { id: number; name: string }[ ] = [ ];

        for (const realm of response.split(';'))
        {
            const realmData = realm.split(',');

            if (realmData.length !== 2)
            {
                continue;
            }

            message.push({ id: Number(realmData[0]), name: realmData[1] });
        }

        reply.send({ message });
    };

    return { schema: schemaRealmList, config: { ...rateLimit('server-realm-list', 30, 2 * 60 * 1000) }, handler };
}

export function characterList()
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const realmId = request.getQuery('realm_id').min(1).asNumber();

        const response = await executeCommand(realmId, `.website characterlist ${ request.account_id }`);

        if (typeof response === 'boolean')
        {
            throw new InternalErrorResponse();
        }

        const message: { id: number; name: string; race: number; class: number; gender: number; level: number }[ ] = [ ];

        for (const character of response.split(';'))
        {
            const characterData = character.split(',');

            if (characterData.length !== 6)
            {
                continue;
            }

            message.push({ id: Number(characterData[0]), name: characterData[1], race: Number(characterData[2]), class: Number(characterData[3]), gender: Number(characterData[4]), level: Number(characterData[5]) });
        }

        reply.send({ message });
    };

    return { schema: schemaCharacterList, config: { ...rateLimit('server-character-list', 30, 2 * 60 * 1000), ...authGuard() }, handler };
}

export function characterChange(fastify: FastifyInstance)
{
    const handler = async(request: FastifyRequest, reply: FastifyReply) =>
    {
        const type = request.getBody('type').min(1).max(4).asNumber();

        let price = 0;
        let command = '';

        if (type === 1) // race
        {
            command = 'changerace';

            price = PRICE.RACE;
        }
        else if (type === 2) // faction
        {
            command = 'changefaction';

            price = PRICE.FACTION;
        }
        else if (type === 3) // rename
        {
            command = 'rename';

            price = PRICE.RENAME;
        }
        else if (type === 4) //  customize appereance
        {
            command = 'customize';

            price = PRICE.CUSTOMIZE;
        }
        else // level 80
        {
            command = 'level';

            price = PRICE.LEVEL;
        }

        const account = await fastify.db.getRepository(Account).findOneBy({ id: request.account_id });

        if (!account || account.usdt < price)
        {
            throw new BadRequestResponse('CHARACTER_CHANGE_INSUFFICENT');
        }

        const realmId = request.getBody('realm_id').min(1).asNumber();
        const characterId = request.getBody('character_id').min(1).asNumber();

        const response = await executeCommand(realmId, `.website characterlist ${ request.account_id }`);

        if (typeof response === 'boolean')
        {
            throw new InternalErrorResponse();
        }

        let characterName = '';

        for (const character of response.split(';'))
        {
            const characterData = character.split(',');

            if (characterData.length !== 6)
            {
                continue;
            }

            if (Number(characterData[0]) === characterId)
            {
                characterName = characterData[1];
            }
        }

        if (characterName === '') // no character found
        {
            throw new InternalErrorResponse();
        }

        const response2 = await executeCommand(realmId, `.character ${ command } ${ characterName }${ command === 'level' ? ' 80' : '' }`);

        if (typeof response2 === 'boolean')
        {
            throw new InternalErrorResponse();
        }

        account.usdt -= price;

        await fastify.db.getRepository(Account).save(account);

        reply.send();
    };

    return { schema: schemaCharacterChange, config: { ...rateLimit('server-character-change', 30, 2 * 60 * 1000), ...authGuard() }, handler };
}
