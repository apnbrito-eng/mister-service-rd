/**
 * Post-deploy hook de `npm run deploy:storage-rules`.
 *
 * Escribe el SHA-256 de `storage.rules` actual al archivo
 * `storage.rules.deployed.lock` para que el cazador P-013
 * (`check-storage-rules-pendientes-deploy.ts`) sepa qué versión está en
 * producción.
 *
 * Patrón espejo de `marcar-rules-deployadas.ts` (P-005, firestore.rules).
 *
 * Uso (automático): `npm run deploy:storage-rules` lo invoca después de
 * `firebase deploy --only storage:rules`.
 *
 * Uso (manual, raro — sólo si hiciste deploy fuera de banda y querés
 * sincronizar el lock):
 *   npx tsx scripts/invariantes/marcar-storage-rules-deployadas.ts
 */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const RULES_FILE = path.join(ROOT, 'storage.rules');
const LOCK_FILE = path.join(ROOT, 'storage.rules.deployed.lock');

async function main() {
  const content = await fs.readFile(RULES_FILE, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  const stamp = new Date().toISOString();
  const body =
    `# storage.rules deployed lock\n` +
    `# Escrito por scripts/invariantes/marcar-storage-rules-deployadas.ts después de\n` +
    `# \`firebase deploy --only storage:rules\`. NO editar a mano.\n` +
    `# Cazador P-013 lo compara contra el SHA-256 actual de storage.rules\n` +
    `# para detectar diff pendiente de deployar.\n` +
    `\n` +
    `sha256: ${hash}\n` +
    `deployedAt: ${stamp}\n`;
  await fs.writeFile(LOCK_FILE, body, 'utf8');
  console.log(`[marcar-storage-rules-deployadas] lock actualizado:`);
  console.log(`  sha256: ${hash}`);
  console.log(`  deployedAt: ${stamp}`);
}

main().catch((err) => {
  console.error('[marcar-storage-rules-deployadas] error:', err);
  process.exit(1);
});
