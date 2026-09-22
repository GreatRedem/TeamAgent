import type { DataSource } from 'typeorm';
import 'fastify';

declare module 'fastify' {
    interface FastifyError {
        result: string;
    }

    interface FastifyInstance {
        db: DataSource;
    }
}
