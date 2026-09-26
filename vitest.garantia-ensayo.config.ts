import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/ensayo/garantia-api-emulador.test.ts'], environment: 'node', hookTimeout: 30000, testTimeout: 20000 } });
