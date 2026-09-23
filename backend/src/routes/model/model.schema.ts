import { schemaUsage } from '../agent/agent.usage.js';

const model = {
    type: 'object',
    required: ['id', 'name', 'model', 'base_url', 'key_hint', 'context_tokens', 'created_at'],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        model: { type: 'string' },
        base_url: { type: 'string' },
        key_hint: { type: 'string' },
        context_tokens: { type: 'integer' },
        created_at: { type: 'string' },
    },
} as const;

const body = {
    type: 'object',
    required: ['name', 'model', 'base_url', 'api_key'],
    properties: {
        name: { type: 'string' },
        model: { type: 'string' },
        base_url: { type: 'string' },
        api_key: { type: 'string' },
        context_tokens: { type: 'integer' },
    },
} as const;

export const schemaModelCreate = {
    body,
    response: { 200: model },
} as const;

export const schemaModelList = {
    response: {
        200: {
            type: 'object',
            required: ['models', 'limit', 'offset', 'has_more', 'total'],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                models: {
                    type: 'array',
                    items: {
                        ...model,
                        required: [...model.required, 'usage'],
                        properties: { ...model.properties, usage: schemaUsage },
                    },
                },
            },
        },
    },
} as const;

export const schemaModelUpdate = {
    body,
    response: { 200: model },
} as const;

export const schemaModelRemove = {
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

export const schemaModelTest = {
    response: {
        200: {
            type: 'object',
            required: ['ok'],
            properties: {
                ok: { type: 'boolean' },
                context: { type: 'integer' },
                models: { type: 'integer' },
                found: { type: 'boolean' },
                reason: { type: 'string' },
            },
        },
    },
} as const;

export const schemaModelCatalog = {
    response: {
        200: {
            type: 'object',
            required: ['base_url', 'models', 'providers'],
            properties: {
                base_url: { type: 'string' },
                reason: { type: 'string' },
                providers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [
                            'key',
                            'label',
                            'url',
                            'catalog',
                            'key_required',
                            'models',
                            'hint',
                        ],
                        properties: {
                            key: { type: 'string' },
                            label: { type: 'string' },
                            url: { type: 'string' },
                            catalog: { type: 'boolean' },
                            key_required: { type: 'boolean' },
                            models: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    required: ['id', 'context'],
                                    properties: {
                                        id: { type: 'string' },
                                        context: { type: 'integer' },
                                    },
                                },
                            },
                            hint: { type: 'string' },
                        },
                    },
                },
                models: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['id', 'name', 'context', 'prompt', 'completion', 'tools'],
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            context: { type: 'integer' },
                            prompt: { type: 'number' },
                            completion: { type: 'number' },
                            tools: { type: 'boolean' },
                        },
                    },
                },
            },
        },
    },
} as const;

export const schemaModelProbe = {
    body: {
        type: 'object',
        required: ['base_url', 'api_key'],
        properties: {
            base_url: { type: 'string' },
            api_key: { type: 'string' },
            model: { type: 'string' },
            model_id: { type: 'integer' },
        },
    },
    response: {
        200: {
            type: 'object',
            required: ['ok'],
            properties: {
                ok: { type: 'boolean' },
                models: { type: 'integer' },
                found: { type: 'boolean' },
                context: { type: 'integer' },
                ids: { type: 'array', items: { type: 'string' } },
                reason: { type: 'string' },
            },
        },
    },
} as const;

export const schemaModelListIds = {
    body: {
        type: 'object',
        required: ['base_url', 'api_key'],
        properties: {
            base_url: { type: 'string' },
            api_key: { type: 'string' },
            model_id: { type: 'integer' },
        },
    },
    response: {
        200: {
            type: 'object',
            required: ['ok', 'ids'],
            properties: {
                ok: { type: 'boolean' },
                ids: { type: 'array', items: { type: 'string' } },
                reason: { type: 'string' },
            },
        },
    },
} as const;

export { schemaAgentExchanges as schemaModelExchanges } from '../agent/agent.schema.js';
