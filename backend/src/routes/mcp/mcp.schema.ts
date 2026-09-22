/**
 * Only the `response` half is enforced -- `setValidatorCompiler` in `main.ts`
 * disables request validation.
 */

export const schemaMcpTools = {
    response: {
        200: {
            type: 'object',
            required: [ 'tools' ],
            properties: {
                tools: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'name', 'description', 'permission' ],
                        properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            permission: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaProfileFiles = {
    response: {
        200: {
            type: 'object',
            required: [ 'files', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                files: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'name', 'content', 'updated_at' ],
                        properties: {
                            id: { type: 'integer' },
                            name: { type: 'string' },
                            content: { type: 'string' },
                            updated_at: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;
