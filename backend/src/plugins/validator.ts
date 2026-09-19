import type { FastifyRequest } from 'fastify';
import type { Validator } from '../types/validator.js';

import fastifyPlugin from 'fastify-plugin';

import { BadRequestResponse } from '../utils/response.js';

interface Rule { type: 'MIN' | 'MAX'; value: number }

const readField = (request: FastifyRequest, field: string): unknown =>
{
    const body = request.body as Record<string, unknown> | undefined;

    return body?.[field];
};

const applyStringRules = (value: string, rules: Rule[]): void =>
{
    for (const rule of rules)
    {
        switch (rule.type)
        {
            case 'MIN':
            {
                if (value.length < rule.value)
                {
                    throw new BadRequestResponse('ERROR_MIN_LENGTH');
                }

                break;
            }
            case 'MAX':
            {
                if (value.length > rule.value)
                {
                    throw new BadRequestResponse('ERROR_MAX_LENGTH');
                }

                break;
            }
        }
    }
};

const validator = (request: FastifyRequest, field: string) =>
{
    const rules: Rule[] = [ ];

    const builder: Validator = {
        min: (value: number) =>
        {
            rules.push({ type: 'MIN', value });

            return builder;
        },
        max: (value: number) =>
        {
            rules.push({ type: 'MAX', value });

            return builder;
        },
        asString: () =>
        {
            const rawValue = readField(request, field);

            if (rawValue === undefined || rawValue === null)
            {
                throw new BadRequestResponse('ERROR_REQUIRED');
            }

            if (typeof rawValue !== 'string')
            {
                throw new BadRequestResponse('ERROR_TYPE_STRING');
            }

            applyStringRules(rawValue, rules);

            return rawValue;
        }
    };

    return builder;
};

export default fastifyPlugin(async function(fastify)
{
    fastify.decorateRequest('getBody', function(this: FastifyRequest, field: string)
    {
        return validator(this, field);
    });
});
