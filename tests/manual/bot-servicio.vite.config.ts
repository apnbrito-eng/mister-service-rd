import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [react()], optimizeDeps: { entries: ['tests/manual/bot-servicio.html'] }, resolve: { alias: [{ find: /^(?:\.\.\/)+services\/equipoApi$/, replacement: fileURLToPath(new URL('./bot-servicio-stub.ts', import.meta.url)) }] }, server: { host: '127.0.0.1', port: 5230, strictPort: true } });
