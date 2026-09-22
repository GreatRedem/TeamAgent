const team = {
    type: 'object',
    required: ['id', 'name', 'description', 'created_at', 'updated_at'],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: 'string' },
        archived_at: { type: ['string', 'null'] },
        created_at: { type: 'string' },
        updated_at: { type: 'string' },
    },
} as const;

export const schemaTeamCreate = {
    body: {
        type: 'object',
        required: ['name', 'description'],
        properties: {
            name: { type: 'string' },
            description: { type: 'string' },
        },
    },
    response: {
        200: team,
    },
} as const;

export const schemaTeamArchive = {
    body: {
        type: 'object',
        required: ['archived'],
        properties: {
            archived: { type: 'boolean' },
        },
    },
    response: {
        200: team,
    },
} as const;

export const schemaTeamRemove = {
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

export const schemaTeamList = {
    querystring: {
        type: 'object',
        properties: {
            archived: { type: 'boolean' },
        },
    },
    response: {
        200: {
            type: 'object',
            required: ['teams', 'limit', 'offset', 'has_more', 'total'],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                teams: { type: 'array', items: team },
            },
        },
    },
} as const;

export const schemaTeamDetails = {
    response: {
        200: team,
    },
} as const;

export const schemaTeamUpdate = {
    body: {
        type: 'object',
        required: ['name', 'description'],
        properties: {
            name: { type: 'string' },
            description: { type: 'string' },
        },
    },
    response: {
        200: team,
    },
} as const;

const bot = {
    type: 'object',
    required: [
        'id',
        'name',
        'token_hint',
        'public_url',
        'mode',
        'agent_id',
        'agent_name',
        'created_at',
    ],
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        token_hint: { type: 'string' },
        public_url: { type: 'string' },
        mode: { type: 'string' },
        agent_id: { type: 'integer' },
        agent_name: { type: 'string' },
        created_at: { type: 'string' },
    },
} as const;

export const schemaTeamBotCreate = {
    body: {
        type: 'object',
        required: ['name', 'token'],
        properties: {
            name: { type: 'string' },
            token: { type: 'string' },
        },
    },
    response: {
        200: bot,
    },
} as const;

export const schemaTeamBotUpdate = {
    body: {
        type: 'object',
        required: ['name', 'public_url', 'agent_id'],
        properties: {
            name: { type: 'string' },
            public_url: { type: 'string' },
            agent_id: { type: 'integer' },
        },
    },
    response: {
        200: bot,
    },
} as const;

export const schemaTeamBotList = {
    response: {
        200: {
            type: 'object',
            required: ['bots', 'limit', 'offset', 'has_more', 'total'],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                bots: { type: 'array', items: bot },
            },
        },
    },
} as const;

export const schemaTeamBotRemove = {
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

export const schemaTeamBotTest = {
    response: {
        200: {
            type: 'object',
            required: ['ok'],
            properties: {
                ok: { type: 'boolean' },
                username: { type: 'string' },
                reason: { type: 'string' },
            },
        },
    },
} as const;

export const schemaTeamRoster = {
    response: {
        200: {
            type: 'object',
            required: ['members', 'count', 'limit', 'offset', 'has_more', 'total'],
            properties: {
                members: { type: 'array', items: { type: 'object', additionalProperties: true } },
                count: { type: 'integer' },
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                updated_at: { type: 'string' },
            },
        },
    },
} as const;
