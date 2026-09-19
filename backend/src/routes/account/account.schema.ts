export const schemaAccountSignUp = {
    body: {
        type: 'object',
        required: [ 'username', 'password', 'email', 'phone' ],
        properties: {
            username: { type: 'string' },
            password: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            source: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'null'
        }
    }
} as const;

export const schemaAccountSignIn = {
    body: {
        type: 'object',
        anyOf: [
            { required: [ 'password', 'email' ] },
            { required: [ 'password', 'username' ] }
        ],
        properties: {
            password: { type: 'string' },
            email: { type: 'string', format: 'email' },
            username: { type: 'string' }
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

export const schemaAccountSignOut = {
    response: {
        200: {
            type: 'null'
        }
    }
} as const;

export const schemaAccountRefresh = {
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

export const schemaAccountPassword = {
    body: {
        type: 'object',
        required: [ 'password_old', 'password_new' ],
        properties: {
            password_old: { type: 'string' },
            password_new: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'null'
        }
    }
} as const;

export const schemaAccountSwap = {
    body: {
        type: 'object',
        required: [ 'amount', 'email' ],
        properties: {
            amount: { type: 'number' },
            email: { type: 'string', format: 'email' }
        }
    },
    response: {
        200: {
            type: 'null'
        }
    }
} as const;

export const schemaAccountTransfer = {
    body: {
        type: 'object',
        required: [ 'username', 'password', 'email', 'phone', 'realm' ],
        properties: {
            username: { type: 'string' },
            password: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            realm: { type: 'string' }
        }
    },
    response: {
        200: {
            type: 'null'
        }
    }
} as const;
