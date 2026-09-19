export const schemaBlogList = {
    querystring: {
        type: 'object',
        properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            search: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'object',
            required: [ 'count', 'item' ],
            properties: {
                count: { type: 'number' },
                item: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'slug', 'title', 'description', 'content', 'image', 'updatedAt', 'createdAt' ],
                        properties: {
                            id: { type: 'number' },
                            slug: { type: 'string' },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            content: { type: 'string' },
                            image: { type: 'string' },
                            updatedAt: { type: 'string' },
                            createdAt: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaBlogFindOne = {
    params: {
        type: 'object',
        required: [ 'slug' ],
        properties: {
            slug: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'object',
            required: [ 'id', 'slug', 'title', 'description', 'content', 'image', 'updatedAt', 'createdAt' ],
            properties: {
                id: { type: 'number' },
                slug: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                content: { type: 'string' },
                image: { type: 'string' },
                updatedAt: { type: 'string' },
                createdAt: { type: 'string' }
            }
        }
    }
} as const;

export const schemaBlogCreate = {
    consumes: [ 'multipart/form-data' ],
    body: {
        type: 'object',
        required: [ 'slug', 'title', 'description', 'content', 'category', 'language', 'image' ],
        properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            category: { type: 'number' },
            language: { type: 'string' },
            image: { type: 'string', format: 'binary' }
        }
    },
    response: {
        200: {
            type: 'null'
        }
    }
} as const;

export const schemaBlogRemove = {
    body: {
        type: 'object',
        required: [ 'slug' ],
        properties: {
            slug: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'null'
        }
    }
} as const;
