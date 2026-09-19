/**
 * As elsewhere, only the `response` half is enforced -- `setValidatorCompiler`
 * in `main.ts` disables request validation. The webhook body is Telegram's
 * shape, not a form, so it is narrowed defensively in the handler instead.
 */

const profile = {
    type: 'object',
    required: [ 'id', 'telegram_id', 'username', 'first_name', 'last_name', 'language_code', 'message_count', 'last_seen_at', 'created_at' ],
    properties: {
        id: { type: 'integer' },
        telegram_id: { type: 'string' },
        username: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        language_code: { type: 'string' },
        message_count: { type: 'integer' },
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
            required: [ 'conversations' ],
            properties: {
                conversations: { type: 'array', items: profile }
            }
        }
    }
} as const;

export const schemaConversationMessages = {
    response: {
        200: {
            type: 'object',
            required: [ 'profile', 'messages' ],
            properties: {
                profile,
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [ 'id', 'bot_id', 'text', 'sent_at' ],
                        properties: {
                            id: { type: 'integer' },
                            bot_id: { type: 'integer' },
                            text: { type: 'string' },
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
