export const schemaShopList = {
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
            required: [ 'total', 'items' ],
            properties: {
                total: { type: 'number' },
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'name', 'item', 'count', 'category', 'price', 'realmId', 'createdAt' ],
                        properties: {
                            id: { type: 'number' },
                            name: { type: 'string' },
                            item: { type: 'number' },
                            count: { type: 'number' },
                            category: { type: 'number' },
                            price: { type: 'number' },
                            realmId: { type: 'number' },
                            createdAt: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaShopPurchase = {
    querystring: {
        type: 'object',
        required: [ 'item_id', 'realm_id', 'character_id' ],
        properties: {
            item_id: { type: 'number' },
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
