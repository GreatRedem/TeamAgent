import { schemaUsage } from '../../constant.js';

function agent() {
    return {
        type: 'object',
        required: [
            'id',
            'name',
            'description',
            'model_id',
            'model_name',
            'document_count',
            'permissions',
            'created_at',
        ],
        properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            description: { type: 'string' },
            model_id: { type: 'integer' },
            model_name: { type: 'string' },
            document_count: { type: 'integer' },
            permissions: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string' },
        },
    } as const;
}

function document() {
    return {
        type: 'object',
        required: ['id', 'name', 'content', 'updated_at'],
        properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            content: { type: 'string' },
            updated_at: { type: 'string' },
        },
    } as const;
}

export function schemaAgentCreate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'description', 'model_id'],
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                model_id: { type: 'integer' },
                instructions: { type: 'string' },
            },
        },
        response: { 200: agent() },
    } as const;
}

export function schemaAgentList() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['agents', 'limit', 'offset', 'has_more', 'total'],
                properties: {
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    has_more: { type: 'boolean' },
                    total: { type: 'integer' },
                    agents: {
                        type: 'array',
                        items: {
                            ...agent(),
                            required: [...agent().required, 'usage'],
                            properties: { ...agent().properties, usage: schemaUsage },
                        },
                    },
                },
            },
        },
    } as const;
}

export function schemaAgentDetails() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['agent', 'documents', 'usage'],
                properties: {
                    agent: agent(),
                    documents: { type: 'array', items: document() },
                    usage: schemaUsage,
                },
            },
        },
    } as const;
}

export function schemaAgentUpdate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'description', 'model_id'],
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                model_id: { type: 'integer' },
            },
        },
        response: { 200: agent() },
    } as const;
}

export function schemaAgentRemove() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['result'],
                properties: {
                    result: { type: 'string' },
                },
            },
        },
    } as const;
}

export function schemaAgentDocumentCreate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'content'],
            properties: {
                name: { type: 'string' },
                content: { type: 'string' },
            },
        },
        response: { 200: document() },
    } as const;
}

export function schemaAgentDocumentUpdate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'content'],
            properties: {
                name: { type: 'string' },
                content: { type: 'string' },
            },
        },
        response: { 200: document() },
    } as const;
}

export function schemaAgentDocumentRemove() {
    return schemaAgentRemove();
}

export function schemaAgentPermissionCatalog() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['permissions'],
                properties: {
                    permissions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['key', 'label', 'description'],
                            properties: {
                                key: { type: 'string' },
                                label: { type: 'string' },
                                description: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    } as const;
}

export function schemaAgentPermissionUpdate() {
    return {
        body: {
            type: 'object',
            required: ['permissions'],
            properties: { permissions: { type: 'array', items: { type: 'string' } } },
        },
        response: { 200: agent() },
    } as const;
}

export function schemaAgentExchanges() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['exchanges', 'limit', 'offset', 'has_more', 'total'],
                properties: {
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    has_more: { type: 'boolean' },
                    total: { type: 'integer' },
                    exchanges: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: [
                                'id',
                                'agent_id',
                                'agent_name',
                                'round',
                                'request',
                                'response',
                                'tool_calls',
                                'prompt_tokens',
                                'completion_tokens',
                                'tokens_estimated',
                                'duration_ms',
                                'outcome',
                                'reason',
                                'created_at',
                            ],
                            properties: {
                                id: { type: 'integer' },
                                agent_id: { type: 'integer' },
                                agent_name: { type: 'string' },
                                user_id: { type: 'integer' },
                                round: { type: 'integer' },
                                request: { type: 'string' },
                                response: { type: 'string' },
                                tool_calls: { type: 'integer' },
                                prompt_tokens: { type: 'integer' },
                                completion_tokens: { type: 'integer' },
                                tokens_estimated: { type: 'boolean' },
                                duration_ms: { type: 'integer' },
                                outcome: { type: 'string' },
                                reason: { type: 'string' },
                                created_at: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    } as const;
}
