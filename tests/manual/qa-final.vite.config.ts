import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const fixture = resolve('tests/manual/qa-final-fixture.ts');
export default defineConfig({ plugins: [react(), { name: 'qa-final-routes', configureServer(server) { server.middlewares.use((req, _res, next) => { if (/^\/(qa|admin)\//.test(req.url || '')) req.url = '/tests/manual/qa-final.html' + ((req.url || '').includes('?') ? '?' + req.url!.split('?')[1] : ''); next(); }); } }], optimizeDeps: { entries: ['tests/manual/qa-final.html'] }, build: { outDir: '/tmp/mister-qa-final-build', emptyOutDir: false, rollupOptions: { input: resolve('tests/manual/qa-final.html') } }, resolve: { alias: [
 { find: /^firebase\/(firestore|auth|app)$/, replacement: fixture },
 { find: /.*\/firebase\/config$/, replacement: fixture },
 { find: /.*\/context\/AppContext$/, replacement: fixture },
 { find: /.*\/hooks\/useTiposEquipo$/, replacement: fixture },
 { find: /.*\/services\/(clientes|ordenes|contadores|notificaciones|piezas)\.service$/, replacement: fixture },
] }, server: { host: '127.0.0.1', port: 5292, strictPort: true, headers: { 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:5292; img-src 'self' data: blob:; form-action 'none'; frame-src 'none'" } } });
