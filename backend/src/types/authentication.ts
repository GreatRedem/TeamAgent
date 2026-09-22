import 'fastify';

declare module 'fastify' {
    interface FastifyContextConfig {
        role?: number;
        authentication?: boolean;
    }

    interface FastifyRequest {
        account_id: number;
        session_id: number;
        account_role: number;
    }
}
