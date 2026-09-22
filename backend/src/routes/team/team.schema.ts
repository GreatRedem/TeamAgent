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
            required: [ 'teams', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
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
    required: [ 'id', 'name', 'token_hint', 'public_url', 'mode', 'agent_id', 'agent_name', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        token_hint: { type: 'string' },
        public_url: { type: 'string' },
        // 'webhook' when the bot has a public url of its own, else 'polling'.
        mode: { type: 'string' },
        // 0 when no agent answers for this bot; the name is '' to match.
        agent_id: { type: 'integer' },
        agent_name: { type: 'string' },
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
        required: [ 'name', 'public_url', 'agent_id' ],
        properties: {
            name: { type: 'string' },
            public_url: { type: 'string' },
            agent_id: { type: 'integer' }
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
            required: [ 'bots', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
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

/**
 * The roster is the team's own JSON, so `members` is declared loosely on
 * purpose: a response schema strips what it does not declare, and pinning the
 * member shape here would silently delete every field a team added that this
 * code does not know about.
 */
export const schemaTeamRoster = {
    response: {
        200: {
            type: 'object',
            required: [ 'members', 'count', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                members: { type: 'array', items: { type: 'object', additionalProperties: true } },
                // The whole team, not the page -- "how big is the team" is a
                // different question from "how many are on screen".
                count: { type: 'integer' },
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                updated_at: { type: 'string' }
            }
        }
    }
} as const;
