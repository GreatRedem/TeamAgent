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
                    notes: { type: 'array', items: { type: 'string' } },
                },
            },
        },
    } as const;
}
