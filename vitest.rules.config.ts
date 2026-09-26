import { defineConfig } from 'vitest/config';

/**
 * Config dedicada a los tests de firestore.rules contra el emulador.
 * Restaurada desde la rama `archivo/desktop-2026-09-26-122332` (SPRINT-TESTS-RULES,
 * 2026-09-12). El árbol nuevo trajo `vitest.integraciones.config.ts`,
 * `vitest.garantia-ensayo.config.ts` y `vitest.movil-ensayo.config.ts` pero no
 * cubría rules. Este archivo restablece esa cobertura.
 *
 * Uso: `npm run test:rules` — levanta emulador Firestore y corre esta suite.
 * Requiere Java 11+ (emulador Firebase es una JVM).
 *
 * Un solo worker: los tests comparten la misma instancia del emulador y se
 * pisarían los datos entre archivos si corrieran en paralelo.
 * `clearFirestore()` en beforeEach asume exclusividad.
 */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
