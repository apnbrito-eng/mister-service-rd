/**
 * P-013 — `storage.rules` modificado en el repo pero no deployado a producción.
 *
 * Patrón espejo de P-005 (firestore.rules). Bug pattern original que motivó
 * el cazador hermano: SPRINT-103/106 (2026-05-06/07) donde el feature
 * "Iniciar chequeo Aury" se pusheó con rules actualizadas pero sin ejecutar
 * `npm run deploy:rules`. Las rules de producción siguieron con la versión
 * vieja y los técnicos recibieron permission-denied silencioso por ~24h.
 *
 * Para Storage el síntoma sería análogo: si el path `whatsapp-media/**`
 * (o cualquier otro nuevo) se agrega a `storage.rules` en el repo pero no
 * se deploya, el endpoint server-side podría seguir funcionando (Admin SDK
 * ignora rules) pero las lecturas client-side fallarían con
 * `storage/unauthorized`.
 *
 * Síntoma: feature compilado + pusheado, código pide leer/escribir un path
 * cubierto por las rules NUEVAS, pero las rules ACTIVAS en producción son
 * la versión anterior → unauthorized.
 *
 * Causa raíz: `git push` no triggerea deploy de rules. Vercel deploy del
 * frontend SÍ se dispara automático por GitHub webhook. Las rules de Storage
 * requieren `firebase deploy --only storage:rules` ejecutado a mano por el
 * coordinator/Jorge. Si nadie lo ejecuta, hay desincronía silenciosa.
 *
 * Estrategia (heurística determinística):
 *
 * 1. Calcular SHA-256 del `storage.rules` actual.
 * 2. Leer `storage.rules.deployed.lock` (escrito por
 *    `marcar-storage-rules-deployadas.ts` después de cada deploy real).
 * 3. Si los hashes difieren → FAIL.
 * 4. Si el lock no existe → WARN (cold start, primer setup post-SPRINT-138).
 * 5. Si `storage.rules` no existe → PASS (cazador N/A; aplica solo a repos
 *    que ya versionan rules de Storage).
 *
 * Recuperación:
 *   npm run deploy:storage-rules   # corre firebase deploy + actualiza el lock
 *
 * Allowlist: NO HAY. Si el cazador grita y el commit no toca storage.rules,
 * es porque alguien hizo deploy fuera de banda y olvidó actualizar el lock —
 * ejecutar `npx tsx scripts/invariantes/marcar-storage-rules-deployadas.ts`
 * para sincronizar.
 *
 * Bypass de emergencia (NO recomendado, deja deuda):
 *   git commit --no-verify
 */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-013';
const PATTERN_NAME = 'storage.rules modificado pero no deployado a producción';
const ROOT = path.resolve(process.cwd());
const RULES_FILE = path.join(ROOT, 'storage.rules');
const LOCK_FILE = path.join(ROOT, 'storage.rules.deployed.lock');

function parseLockHash(lockBody: string): string | null {
  const match = lockBody.match(/^sha256:\s*([0-9a-f]{64})\s*$/m);
  return match ? match[1] : null;
}

export async function check(): Promise<InvariantResult> {
  let rulesContent: string;
  try {
    rulesContent = await fs.readFile(RULES_FILE, 'utf8');
  } catch {
    // No hay storage.rules en el repo — no aplica este cazador.
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits: [],
      notes: ['No hay storage.rules en el repo — patrón N/A.'],
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
        `storage.rules.deployed.lock NO existe.`,
        `Ejecutá \`npm run deploy:storage-rules\` para crear el lock con el hash deployado.`,
        `Hash actual de storage.rules: ${currentHash.slice(0, 12)}...`,
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
        `storage.rules.deployed.lock existe pero no tiene hash parseable.`,
        `Re-ejecutá \`npm run deploy:storage-rules\` para regenerarlo.`,
      ],
    };
  }

  if (currentHash === deployedHash) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'pass',
      hits: [],
      notes: [`storage.rules sincronizado con producción (${deployedHash.slice(0, 12)}...).`],
    };
  }

  // Hashes difieren → diff pendiente de deploy.
  const hit: InvariantHit = {
    file: 'storage.rules',
    line: 1,
    snippet: `storage.rules cambió desde el último deploy`,
    explanation:
      `El SHA-256 de storage.rules en el repo es ${currentHash.slice(0, 12)}... pero ` +
      `el último deploy registrado fue ${deployedHash.slice(0, 12)}... ` +
      `Resultado: tu código nuevo puede chocar con las rules viejas en producción y ` +
      `causar storage/unauthorized silencioso (vector P-013, espejo de P-005). ` +
      `Recuperación: \`npm run deploy:storage-rules\` (deploya a Firebase + actualiza el lock).`,
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
