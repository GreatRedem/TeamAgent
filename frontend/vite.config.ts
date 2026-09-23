import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '../', 'NODE_PORT');

    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: { '@': path.resolve(import.meta.dirname, './src') },
        },
        cacheDir: '../node_modules/.vite',
        server: {
            port: 1001,
            proxy: {
                '/api': {
                    target: `http://127.0.0.1:${env['NODE_PORT'] ?? 1000}`,
                    changeOrigin: true,
                    rewrite: (url) => url.replace(/^\/api/, ''),
                },
            },
        },
        build: {
            outDir: '../.dist-frontend',
            emptyOutDir: true,
            reportCompressedSize: false,
        },
    };
});
