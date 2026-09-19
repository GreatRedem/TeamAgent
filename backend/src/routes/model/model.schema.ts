/**
 * Only the `response` half is enforced -- `setValidatorCompiler` in `main.ts`
 * disables request validation, so the `body` entries document the shape while
 * the handlers validate through `request.getBody(...)`.
 *
 * No `api_key` field anywhere on the way out, on purpose: a response schema
 * strips what it does not declare, so even a handler mistake cannot return the
 * credential.
 */

const model = {
    type: 'object',
    required: [ 'id', 'name', 'model', 'base_url', 'key_hint', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        model: { type: 'string' },
        base_url: { type: 'string' },
        key_hint: { type: 'string' },
        created_at: { type: 'string' }
    }
} as const;

const body = {
    type: 'object',
    required: [ 'name', 'model', 'base_url', 'api_key' ],
    properties: {
        name: { type: 'string' },
        model: { type: 'string' },
        base_url: { type: 'string' },
        api_key: { type: 'string' }
    }
} as const;

export const schemaModelCreate = {
    body,
    response: { 200: model }
} as const;

export const schemaModelList = {
    response: {
        200: {
            type: 'object',
            required: [ 'models' ],
            properties: {
                models: { type: 'array', items: model }
            }
        }
    }
} as const;

/** An empty `api_key` here means "keep the stored one". */
export const schemaModelUpdate = {
    body,
    response: { 200: model }
} as const;

export const schemaModelRemove = {
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

/**
 * A model that fails its check is still a successful request -- the answer is
 * "no" -- so the outcome is reported in the body rather than as an error
 * status. `found` says whether the configured model name appeared in the
 * endpoint's own list.
 */
export const schemaModelTest = {
    response: {
        200: {
            type: 'object',
            required: [ 'ok' ],
            properties: {
                ok: { type: 'boolean' },
                models: { type: 'integer' },
                found: { type: 'boolean' },
                reason: { type: 'string' }
            }
        }
    }
} as const;
