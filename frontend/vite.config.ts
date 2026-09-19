import { defineConfig, loadEnv } from 'vite';

import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) =>
{
    // The backend port lives in the root `.env` as NODE_PORT. Read it rather
    // than duplicating the number here, so changing it in one place does not
    // leave the dev proxy pointing at a dead port. The prefix is the full
    // variable name on purpose -- a broader one would pull NODE_DB into this
    // config too, and nothing here should be holding the database URL.
    const env = loadEnv(mode, '../', 'NODE_PORT');

    return {
        plugins: [ react() ],
        // Dependencies are hoisted to the workspace root by npm, so keep Vite's
        // own cache beside them instead of creating a frontend/node_modules
        // that holds nothing else.
        cacheDir: '../node_modules/.vite',
        server: {
            port: 1001,
            // `api.ts` calls `/api/...` on this origin; Fastify registers those
            // routes without the prefix, so strip it on the way through. nginx
            // does the same in production.
            proxy: {
                '/api': {
                    target: `http://127.0.0.1:${ env['NODE_PORT'] ?? 1000 }`,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, '')
                }
            }
        },
        build: {
            outDir: '../.dist-frontend',
            // outDir sits outside the project root, so Vite will not clear it
            // unless this is explicit.
            emptyOutDir: true,
            // Served as static files behind nginx; a manifest is not needed and
            // sourcemaps are kept out of the published bundle.
            reportCompressedSize: false
        }
    };
});
