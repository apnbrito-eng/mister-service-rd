import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const fixture = resolve('tests/manual/operacion-qa-fixture.ts');
export default defineConfig({ build: { outDir: '/tmp/mister-operacion-qa-build', emptyOutDir: false, rollupOptions: { input: resolve('tests/manual/operacion-qa.html') } }, plugins: [react()], optimizeDeps: { entries: ['tests/manual/operacion-qa.html'] }, resolve: { alias: [
 { find: /^firebase\/firestore$/, replacement: fixture },
 { find: /.*\/firebase\/config$/, replacement: fixture },
 { find: /.*\/context\/AppContext$/, replacement: fixture },
 { find: /.*\/hooks\/useTiposEquipo$/, replacement: fixture },
 { find: /.*\/services\/(clientes|ordenes|contadores|notificaciones)\.service$/, replacement: fixture },
 { find: /.*\/GestionOrden$/, replacement: resolve('tests/manual/operacion-qa-stub.tsx') },
] }, server: { host: '127.0.0.1', port: 5291, strictPort: true, headers: { 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:5291; form-action 'none'" } } });
