export function schemaTeamImport() {
    return {
        response: {
            200: {
                type: 'object',
                required: ['from', 'imported', 'skipped', 'notes'],
                properties: {
                    from: { type: 'string' },
                    imported: { type: 'object', additionalProperties: { type: 'integer' } },
                    skipped: { type: 'object', additionalProperties: { type: 'integer' } },
                    notes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['code'],
                            properties: {
                                code: { type: 'string' },
                                count: { type: 'integer' },
                                files: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    } as const;
}
