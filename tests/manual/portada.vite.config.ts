import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [react()], optimizeDeps: { entries: ['tests/manual/portada.html'] }, resolve: { alias: [{ find: /^(?:\.\.\/)+hooks\/useConfigWeb$/, replacement: fileURLToPath(new URL('./portada-stubs.ts', import.meta.url)) }] }, server: { host: '127.0.0.1', port: 5226, strictPort: true } });
