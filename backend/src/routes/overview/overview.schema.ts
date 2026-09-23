const integer = { type: 'integer' } as const;

const counts = (...keys: string[]) =>
    ({
        type: 'object',
        required: keys,
        properties: Object.fromEntries(keys.map((key) => [key, integer])),
    }) as const;

// A project at a glance: its people, what they wrote, what the agents asked of their models,
// and what that cost, over the last day, the last week and all time.
export const schemaOverview = {
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
                            id: integer,
                            name: { type: 'string' },
                            replies: integer,
                            failures: integer,
                            prompt_tokens: integer,
                            completion_tokens: integer,
                        },
                    },
                },
            },
        },
    },
} as const;
