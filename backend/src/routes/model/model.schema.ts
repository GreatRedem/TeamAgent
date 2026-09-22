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
    required: [ 'id', 'name', 'model', 'base_url', 'key_hint', 'context_tokens', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        model: { type: 'string' },
        base_url: { type: 'string' },
        key_hint: { type: 'string' },
        context_tokens: { type: 'integer' },
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
        api_key: { type: 'string' },
        /** 0 when the caller does not know it; the reply path falls back. */
        context_tokens: { type: 'integer' }
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
            required: [ 'models', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
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
                /** The window the endpoint declared, 0 when it did not say. */
                context: { type: 'integer' },
                models: { type: 'integer' },
                found: { type: 'boolean' },
                reason: { type: 'string' }
            }
        }
    }
} as const;


/**
 * The provider catalog. `reason` appears only when the listing could not be
 * refreshed, in which case `models` is the last good copy and may be empty.
 */
export const schemaModelCatalog = {
    response: {
        200: {
            type: 'object',
            required: [ 'base_url', 'models', 'providers' ],
            properties: {
                base_url: { type: 'string' },
                reason: { type: 'string' },
                // The add form's provider choices, so their urls have one
                // definition rather than being repeated in the client.
                providers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'key', 'label', 'url', 'catalog', 'key_required', 'models', 'hint' ],
                        properties: {
                            key: { type: 'string' },
                            label: { type: 'string' },
                            url: { type: 'string' },
                            catalog: { type: 'boolean' },
                            key_required: { type: 'boolean' },
                            // Documented names for a provider that serves no
                            // listing; `context` is 0 where none is published.
                            models: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    required: [ 'id', 'context' ],
                                    properties: {
                                        id: { type: 'string' },
                                        context: { type: 'integer' }
                                    }
                                }
                            },
                            hint: { type: 'string' }
                        }
                    }
                },
                models: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'name', 'context', 'prompt', 'completion' ],
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            context: { type: 'integer' },
                            prompt: { type: 'number' },
                            completion: { type: 'number' }
                        }
                    }
                }
            }
        }
    }
} as const;

/**
 * Same flat outcome as the saved-model test, plus the names the endpoint
 * listed -- the add form needs those to suggest models for a provider whose
 * listing cannot be shared through `/model/catalog`.
 *
 * Nothing else from the response escapes: no body, no headers, no status.
 */
export const schemaModelProbe = {
    body: {
        type: 'object',
        required: [ 'base_url', 'api_key' ],
        properties: {
            base_url: { type: 'string' },
            api_key: { type: 'string' },
            /** Optional: absent simply leaves `found` false. */
            model: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'object',
            required: [ 'ok' ],
            properties: {
                ok: { type: 'boolean' },
                models: { type: 'integer' },
                found: { type: 'boolean' },
                context: { type: 'integer' },
                ids: { type: 'array', items: { type: 'string' } },
                reason: { type: 'string' }
            }
        }
    }
} as const;
