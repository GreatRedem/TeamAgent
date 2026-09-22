/**
 * As elsewhere, only the `response` half is enforced -- `setValidatorCompiler`
 * in `main.ts` disables request validation. The webhook body is Telegram's
 * shape, not a form, so it is narrowed defensively in the handler instead.
 */

const profile = {
    type: 'object',
    required: [ 'id', 'telegram_id', 'username', 'first_name', 'last_name', 'language_code', 'message_count', 'permissions', 'last_seen_at', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        telegram_id: { type: 'string' },
        username: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        language_code: { type: 'string' },
        message_count: { type: 'integer' },
        permissions: { type: 'array', items: { type: 'string' } },
        last_seen_at: { type: 'string' },
        created_at: { type: 'string' }
    }
} as const;

export const schemaTelegramWebhook = {
    response: {
        200: {
            type: 'object',
            required: [ 'ok' ],
            properties: {
                ok: { type: 'boolean' }
            }
        }
    }
} as const;

export const schemaConversationList = {
    response: {
        200: {
            type: 'object',
            required: [ 'conversations', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                /** Whether another page follows; from one extra row, not a count. */
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                conversations: { type: 'array', items: profile }
            }
        }
    }
} as const;

export const schemaConversationMessages = {
    response: {
        200: {
            type: 'object',
            required: [ 'profile', 'messages', 'limit', 'offset', 'has_more', 'total' ],
            properties: {
                profile,
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                /** Whether another page follows; from one extra row, not a count. */
                has_more: { type: 'boolean' },
                total: { type: 'integer' },
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'bot_id', 'text', 'direction', 'sent_at' ],
                        properties: {
                            id: { type: 'integer' },
                            bot_id: { type: 'integer' },
                            text: { type: 'string' },
                            direction: { type: 'string' },
                            sent_at: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaTelegramWebhookRegister = {
    response: {
        200: {
            type: 'object',
            required: [ 'ok' ],
            properties: {
                ok: { type: 'boolean' },
                url: { type: 'string' },
                reason: { type: 'string' }
            }
        }
    }
} as const;

/**
 * The whole record for one person: every field Telegram has given us, the
 * bots they have written to with a count each, and their full message history.
 */
export const schemaProfileDetails = {
    response: {
        200: {
            type: 'object',
            required: [ 'profile', 'bots', 'messages' ],
            properties: {
                profile,
                bots: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'name', 'message_count', 'last_seen_at' ],
                        properties: {
                            id: { type: 'integer' },
                            name: { type: 'string' },
                            message_count: { type: 'integer' },
                            last_seen_at: { type: 'string' }
                        }
                    }
                },
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'bot_id', 'text', 'direction', 'sent_at' ],
                        properties: {
                            id: { type: 'integer' },
                            bot_id: { type: 'integer' },
                            text: { type: 'string' },
                            direction: { type: 'string' },
                            sent_at: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

/** The permission catalog, so the client can render it without hard-coding it. */
export const schemaPermissionCatalog = {
    response: {
        200: {
            type: 'object',
            required: [ 'permissions' ],
            properties: {
                permissions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'key', 'label', 'description' ],
                        properties: {
                            key: { type: 'string' },
                            label: { type: 'string' },
                            description: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
} as const;

export const schemaProfilePermissionUpdate = {
    body: {
        type: 'object',
        required: [ 'permissions' ],
        properties: {
            permissions: { type: 'array', items: { type: 'string' } }
        }
    },
    response: {
        200: profile
    }
} as const;
