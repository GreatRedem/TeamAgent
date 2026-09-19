import 'fastify';

export interface Validator
{
    min(value: number): Validator;
    max(value: number): Validator;
    toLowerCase(): Validator;
    toUpperCase(): Validator;
    asEmail(): string;
    asString(): string;
    asNumber(): number;
    asStringOptional(): string | undefined;
    asNumberOptional(): number | undefined;
    asStringDefault(value: string): string;
    asNumberDefault(value: number): number;
}

declare module 'fastify'
{
    interface FastifyRequest
    {
        getBody(field: string): Validator;
        getQuery(field: string): Validator;
        getParam(field: string): Validator;
    }
}
