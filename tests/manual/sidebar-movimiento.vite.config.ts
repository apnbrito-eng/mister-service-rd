import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const contexto = fileURLToPath(new URL('./sidebar-stubs/contexto.tsx', import.meta.url));
const servicios = fileURLToPath(new URL('./sidebar-stubs/servicios.tsx', import.meta.url));
export default defineConfig({
 plugins: [react()],
 optimizeDeps: { entries: ['tests/manual/sidebar-movimiento.html'] },
 resolve: { alias: [
  {find: /^(?:\.\.\/)+context\/AppContext$/, replacement: contexto},
  {find: /^(?:\.\.\/)+firebase\/config$/, replacement: servicios},
  {find: /^firebase\/(?:auth|firestore)$/, replacement: servicios},
  {find: /^(?:\.\.\/)+(?:mobile\/(?:AvisosMoviles|notificaciones)|services\/whatsappInbox\.service)$/, replacement: servicios},
 ]},
 server: { host: '127.0.0.1', port: 5224, strictPort: true },
});
