function integer() {
    return { type: 'integer' } as const;
}

function counts(...keys: string[]) {
    return {
        type: 'object',
        required: keys,
        properties: Object.fromEntries(keys.map((key) => [key, integer()])),
    } as const;
}

export function schemaOverview() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['profiles', 'chats', 'messages', 'requests', 'tokens', 'models'],
                properties: {
                    profiles: counts('total', 'new_week', 'active_week'),
                    chats: counts('today', 'week'),
                    messages: counts('today', 'week'),
                    requests: counts('today', 'week', 'failed_week', 'replies_week'),
                    tokens: counts(
                        'prompt_week',
                        'completion_week',
                        'prompt_total',
                        'completion_total',
                    ),
                    models: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: [
                                'id',
                                'name',
                                'replies',
                                'failures',
                                'prompt_tokens',
                                'completion_tokens',
                            ],
                            properties: {
                                id: integer(),
                                name: { type: 'string' },
                                replies: integer(),
                                failures: integer(),
                                prompt_tokens: integer(),
                                completion_tokens: integer(),
                            },
                        },
                    },
                },
            },
        },
    } as const;
}
