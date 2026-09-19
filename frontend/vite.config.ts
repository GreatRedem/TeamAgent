import { defineConfig } from 'vite';

import react from '@vitejs/plugin-react';

export default defineConfig(() =>
{
    return {
        plugins: [ react() ],
        server: {
            port: 1001
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
