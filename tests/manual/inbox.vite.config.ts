import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const fixture = resolve('tests/manual/inbox-fixture.tsx');
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['tests/manual/inbox.html'] },
  resolve: { alias: [
    { find: /.*\/FacturacionEnChat$/, replacement: fixture },
    { find: /^firebase\/firestore$/, replacement: fixture },
    { find: /.*\/firebase\/config$/, replacement: fixture },
    { find: /.*\/context\/AppContext$/, replacement: fixture },
    { find: /.*\/services\/(clientes.service|ordenes.service|equipoApi|whatsapp.service|whatsappInbox.service)$/, replacement: fixture },
    { find: /.*\/ordenes\/EnviarFacturacionButton$/, replacement: fixture },
  ] },
  server: { host: '127.0.0.1', port: 5191 },
});
