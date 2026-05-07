/**
 * Post-deploy hook de `npm run deploy:rules`.
 *
 * Escribe el SHA-256 de `firestore.rules` actual al archivo
 * `firestore.rules.deployed.lock` para que el cazador P-005
 * (`check-rules-pendientes-deploy.ts`) sepa qué versión está en
 * producción.
 *
 * Uso (automático): `npm run deploy:rules` lo invoca después de
 * `firebase deploy --only firestore:rules`.
 *
 * Uso (manual, raro — sólo si hiciste deploy fuera de banda y querés
 * sincronizar el lock):
 *   npx tsx scripts/invariantes/marcar-rules-deployadas.ts
 */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const RULES_FILE = path.join(ROOT, 'firestore.rules');
const LOCK_FILE = path.join(ROOT, 'firestore.rules.deployed.lock');

async function main() {
  const content = await fs.readFile(RULES_FILE, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  const stamp = new Date().toISOString();
  const body =
    `# firestore.rules deployed lock\n` +
    `# Escrito por scripts/invariantes/marcar-rules-deployadas.ts después de\n` +
    `# \`firebase deploy --only firestore:rules\`. NO editar a mano.\n` +
    `# Cazador P-005 lo compara contra el SHA-256 actual de firestore.rules\n` +
    `# para detectar diff pendiente de deployar.\n` +
    `\n` +
    `sha256: ${hash}\n` +
    `deployedAt: ${stamp}\n`;
  await fs.writeFile(LOCK_FILE, body, 'utf8');
  console.log(`[marcar-rules-deployadas] lock actualizado:`);
  console.log(`  sha256: ${hash}`);
  console.log(`  deployedAt: ${stamp}`);
}

main().catch((err) => {
  console.error('[marcar-rules-deployadas] error:', err);
  process.exit(1);
});
