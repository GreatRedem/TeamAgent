export function schemaAccountWalletNonce() {
    return {
        body: {
            type: 'object',
            required: ['address'],
            properties: {
                address: { type: 'string' },
            },
        },
        response: {
            200: {
                type: 'object',
                required: ['message'],
                properties: {
                    message: { type: 'string' },
                },
            },
        },
    } as const;
}

export function schemaAccountWalletSignIn() {
    return {
        body: {
            type: 'object',
            required: ['address', 'signature'],
            properties: {
                address: { type: 'string' },
                signature: { type: 'string' },
            },
        },
        response: {
            200: {
                type: 'object',
                required: ['accessToken'],
                properties: {
                    accessToken: { type: 'string' },
                },
            },
        },
    } as const;
}

function limits() {
    return {
        type: ['object', 'null'],
        required: ['projects', 'agents', 'bots', 'tasks'],
        properties: {
            projects: { type: 'integer' },
            agents: { type: 'integer' },
            bots: { type: 'integer' },
            tasks: { type: 'integer' },
        },
    } as const;
}

export function schemaAccountPlans() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['plans'],
                properties: {
                    plans: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['key', 'price', 'limits'],
                            properties: {
                                key: { type: 'string' },
                                price: { type: ['integer', 'null'] },
                                limits: limits(),
                            },
                        },
                    },
                },
            },
        },
    } as const;
}

export function schemaAccountMe() {
    return {
        response: {
            200: {
                type: 'object',
                required: [
                    'id',
                    'admin',
                    'wallet',
                    'phone',
                    'plan',
                    'chosen_plan',
                    'plan_until',
                    'limits',
                    'projects',
                ],
                properties: {
                    id: { type: 'integer' },
                    admin: { type: 'boolean' },
                    wallet: { type: ['string', 'null'] },
                    phone: { type: ['string', 'null'] },
                    plan: { type: 'string' },
                    chosen_plan: { type: 'string' },
                    plan_until: { type: ['string', 'null'] },
                    limits: limits(),
                    projects: { type: 'integer' },
                },
            },
        },
    } as const;
}

export function schemaAccountSmsSend() {
    return {
        body: {
            type: 'object',
            required: ['phone'],
            properties: {
                phone: { type: 'string' },
                locale: { type: 'string' },
            },
        },
        response: {
            200: {
                type: 'object',
                required: ['phone', 'resend_after'],
                properties: {
                    phone: { type: 'string' },
                    resend_after: { type: 'integer' },
                },
            },
        },
    } as const;
}

export function schemaAccountSmsSignIn() {
    return {
        body: {
            type: 'object',
            required: ['phone', 'code'],
            properties: {
                phone: { type: 'string' },
                code: { type: 'string' },
            },
        },
        response: {
            200: {
                type: 'object',
                required: ['accessToken'],
                properties: {
                    accessToken: { type: 'string' },
                },
            },
        },
    } as const;
}
