function team() {
    return {
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
}

export function schemaTeamCreate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'description'],
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
            },
        },
        response: {
            200: team(),
        },
    } as const;
}

export function schemaTeamArchive() {
    return {
        body: {
            type: 'object',
            required: ['archived'],
            properties: {
                archived: { type: 'boolean' },
            },
        },
        response: {
            200: team(),
        },
    } as const;
}

export function schemaTeamRemove() {
    return {
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
}

export function schemaTeamList() {
    return {
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
                    teams: { type: 'array', items: team() },
                },
            },
        },
    } as const;
}

export function schemaTeamDetails() {
    return {
        response: {
            200: team(),
        },
    } as const;
}

export function schemaTeamUpdate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'description'],
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
            },
        },
        response: {
            200: team(),
        },
    } as const;
}

function bot() {
    return {
        type: 'object',
        required: [
            'id',
            'name',
            'token_hint',
            'public_url',
            'mode',
            'agent_id',
            'agent_name',
            'groups',
            'profiles',
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
            groups: { type: 'boolean' },
            profiles: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['id', 'name'],
                    properties: { id: { type: 'integer' }, name: { type: 'string' } },
                },
            },
            created_at: { type: 'string' },
        },
    } as const;
}

export function schemaTeamBotCreate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'token'],
            properties: {
                name: { type: 'string' },
                token: { type: 'string' },
            },
        },
        response: {
            200: bot(),
        },
    } as const;
}

export function schemaTeamBotUpdate() {
    return {
        body: {
            type: 'object',
            required: ['name', 'public_url', 'agent_id'],
            properties: {
                name: { type: 'string' },
                public_url: { type: 'string' },
                agent_id: { type: 'integer' },
                groups: { type: 'boolean' },
                profiles: { type: 'array', items: { type: 'integer' } },
                token: { type: 'string' },
            },
        },
        response: {
            200: bot(),
        },
    } as const;
}

export function schemaTeamBotList() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['bots', 'limit', 'offset', 'has_more', 'total'],
                properties: {
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    has_more: { type: 'boolean' },
                    total: { type: 'integer' },
                    bots: { type: 'array', items: bot() },
                },
            },
        },
    } as const;
}

export function schemaTeamBotRemove() {
    return {
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
}

export function schemaTeamBotTest() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['ok'],
                properties: {
                    ok: { type: 'boolean' },
                    username: { type: 'string' },
                    reads_groups: { type: 'boolean' },
                    reason: { type: 'string' },
                },
            },
        },
    } as const;
}

function rosterMembers() {
    return {
        200: {
            type: 'object',
            required: ['members', 'count'],
            properties: {
                members: { type: 'array', items: { type: 'object', additionalProperties: true } },
                count: { type: 'integer' },
            },
        },
    } as const;
}

export function schemaRosterMemberSave() {
    return {
        body: {
            type: 'object',
            required: ['member'],
            properties: {
                previous_name: { type: 'string' },
                member: { type: 'object', additionalProperties: true },
            },
        },
        response: rosterMembers(),
    } as const;
}

export function schemaRosterMemberRemove() {
    return {
        querystring: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
        },
        response: rosterMembers(),
    } as const;
}

export function schemaTeamRoster() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['members', 'count', 'limit', 'offset', 'has_more', 'total'],
                properties: {
                    members: {
                        type: 'array',
                        items: { type: 'object', additionalProperties: true },
                    },
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
}
