export const schemaRealmList = {
    querystring: {
        type: 'object'
    },
    response: {
        200: {
            type: 'object',
            required: [ 'message' ],
            properties: {
                message: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'name' ],
                        properties: {
                            id: { type: 'number' },
                            name: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaCharacterList = {
    querystring: {
        type: 'object',
        required: [ 'realm_id' ],
        properties: {
            realm_id: { type: 'number' }
        }
    },
    response: {
        200: {
            type: 'object',
            required: [ 'message' ],
            properties: {
                message: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'name', 'race', 'class', 'gender', 'level' ],
                        properties: {
                            id: { type: 'number' },
                            name: { type: 'string' },
                            race: { type: 'number' },
                            class: { type: 'number' },
                            gender: { type: 'number' },
                            level: { type: 'number' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaCharacterChange = {
    body: {
        type: 'object',
        required: [ 'type', 'realm_id', 'character_id' ],
        properties: {
            type: { type: 'number' },
            realm_id: { type: 'number' },
            character_id: { type: 'number' }
        }
    },
    response: {
        200: {
            type: 'null'
        }
    }
} as const;
