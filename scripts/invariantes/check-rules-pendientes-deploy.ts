/**
 * P-005 — `firestore.rules` modificado en el repo pero no deployado a producción.
 *
 * Bug original: SPRINT-103 (commit `1568a63`, 2026-05-06) modificó
 * `firestore.rules` con `.get(field, null)` en `noTocaSoloChequeo`,
 * `noTocaCamposAprobacion`, `noTocaAsignacion`. El sprint cerró COMPLETADO
 * y se hizo push a main, pero NUNCA se ejecutó `npm run deploy:rules`. Las
 * rules de producción siguieron con acceso directo a campos opcionales y
 * cualquier técnico que intentaba "Iniciar chequeo" en una orden regular
 * (sin `soloChequeo`/`estadoAprobacion`/`ayudanteId` previos) recibía
 * permission-denied silencioso. Detectado el 2026-05-07 cuando Jorge
 * reportó que el botón no funciona en producción (SPRINT-106).
 *
 * Síntoma: feature compilado y pusheado funciona en local (rules locales
 * = rules emuladas para testing) pero rompe en producción porque las rules
 * activas son la versión anterior.
 *
 * Causa raíz: `git push` no triggerea deploy de rules. Vercel deploy del
 * frontend SÍ se dispara automático por GitHub webhook. Las rules requieren
 * `firebase deploy --only firestore:rules` ejecutado a mano por el
 * coordinator/Jorge. Si nadie lo ejecuta, hay desincronía silenciosa.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Calcular SHA-256 del `firestore.rules` actual.
 * 2. Leer `firestore.rules.deployed.lock` (escrito por
 *    `marcar-rules-deployadas.ts` después de cada deploy real).
 * 3. Si los hashes difieren → FAIL.
 * 4. Si el lock no existe → WARN (cold start, primer setup).
 *
 * Recuperación:
 *   npm run deploy:rules   # corre firebase deploy + actualiza el lock
 *
 * Allowlist: NO HAY. Si el cazador grita y el commit no toca rules, es
 * porque alguien hizo deploy fuera de banda y olvidó actualizar el lock —
 * ejecutar `npx tsx scripts/invariantes/marcar-rules-deployadas.ts` para
 * sincronizar.
 *
 * Bypass de emergencia (NO recomendado, deja deuda):
 *   git commit --no-verify
 */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-005';
const PATTERN_NAME = 'firestore.rules modificado pero no deployado a producción';
const ROOT = path.resolve(process.cwd());
const RULES_FILE = path.join(ROOT, 'firestore.rules');
const LOCK_FILE = path.join(ROOT, 'firestore.rules.deployed.lock');

function parseLockHash(lockBody: string): string | null {
  const match = lockBody.match(/^sha256:\s*([0-9a-f]{64})\s*$/m);
  return match ? match[1] : null;
}

export async function check(): Promise<InvariantResult> {
  let rulesContent: string;
  try {
    rulesContent = await fs.readFile(RULES_FILE, 'utf8');
  } catch {
    // No hay firestore.rules en el repo — no aplica este cazador.
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits: [],
      notes: ['No hay firestore.rules en el repo — patrón N/A.'],
    };
  }

  const currentHash = createHash('sha256').update(rulesContent).digest('hex');

  let lockBody: string | null = null;
  try {
    lockBody = await fs.readFile(LOCK_FILE, 'utf8');
  } catch {
    lockBody = null;
  }

  if (lockBody === null) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'warn',
      hits: [],
      notes: [
        `firestore.rules.deployed.lock NO existe.`,
        `Ejecutá \`npm run deploy:rules\` para crear el lock con el hash deployado.`,
        `Hash actual de firestore.rules: ${currentHash.slice(0, 12)}...`,
      ],
    };
  }

  const deployedHash = parseLockHash(lockBody);
  if (deployedHash === null) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'warn',
      hits: [],
      notes: [
        `firestore.rules.deployed.lock existe pero no tiene hash parseable.`,
        `Re-ejecutá \`npm run deploy:rules\` para regenerarlo.`,
      ],
    };
  }

  if (currentHash === deployedHash) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits: [],
      notes: [`firestore.rules sincronizado con producción (${deployedHash.slice(0, 12)}...).`],
    };
  }

  // Hashes difieren → diff pendiente de deploy.
  const hit: InvariantHit = {
    file: 'firestore.rules',
    line: 1,
    snippet: `firestore.rules cambió desde el último deploy`,
    explanation:
      `El SHA-256 de firestore.rules en el repo es ${currentHash.slice(0, 12)}... pero ` +
      `el último deploy registrado fue ${deployedHash.slice(0, 12)}... ` +
      `Resultado: tu código nuevo puede chocar con las rules viejas en producción y ` +
      `causar permission-denied silencioso (vector P-005, antiprecedente SPRINT-103/106). ` +
      `Recuperación: \`npm run deploy:rules\` (deploya a Firebase + actualiza el lock).`,
  };

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: 'fail',
    hits: [hit],
    notes: [
      `Hash repo:     ${currentHash}`,
      `Hash deployed: ${deployedHash}`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
