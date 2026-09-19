import 'fastify';

type AccountHistoryTag =
    'ACCOUNT_SIGN_IN' |
    'ACCOUNT_SIGN_OUT' |
    'ACCOUNT_PASSWORD' |
    'ACCOUNT_SWAP' |

    'STORE_CHARACTER_GOLD' |
    'STORE_CHARACTER_ITEM';

declare module 'fastify'
{
    interface FastifyRequest
    {
        accountHistory(tag: AccountHistoryTag, value1?: string | number, value2?: string | number, value3?: string | number, value4?: string | number, value5?: string | number): void;
    }
}
