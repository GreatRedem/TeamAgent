function strings() {
    return { type: 'object', additionalProperties: { type: 'string' } } as const;
}

function plugin() {
    return {
        type: 'object',
        required: [
            'id',
            'kind',
            'name',
            'enabled',
            'config',
            'secrets',
            'agents',
            'hook_agent_id',
            'hook_url',
            'hook_events',
            'hook_secret',
            'hook_path',
            'account',
            'listening',
            'listen_error',
            'stats',
            'created_at',
        ],
        properties: {
            id: { type: 'integer' },
            kind: { type: 'string' },
            name: { type: 'string' },
            enabled: { type: 'boolean' },
            config: strings(),
            secrets: strings(),
            agents: { type: 'array', items: { type: 'integer' } },
            hook_agent_id: { type: 'integer' },
            hook_url: { type: 'string' },
            hook_events: { type: 'array', items: { type: 'string' } },
            hook_secret: { type: 'string' },
            hook_path: { type: 'string' },
            account: { type: 'string' },
            listening: { type: 'boolean' },
            listen_error: { type: 'string' },
            stats: {
                type: 'object',
                required: [
                    'requests',
                    'failures',
                    'inbound',
                    'replies',
                    'day',
                    'week',
                    'average_ms',
                    'last_at',
                ],
                properties: {
                    requests: { type: 'integer' },
                    failures: { type: 'integer' },
                    inbound: { type: 'integer' },
                    replies: { type: 'integer' },
                    day: { type: 'integer' },
                    week: { type: 'integer' },
                    average_ms: { type: 'integer' },
                    last_at: { type: ['string', 'null'] },
                },
            },
            created_at: { type: 'string' },
        },
    } as const;
}

export function schemaPluginCatalog() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['kinds', 'events'],
                properties: {
                    events: { type: 'array', items: { type: 'string' } },
                    kinds: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: [
                                'key',
                                'label',
                                'description',
                                'inbound',
                                'inbound_hint',
                                'fields',
                                'tools',
                            ],
                            properties: {
                                key: { type: 'string' },
                                label: { type: 'string' },
                                description: { type: 'string' },
                                inbound: { type: 'string' },
                                inbound_hint: { type: 'string' },
                                fields: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: [
                                            'key',
                                            'label',
                                            'secret',
                                            'required',
                                            'hint',
                                            'placeholder',
                                        ],
                                        properties: {
                                            key: { type: 'string' },
                                            label: { type: 'string' },
                                            secret: { type: 'boolean' },
                                            required: { type: 'boolean' },
                                            hint: { type: 'string' },
                                            placeholder: { type: 'string' },
                                            format: { type: 'string' },
                                        },
                                    },
                                },
                                tools: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: ['name', 'description'],
                                        properties: {
                                            name: { type: 'string' },
                                            description: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    } as const;
}

export function schemaPluginList() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['plugins'],
                properties: { plugins: { type: 'array', items: plugin() } },
            },
        },
    } as const;
}

export function schemaPluginSave() {
    return { response: { 200: plugin() } } as const;
}

export function schemaPluginTest() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['ok', 'error', 'plugin'],
                properties: {
                    ok: { type: 'boolean' },
                    error: { type: 'string' },
                    plugin: plugin(),
                },
            },
        },
    } as const;
}

export function schemaPluginResult() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['result'],
                properties: { result: { type: 'string' } },
            },
        },
    } as const;
}

export function schemaPluginCalls() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['calls', 'actions', 'limit', 'offset', 'has_more', 'total'],
                properties: {
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    has_more: { type: 'boolean' },
                    total: { type: 'integer' },
                    actions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: [
                                'direction',
                                'action',
                                'count',
                                'failures',
                                'average_ms',
                                'last_at',
                            ],
                            properties: {
                                direction: { type: 'string' },
                                action: { type: 'string' },
                                count: { type: 'integer' },
                                failures: { type: 'integer' },
                                average_ms: { type: 'integer' },
                                last_at: { type: 'string' },
                            },
                        },
                    },
                    calls: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: [
                                'id',
                                'direction',
                                'action',
                                'ok',
                                'status',
                                'duration_ms',
                                'agent_id',
                                'agent_name',
                                'thread',
                                'request',
                                'response',
                                'error',
                                'created_at',
                            ],
                            properties: {
                                id: { type: 'integer' },
                                direction: { type: 'string' },
                                action: { type: 'string' },
                                ok: { type: 'boolean' },
                                status: { type: 'integer' },
                                duration_ms: { type: 'integer' },
                                agent_id: { type: 'integer' },
                                agent_name: { type: 'string' },
                                thread: { type: 'string' },
                                request: { type: 'string' },
                                response: { type: 'string' },
                                error: { type: 'string' },
                                created_at: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    } as const;
}

export function schemaPluginHook() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['ok'],
                properties: {
                    ok: { type: 'boolean' },
                    answered: { type: 'boolean' },
                    reply: { type: ['string', 'null'] },
                    error: { type: ['string', 'null'] },
                },
            },
        },
    } as const;
}
