export const schemaMcpTools = {
    response: {
        200: {
            type: 'object',
            required: ['tools'],
            properties: {
                tools: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['name', 'description', 'permission'],
                        properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            permission: { type: 'string' },
                        },
                    },
                },
            },
        },
    },
} as const;

export const schemaProfileFiles = {
    response: {
        200: {
            type: 'object',
            required: ['files', 'limit', 'offset', 'has_more', 'total'],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                files: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['id', 'agent_id', 'agent_name', 'name', 'content', 'updated_at'],
                        properties: {
                            id: { type: 'integer' },
                            agent_id: { type: 'integer' },
                            agent_name: { type: 'string' },
                            name: { type: 'string' },
                            content: { type: 'string' },
                            updated_at: { type: 'string' },
                        },
                    },
                },
            },
        },
    },
} as const;
