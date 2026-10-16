/**
 * Inspección compartida de P-005 (firestore.rules) y P-013 (storage.rules).
 *
 * Separa dos cosas que antes vivían mezcladas en cada cazador:
 *
 * 1. `inspeccionarRulesDeploy` — lee rules + lock UNA sola vez y clasifica el
 *    estado con evidencia de FS (hashes calculados, código de error de lectura).
 *    No aplica política: no decide si algo bloquea.
 * 2. `resultadoRulesDeploy` — traduce ese estado al resultado estricto del
 *    cazador (comportamiento `estandar`).
 *
 * `run-all.ts` llama a la inspección una vez por archivo y reutiliza el mismo
 * estado para el resultado y para la política de contexto
 * (`politica-publicacion.ts`). Así la decisión de bajar un FAIL a WARN nunca
 * depende del texto del mensaje de error ni de una segunda lectura del disco.
 *
 * Cambio deliberado frente al original: un error de lectura de `*.rules`
 * distinto de ENOENT (permisos, directorio en lugar de archivo, etc.) antes se
 * trataba como "no hay rules" → PASS. Ahora es FAIL: un archivo que existe pero
 * no se puede leer no certifica nada.
 */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { InvariantResult, InvariantHit } from './types.js';

export interface SpecRulesDeploy {
  patternId: string;
  patternName: string;
  /** Nombre relativo a la raíz del repo, ej. `firestore.rules`. */
  rulesFile: string;
  /** Nombre relativo a la raíz del repo, ej. `firestore.rules.deployed.lock`. */
  lockFile: string;
  /** Comando de recuperación, ej. `npm run deploy:rules`. */
  comandoDeploy: string;
  /** Texto del síntoma en producción para la explicación del hit. */
  sintoma: string;
}

export const SPEC_FIRESTORE: SpecRulesDeploy = {
  patternId: 'P-005',
  patternName: 'firestore.rules modificado pero no deployado a producción',
  rulesFile: 'firestore.rules',
  lockFile: 'firestore.rules.deployed.lock',
  comandoDeploy: 'npm run deploy:rules',
  sintoma: 'permission-denied silencioso (vector P-005, antiprecedente SPRINT-103/106)',
};

export const SPEC_STORAGE: SpecRulesDeploy = {
  patternId: 'P-013',
  patternName: 'storage.rules modificado pero no deployado a producción',
  rulesFile: 'storage.rules',
  lockFile: 'storage.rules.deployed.lock',
  comandoDeploy: 'npm run deploy:storage-rules',
  sintoma: 'storage/unauthorized silencioso (vector P-013, espejo de P-005)',
};

export type EstadoRules =
  | { tipo: 'sin-rules' }
  | { tipo: 'error-lectura'; archivo: string; detalle: string }
  | { tipo: 'sin-lock'; hashActual: string }
  | { tipo: 'lock-invalido'; hashActual: string }
  | { tipo: 'pendiente'; hashActual: string; hashDeployado: string }
  | { tipo: 'sincronizado'; hashActual: string };

export function parseLockHash(lockBody: string): string | null {
  const match = lockBody.match(/^sha256:\s*([0-9a-f]{64})\s*$/m);
  return match ? match[1] : null;
}

function codigoError(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
}

/** Lee rules + lock bajo `root` (una lectura por archivo) y clasifica el estado. */
export async function inspeccionarRulesDeploy(
  root: string,
  spec: SpecRulesDeploy,
): Promise<EstadoRules> {
  let rulesContent: Buffer;
  try {
    rulesContent = await fs.readFile(path.join(root, spec.rulesFile));
  } catch (err) {
    if (codigoError(err) === 'ENOENT') return { tipo: 'sin-rules' };
    return { tipo: 'error-lectura', archivo: spec.rulesFile, detalle: String(err) };
  }

  // Mismo hash que el original (utf8 de un archivo de texto == sus bytes).
  const hashActual = createHash('sha256').update(rulesContent).digest('hex');

  let lockBody: string;
  try {
    lockBody = await fs.readFile(path.join(root, spec.lockFile), 'utf8');
  } catch (err) {
    if (codigoError(err) === 'ENOENT') return { tipo: 'sin-lock', hashActual };
    return { tipo: 'error-lectura', archivo: spec.lockFile, detalle: String(err) };
  }

  const hashDeployado = parseLockHash(lockBody);
  if (hashDeployado === null) return { tipo: 'lock-invalido', hashActual };
  if (hashActual === hashDeployado) return { tipo: 'sincronizado', hashActual };
  return { tipo: 'pendiente', hashActual, hashDeployado };
}

/** Resultado estricto (modo `estandar`) del cazador para un estado dado. */
export function resultadoRulesDeploy(
  estado: EstadoRules,
  spec: SpecRulesDeploy,
): InvariantResult {
  const base = { patternId: spec.patternId, patternName: spec.patternName };

  switch (estado.tipo) {
    case 'sin-rules':
      return {
        ...base,
        status: 'pass',
        hits: [],
        notes: [`No hay ${spec.rulesFile} en el repo — patrón N/A.`],
      };

    case 'error-lectura':
      return {
        ...base,
        status: 'fail',
        hits: [
          {
            file: estado.archivo,
            line: 1,
            snippet: `no se pudo leer ${estado.archivo}`,
            explanation:
              `El archivo existe pero la lectura falló (${estado.detalle}). ` +
              `Sin leerlo no se puede comparar con lo deployado, y un error de ` +
              `lectura nunca cuenta como sincronizado.`,
          },
        ],
      };

    case 'sin-lock':
      return {
        ...base,
        status: 'warn',
        hits: [],
        notes: [
          `${spec.lockFile} NO existe.`,
          `Ejecutá \`${spec.comandoDeploy}\` para crear el lock con el hash deployado.`,
          `Hash actual de ${spec.rulesFile}: ${estado.hashActual.slice(0, 12)}...`,
        ],
      };

    case 'lock-invalido':
      return {
        ...base,
        status: 'warn',
        hits: [],
        notes: [
          `${spec.lockFile} existe pero no tiene hash parseable.`,
          `Re-ejecutá \`${spec.comandoDeploy}\` para regenerarlo.`,
        ],
      };

    case 'sincronizado':
      return {
        ...base,
        status: 'pass',
        hits: [],
        notes: [
          `${spec.rulesFile} sincronizado con producción (${estado.hashActual.slice(0, 12)}...).`,
        ],
      };

    case 'pendiente': {
      const hit: InvariantHit = {
        file: spec.rulesFile,
        line: 1,
        snippet: `${spec.rulesFile} cambió desde el último deploy`,
        explanation:
          `El SHA-256 de ${spec.rulesFile} en el repo es ${estado.hashActual.slice(0, 12)}... pero ` +
          `el último deploy registrado fue ${estado.hashDeployado.slice(0, 12)}... ` +
          `Resultado: tu código nuevo puede chocar con las rules viejas en producción y ` +
          `causar ${spec.sintoma}. ` +
          `Recuperación: \`${spec.comandoDeploy}\` (deploya a Firebase + actualiza el lock).`,
      };
      return {
        ...base,
        status: 'fail',
        hits: [hit],
        notes: [`Hash repo:     ${estado.hashActual}`, `Hash deployed: ${estado.hashDeployado}`],
      };
    }
  }
}
