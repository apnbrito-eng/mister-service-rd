import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const servicios = fileURLToPath(new URL('./empresas-stubs.ts', import.meta.url));
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['tests/manual/empresas.html'] },
  resolve: { alias: [
    { find: /^(?:\.\.\/)+(?:hooks\/useFormularios|services\/empresasAliadas\.service)$/, replacement: servicios },
  ] },
  server: { host: '127.0.0.1', port: 5225, strictPort: true },
});
