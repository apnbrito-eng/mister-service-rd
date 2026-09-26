import { defineConfig, loadEnv } from 'vite';
import { rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import react from '@vitejs/plugin-react';
import ensayo from './config/mobile.staging.json';

// SPRINT-FIX-MOB-3 (2026-09-26): defensa post-build para builds mobile de
// produccion. El pre-check en linea 11 aborta si `VITE_MOBILE_APPCHECK_DEBUG`
// no es `'false'`, pero el bundle final se produce por Vite/rollup con
// constant folding — este cazador confirma que el output NO contiene ningun
// rastro del debug token de App Check ni referencias al proyecto de
// staging. Corre solo cuando `VITE_MOBILE_STAGE === 'production'`.
function verificarAppCheckProduccion(): { name: string; closeBundle: () => void } {
  return {
    name: 'verificar-appcheck-produccion',
    closeBundle() {
      const outDir = resolve('dist-mobile');
      const patronesProhibidos = [
        /debugToken\s*:\s*!?0*\s*(?:true|1)\b/i,
        /debugToken\s*:\s*true\b/i,
        /mister-service-ensayo-260921/,
      ];
      const errores: string[] = [];
      const recorrer = (dir: string): void => {
        for (const entrada of readdirSync(dir)) {
          const ruta = join(dir, entrada);
          const st = statSync(ruta);
          if (st.isDirectory()) recorrer(ruta);
          else if (/\.(js|mjs|cjs|html)$/.test(entrada)) {
            const contenido = readFileSync(ruta, 'utf8');
            for (const patron of patronesProhibidos) {
              if (patron.test(contenido)) {
                errores.push(`${ruta}: match ${patron}`);
              }
            }
          }
        }
      };
      recorrer(outDir);
      if (errores.length > 0) {
        throw new Error(
          `Build movil de produccion contamina con debug App Check o proyecto de staging:\n  ${errores.join('\n  ')}`,
        );
      }
    },
  };
}

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
  const plugins = [
    react(),
    { name: 'exclude-mobile-installers', closeBundle() { rmSync(resolve('dist-mobile/descargas'), { recursive: true, force: true }); } },
  ];
  if (produccion) plugins.push(verificarAppCheckProduccion());
  return { plugins, define: { __APP_VERSION__: JSON.stringify(produccion ? 'mobile-production-1.0.9' : 'mobile-staging') }, build: { outDir: 'dist-mobile' } };
});
