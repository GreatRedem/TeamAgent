export const schemaAccountWalletNonce = {
    body: {
        type: 'object',
        required: [ 'address' ],
        properties: {
            address: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'object',
            required: [ 'message' ],
            properties: {
                message: { type: 'string' }
            }
        }
    }
} as const;

export const schemaAccountWalletSignIn = {
    body: {
        type: 'object',
        required: [ 'address', 'signature' ],
        properties: {
            address: { type: 'string' },
            signature: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'object',
            required: [ 'accessToken' ],
            properties: {
                accessToken: { type: 'string' }
            }
        }
    }
} as const;
