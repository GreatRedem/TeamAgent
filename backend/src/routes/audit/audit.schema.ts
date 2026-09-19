/**
 * Only the `response` half is enforced -- `setValidatorCompiler` in `main.ts`
 * disables request validation.
 */

export const schemaAuditList = {
    response: {
        200: {
            type: 'object',
            required: [ 'entries' ],
            properties: {
                entries: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'action', 'target', 'outcome', 'detail', 'duration_ms', 'actor', 'created_at' ],
                        properties: {
                            id: { type: 'integer' },
                            action: { type: 'string' },
                            target: { type: 'string' },
                            outcome: { type: 'string' },
                            detail: { type: 'string' },
                            duration_ms: { type: 'integer' },
                            actor: { type: 'string' },
                            created_at: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaAuditHeatmap = {
    response: {
        200: {
            type: 'object',
            required: [ 'days', 'from', 'to', 'total', 'busiest' ],
            properties: {
                // One entry per day in range, including days with no activity,
                // so the client renders a continuous grid without filling gaps.
                days: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'date', 'total', 'errors' ],
                        properties: {
                            date: { type: 'string' },
                            total: { type: 'integer' },
                            errors: { type: 'integer' }
                        }
                    }
                },
                from: { type: 'string' },
                to: { type: 'string' },
                total: { type: 'integer' },
                busiest: { type: 'integer' }
            }
        }
    }
} as const;
