import type { FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import type { Validator } from '../types/validator.js';
import { BadRequestResponse } from '../utils/response.js';

interface Rule {
    type: 'MIN' | 'MAX';
    value: number;
}

function readField(body: unknown, field: string): unknown {
    return (body as Record<string, unknown> | undefined)?.[field];
}

function applyStringRules(value: string, rules: Rule[]): void {
    for (const rule of rules) {
        switch (rule.type) {
            case 'MIN': {
                if (value.length < rule.value) {
                    throw new BadRequestResponse('ERROR_MIN_LENGTH');
                }

                break;
            }
            case 'MAX': {
                if (value.length > rule.value) {
                    throw new BadRequestResponse('ERROR_MAX_LENGTH');
                }

                break;
            }
        }
    }
}

export function bodyField(body: unknown, field: string) {
    const rules: Rule[] = [];

    const builder: Validator = {
        min: (value: number) => {
            rules.push({ type: 'MIN', value });

            return builder;
        },
        max: (value: number) => {
            rules.push({ type: 'MAX', value });

            return builder;
        },
        asString: () => {
            const rawValue = readField(body, field);

            if (rawValue === undefined || rawValue === null) {
                throw new BadRequestResponse('ERROR_REQUIRED');
            }

            if (typeof rawValue !== 'string') {
                throw new BadRequestResponse('ERROR_TYPE_STRING');
            }

            applyStringRules(rawValue, rules);

            return rawValue;
        },
    };

    return builder;
}

export default fastifyPlugin(async (fastify) => {
    fastify.decorateRequest('getBody', function (this: FastifyRequest, field: string) {
        return bodyField(this.body, field);
    });
});
