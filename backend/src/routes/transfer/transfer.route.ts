import type { FastifyInstance } from 'fastify';
import { TRANSFER_UPLOAD_MAX } from '../../constant.js';

import { teamExport, teamImport } from './transfer.service.js';

export default async function (fastify: FastifyInstance) {
    fastify.addContentTypeParser(
        ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        { parseAs: 'buffer', bodyLimit: TRANSFER_UPLOAD_MAX },
        (_request, body, done) => done(null, body),
    );

    fastify.get('/team/:id/export', teamExport(fastify));
    fastify.post('/team/:id/import', teamImport(fastify));
}
