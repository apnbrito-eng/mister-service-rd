import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/ensayo/bot-runtime-emulador.test.ts'], environment: 'node', hookTimeout: 30000, testTimeout: 25000 } });
