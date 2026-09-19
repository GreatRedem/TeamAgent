import 'fastify';

export interface Validator
{
    min(value: number): Validator;
    max(value: number): Validator;
    asString(): string;
}

declare module 'fastify'
{
    interface FastifyRequest
    {
        getBody(field: string): Validator;
    }
}
