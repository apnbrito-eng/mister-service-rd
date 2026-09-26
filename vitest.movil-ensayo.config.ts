import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/ensayo/movil-api-emulador.test.ts', 'tests/ensayo/chat-orden-emulador.test.ts'], environment: 'node', hookTimeout: 30000, testTimeout: 25000 } });
