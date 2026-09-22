const agent = {
    type: 'object',
    required: [ 'id', 'name', 'description', 'model_id', 'model_name', 'document_count', 'permissions', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
        model_id: { type: 'integer' },
        model_name: { type: 'string' },
        document_count: { type: 'integer' },
        permissions: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string' }
    }
} as const;

const document = {
    type: 'object',
    required: [ 'id', 'name', 'content', 'updated_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        content: { type: 'string' },
        updated_at: { type: 'string' }
    }
} as const;

export const schemaAgentCreate = {
    body: {
        type: 'object',
        required: [ 'name', 'description', 'model_id' ],
        properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            model_id: { type: 'integer' }
        }
    },
    response: { 200: agent }
} as const;

export const schemaAgentList = {
    response: {
        200: {
            type: 'object',
            required: [ 'agents', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                agents: { type: 'array', items: agent }
            }
        }
    }
} as const;

export const schemaAgentDetails = {
    response: {
        200: {
            type: 'object',
            required: [ 'agent', 'documents' ],
            properties: {
                agent,
                documents: { type: 'array', items: document }
            }
        }
    }
} as const;

export const schemaAgentUpdate = {
    body: {
        type: 'object',
        required: [ 'name', 'description', 'model_id' ],
        properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            model_id: { type: 'integer' }
        }
    },
    response: { 200: agent }
} as const;

export const schemaAgentRemove = {
    response: {
        200: {
            type: 'object',
            required: [ 'result' ],
            properties: {
                result: { type: 'string' }
            }
        }
    }
} as const;

export const schemaAgentDocumentCreate = {
    body: {
        type: 'object',
        required: [ 'name', 'content' ],
        properties: {
            name: { type: 'string' },
            content: { type: 'string' }
        }
    },
    response: { 200: document }
} as const;

export const schemaAgentDocumentUpdate = {
    body: {
        type: 'object',
        required: [ 'name', 'content' ],
        properties: {
            name: { type: 'string' },
            content: { type: 'string' }
        }
    },
    response: { 200: document }
} as const;

export const schemaAgentDocumentRemove = schemaAgentRemove;

export const schemaAgentPermissionCatalog = {
    response: {
        200: {
            type: 'object',
            required: [ 'permissions' ],
            properties: {
                permissions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'key', 'label', 'description' ],
                        properties: {
                            key: { type: 'string' },
                            label: { type: 'string' },
                            description: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaAgentPermissionUpdate = {
    body: {
        type: 'object',
        required: [ 'permissions' ],
        properties: { permissions: { type: 'array', items: { type: 'string' } } }
    },
    response: { 200: agent }
} as const;

export const schemaAgentExchanges = {
    response: {
        200: {
            type: 'object',
            required: [ 'exchanges', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                exchanges: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'round', 'request', 'response', 'tool_calls', 'duration_ms', 'outcome', 'reason', 'created_at' ],
                        properties: {
                            id: { type: 'integer' },
                            user_id: { type: 'integer' },
                            round: { type: 'integer' },
                            request: { type: 'string' },
                            response: { type: 'string' },
                            tool_calls: { type: 'integer' },
                            duration_ms: { type: 'integer' },
                            outcome: { type: 'string' },
                            reason: { type: 'string' },
                            created_at: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;
