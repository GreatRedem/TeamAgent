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
