function ticket() {
    return {
        type: 'object',
        required: ['id', 'subject', 'status', 'customer', 'created_at', 'updated_at'],
        properties: {
            id: { type: 'integer' },
            subject: { type: 'string' },
            status: { type: 'string' },
            customer: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
        },
    } as const;
}

function message() {
    return {
        type: 'object',
        required: ['id', 'staff', 'body', 'created_at'],
        properties: {
            id: { type: 'integer' },
            staff: { type: 'boolean' },
            body: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
        },
    } as const;
}

function page() {
    return {
        querystring: {
            type: 'object',
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                status: { type: 'string' },
            },
        },
        response: {
            200: {
                type: 'object',
                required: ['tickets', 'limit', 'offset', 'has_more', 'total'],
                properties: {
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    has_more: { type: 'boolean' },
                    total: { type: 'integer' },
                    tickets: { type: 'array', items: ticket() },
                },
            },
        },
    } as const;
}

export function schemaTicketList() {
    return page();
}

export function schemaSupportList() {
    return page();
}

export function schemaTicketCreate() {
    return {
        body: {
            type: 'object',
            required: ['subject', 'body'],
            properties: {
                subject: { type: 'string' },
                body: { type: 'string' },
            },
        },
        response: { 200: ticket() },
    } as const;
}

export function schemaTicketDetails() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['ticket', 'messages', 'account'],
                properties: {
                    ticket: ticket(),
                    messages: { type: 'array', items: message() },
                    account: {
                        type: ['object', 'null'],
                        required: ['id', 'wallet', 'phone', 'plan', 'chosen_plan', 'plan_until'],
                        properties: {
                            id: { type: 'integer' },
                            wallet: { type: ['string', 'null'] },
                            phone: { type: ['string', 'null'] },
                            plan: { type: 'string' },
                            chosen_plan: { type: 'string' },
                            plan_until: { type: ['string', 'null'] },
                        },
                    },
                },
            },
        },
    } as const;
}

export function schemaTicketReply() {
    return {
        body: {
            type: 'object',
            required: ['body'],
            properties: {
                body: { type: 'string' },
            },
        },
        response: { 200: message() },
    } as const;
}

export function schemaTicketStatus() {
    return {
        body: {
            type: 'object',
            required: ['status'],
            properties: {
                status: { type: 'string', enum: ['open', 'closed'] },
            },
        },
        response: { 200: ticket() },
    } as const;
}

export function schemaSupportPlan() {
    return {
        body: {
            type: 'object',
            required: ['plan', 'plan_until'],
            properties: {
                plan: { type: 'string' },
                plan_until: { type: ['string', 'null'] },
            },
        },
        response: {
            200: {
                type: 'object',
                required: ['plan', 'plan_until'],
                properties: {
                    plan: { type: 'string' },
                    plan_until: { type: ['string', 'null'] },
                },
            },
        },
    } as const;
}
