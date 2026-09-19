/**
 * Only the `response` half is enforced -- `setValidatorCompiler` in `main.ts`
 * disables request validation, so the `body` entries document the shape while
 * the handlers validate through `request.getBody(...)`.
 */

const agent = {
    type: 'object',
    required: [ 'id', 'name', 'description', 'model_id', 'model_name', 'document_count', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
        // 0 when no model is attached, which happens if the model was removed.
        model_id: { type: 'integer' },
        model_name: { type: 'string' },
        document_count: { type: 'integer' },
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
            required: [ 'agents' ],
            properties: {
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
