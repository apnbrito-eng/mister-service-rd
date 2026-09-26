import { defineConfig } from 'vitest/config';

/**
 * SPRINT-TESTS-RULES (2026-09-12).
 *
 * Hasta ahora el repo no tenía ninguna suite de tests: todo el gate era el
 * pre-commit (typecheck + 24 cazadores estáticos + eslint). Los cazadores
 * P-002, P-005 y P-013 hacen grep sobre `firestore.rules` y verifican si se
 * deployó, pero NADIE ejecutaba las rules contra casos reales. Por eso los
 * `permission-denied` aparecían recién en producción — es el bug recurrente
 * del propio catálogo de patrones (antiprecedente SPRINT-103/106).
 *
 * Esta config cubre SOLO tests de reglas contra el emulador de Firestore.
 * Se corre con `npm run test:rules`, que levanta el emulador primero.
 * NO hay `npm test` genérico a propósito: no existe suite de unidad todavía
 * y CLAUDE.md advierte explícitamente contra inventar ese script.
 */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    // Un solo worker: todos los tests comparten la misma instancia del
    // emulador y se pisarían los datos entre archivos si corrieran en
    // paralelo. `clearFirestore()` en beforeEach asume exclusividad.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
