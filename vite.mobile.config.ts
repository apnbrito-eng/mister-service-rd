import { defineConfig, loadEnv } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import ensayo from './config/mobile.staging.json';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (!env.VITE_MOBILE_API_ORIGIN?.startsWith('https://')) throw new Error('Configura VITE_MOBILE_API_ORIGIN con el backend HTTPS de pruebas.');
  const produccion = env.VITE_MOBILE_STAGE === 'production';
  if (produccion) {
    if (env.VITE_FIREBASE_PROJECT_ID !== 'mister-service-app-cloude' || env.VITE_MOBILE_API_ORIGIN !== 'https://www.misterservicerd.com' || env.VITE_MOBILE_APPCHECK_DEBUG !== 'false') throw new Error('Producción requiere el servidor real, Firebase real y App Check sin debug.');
  } else {
    if (env.VITE_MOBILE_STAGE !== 'staging') throw new Error('Selecciona staging o production explícitamente.');
    if (!env.MOBILE_STAGING_FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID !== env.MOBILE_STAGING_FIREBASE_PROJECT_ID) throw new Error('Configura un proyecto Firebase separado para pruebas.');
    if (env.VITE_FIREBASE_PROJECT_ID !== ensayo.projectId || env.VITE_MOBILE_API_ORIGIN !== ensayo.apiOrigin) throw new Error('El paquete móvil de ensayo solo puede usar el proyecto y servidor separados registrados en config/mobile.staging.json.');
  }
  return { plugins: [react(), { name: 'exclude-mobile-installers', closeBundle() { rmSync(resolve('dist-mobile/descargas'), { recursive: true, force: true }); } }], define: { __APP_VERSION__: JSON.stringify(produccion ? 'mobile-production-1.0.9' : 'mobile-staging') }, build: { outDir: 'dist-mobile' } };
});
