export function schemaAuditList() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['entries', 'limit', 'offset', 'has_more', 'total'],
                properties: {
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    has_more: { type: 'boolean' },
                    total: { type: 'integer' },
                    entries: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: [
                                'id',
                                'action',
                                'target',
                                'outcome',
                                'detail',
                                'changes',
                                'duration_ms',
                                'actor',
                                'created_at',
                            ],
                            properties: {
                                id: { type: 'integer' },
                                action: { type: 'string' },
                                target: { type: 'string' },
                                outcome: { type: 'string' },
                                detail: { type: 'string' },
                                changes: { type: 'string' },
                                duration_ms: { type: 'integer' },
                                actor: { type: 'string' },
                                created_at: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    } as const;
}

export function schemaAuditHeatmap() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['days', 'from', 'to', 'total', 'busiest'],
                properties: {
                    days: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['date', 'total', 'errors'],
                            properties: {
                                date: { type: 'string' },
                                total: { type: 'integer' },
                                errors: { type: 'integer' },
                            },
                        },
                    },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    total: { type: 'integer' },
                    busiest: { type: 'integer' },
                },
            },
        },
    } as const;
}
