import type { FastifyRequest } from 'fastify';
import type { Validator } from '../types/validator.js';

import fastifyPlugin from 'fastify-plugin';

import { BadRequestResponse } from '../utils/response.js';

interface Rule { type: 'MIN' | 'MAX'; value: number }
interface Transform { type: 'LOWER' | 'UPPER' }

type Source = 'BODY' | 'PARAM' | 'QUERY';

const readField = (request: FastifyRequest, type: Source, field: string): unknown =>
{
    switch (type)
    {
        case 'BODY':
        {
            const body = request.body as Record<string, unknown> | undefined;

            return body?.[field];
        }
        case 'QUERY':
        {
            const query = request.query as Record<string, unknown> | undefined;

            return query?.[field];
        }
        case 'PARAM':
        {
            const params = request.params as Record<string, unknown> | undefined;

            return params?.[field];
        }
    }
};

const applyNumberRules = (value: number, rules: Rule[]): void =>
{
    for (const rule of rules)
    {
        switch (rule.type)
        {
            case 'MIN':
            {
                if (value < rule.value)
                {
                    throw new BadRequestResponse('ERROR_MIN_LENGTH');
                }

                break;
            }
            case 'MAX':
            {
                if (value > rule.value)
                {
                    throw new BadRequestResponse('ERROR_MAX_LENGTH');
                }

                break;
            }
        }
    }
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

const applyStringTransform = (value: string, transform?: Transform): string =>
{
    switch (transform?.type)
    {
        case 'LOWER':
        {
            return value.toLowerCase();
        }
        case 'UPPER':
        {
            return value.toUpperCase();
        }
        default:
        {
            return value;
        }
    }
};

const validator = (request: FastifyRequest, type: Source, field: string) =>
{
    let transform: Transform | undefined;

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
        toLowerCase: () =>
        {
            transform = { type: 'LOWER' };

            return builder;
        },
        toUpperCase: () =>
        {
            transform = { type: 'UPPER' };

            return builder;
        },
        asNumber: () =>
        {
            const rawValue = readField(request, type, field);

            if (rawValue === undefined || rawValue === null)
            {
                throw new BadRequestResponse(`ERROR_REQUIRED`);
            }

            if (typeof rawValue !== 'number')
            {
                throw new BadRequestResponse(`ERROR_TYPE_NUMBER`);
            }

            if (Number.isNaN(rawValue))
            {
                throw new BadRequestResponse(`ERROR_FORMAT_NUMBER`);
            }

            applyNumberRules(rawValue, rules);

            return rawValue;
        },
        asString: () =>
        {
            const rawValue = readField(request, type, field);

            if (rawValue === undefined || rawValue === null)
            {
                throw new BadRequestResponse(`ERROR_REQUIRED`);
            }

            if (typeof rawValue !== 'string')
            {
                throw new BadRequestResponse(`ERROR_TYPE_STRING`);
            }

            applyStringRules(rawValue, rules);

            return applyStringTransform(rawValue, transform);
        },
        asEmail: () =>
        {
            const rawValue = readField(request, type, field);

            if (rawValue === undefined || rawValue === null)
            {
                throw new BadRequestResponse(`ERROR_REQUIRED`);
            }

            if (typeof rawValue !== 'string')
            {
                throw new BadRequestResponse(`ERROR_TYPE_STRING`);
            }

            applyStringRules(rawValue, rules);

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawValue))
            {
                throw new BadRequestResponse(`ERROR_FORMAT_EMAIL`);
            }

            return applyStringTransform(rawValue, transform);
        },
        asStringOptional: () =>
        {
            const rawValue = readField(request, type, field);

            if (typeof rawValue !== 'string')
            {
                return;
            }

            applyStringRules(rawValue, rules);

            return applyStringTransform(rawValue, transform);
        },
        asNumberOptional: () =>
        {
            const rawValue = readField(request, type, field);

            if (typeof rawValue !== 'string')
            {
                return;
            }

            const rawValueAsNumber = Number.parseInt(rawValue);

            if (Number.isNaN(rawValueAsNumber))
            {
                return;
            }

            applyNumberRules(rawValueAsNumber, rules);

            return rawValueAsNumber;
        },
        asStringDefault: (value: string) =>
        {
            return builder.asStringOptional() ?? value;
        },
        asNumberDefault: (value: number) =>
        {
            return builder.asNumberOptional() ?? value;
        }
    };

    return builder;
};

export default fastifyPlugin(async function(fastify)
{
    fastify.decorateRequest('getBody', function(this: FastifyRequest, field: string)
    {
        return validator(this, 'BODY', field);
    });

    fastify.decorateRequest('getQuery', function(this: FastifyRequest, field: string)
    {
        return validator(this, 'QUERY', field);
    });

    fastify.decorateRequest('getParam', function(this: FastifyRequest, field: string)
    {
        return validator(this, 'PARAM', field);
    });
});
