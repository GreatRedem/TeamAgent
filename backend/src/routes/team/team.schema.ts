/**
 * Only the `response` half of these is enforced -- `setValidatorCompiler` in
 * `main.ts` disables request validation, so the `body` entries document the
 * shape while the handlers validate through `request.getBody(...)`.
 *
 * A field missing from a response schema is stripped from the payload, so
 * these must stay in step with what the handlers send.
 */

const team = {
    type: 'object',
    required: [ 'id', 'name', 'description', 'created_at', 'updated_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    }
} as const;

export const schemaTeamCreate = {
    body: {
        type: 'object',
        required: [ 'name', 'description' ],
        properties: {
            name: { type: 'string' },
            description: { type: 'string' }
        }
    },
    response: {
        200: team
    }
} as const;

export const schemaTeamList = {
    response: {
        200: {
            type: 'object',
            required: [ 'teams' ],
            properties: {
                teams: { type: 'array', items: team }
            }
        }
    }
} as const;

export const schemaTeamDetails = {
    response: {
        200: team
    }
} as const;

export const schemaTeamUpdate = {
    body: {
        type: 'object',
        required: [ 'name', 'description' ],
        properties: {
            name: { type: 'string' },
            description: { type: 'string' }
        }
    },
    response: {
        200: team
    }
} as const;

/**
 * No `token` field, on purpose. A response schema strips what it does not
 * declare, so even if a handler passed the whole row through, the BotFather
 * credential could not reach the client.
 */
const bot = {
    type: 'object',
    required: [ 'id', 'name', 'token_hint', 'public_url', 'mode', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        token_hint: { type: 'string' },
        public_url: { type: 'string' },
        // 'webhook' when the bot has a public url of its own, else 'polling'.
        mode: { type: 'string' },
        created_at: { type: 'string' }
    }
} as const;

export const schemaTeamBotCreate = {
    body: {
        type: 'object',
        required: [ 'name', 'token' ],
        properties: {
            name: { type: 'string' },
            token: { type: 'string' }
        }
    },
    response: {
        200: bot
    }
} as const;

export const schemaTeamBotUpdate = {
    body: {
        type: 'object',
        required: [ 'name', 'public_url' ],
        properties: {
            name: { type: 'string' },
            public_url: { type: 'string' }
        }
    },
    response: {
        200: bot
    }
} as const;

export const schemaTeamBotList = {
    response: {
        200: {
            type: 'object',
            required: [ 'bots' ],
            properties: {
                bots: { type: 'array', items: bot }
            }
        }
    }
} as const;

export const schemaTeamBotRemove = {
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
 * A bot that fails its check is still a successful request -- the answer is
 * "no" -- so this reports the outcome in the body rather than as an error
 * status. `reason` is only set when `ok` is false, `username` only when true.
 */
export const schemaTeamBotTest = {
    response: {
        200: {
            type: 'object',
            required: [ 'ok' ],
            properties: {
                ok: { type: 'boolean' },
                username: { type: 'string' },
                reason: { type: 'string' }
            }
        }
    }
} as const;
