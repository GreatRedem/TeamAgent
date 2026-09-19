import 'fastify';

declare module 'fastify'
{
    interface FastifyContextConfig
    {
        rateLimit?:
        {
            name: string;
            time: number;
            count: number;
        };
    }
}
