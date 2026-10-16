/**
 * Política de contexto para `run-all.ts`: verificación vs publicación.
 *
 * P-005 (firestore.rules) y P-013 (storage.rules) comparan las reglas del repo
 * con el lock que registra lo deployado. Ese FAIL tiene sentido al publicar,
 * pero bloqueaba también verificar o guardar código con reglas aún no
 * deployadas. Subir código a GitHub NO publica: el release estricto ocurre en
 * el build de Vercel (`vercel.json` → `npm run check:publication`).
 *
 * Contextos (excluyentes entre sí):
 * - `estandar` (sin flag): comportamiento estricto de siempre.
 * - `--verification` (CI de GitHub Actions, pre-push): SOLO un mismatch
 *   demostrado (rules y lock leídos, lock con hash válido, hashes distintos)
 *   de P-005/P-013 baja a WARN, con ambos hashes como evidencia. Rules o lock
 *   ausentes, lock inválido o error de lectura → FAIL. Permitido en CI.
 * - `--publication` (build de Vercel): rules y lock deben existir, ser
 *   legibles, válidos e iguales. Cualquier otra cosa → FAIL.
 * - `--local-commit` (pre-commit): mismatch demostrado → WARN; lo demás igual
 *   que `estandar`. Prohibido con `CI`/`VERCEL` definidos o junto a `--ci`.
 *
 * En todos los modos el resto de los cazadores pasa intacto: un FAIL ajeno a
 * P-005/P-013 sigue bloqueando. La decisión se toma sobre el `EstadoRules`
 * inspeccionado del disco, nunca sobre el texto del mensaje.
 */
import type { InvariantResult } from './types.js';
import type { EstadoRules, SpecRulesDeploy } from './estado-rules-deploy.js';

export type ModoControl = 'estandar' | 'commit-local' | 'verificacion' | 'publicacion';

export type ResolucionModo =
  | { ok: true; modo: ModoControl }
  | { ok: false; error: string };

/** Variables de entorno que indican CI o build remoto. Cualquier valor no vacío cuenta. */
const VARIABLES_CI = ['CI', 'VERCEL'] as const;

const FLAGS: ReadonlyArray<[string, ModoControl]> = [
  ['--local-commit', 'commit-local'],
  ['--verification', 'verificacion'],
  ['--publication', 'publicacion'],
];

export function resolverModo(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): ResolucionModo {
  const presentes = FLAGS.filter(([flag]) => argv.includes(flag));

  if (presentes.length > 1) {
    return {
      ok: false,
      error: `${presentes.map(([f]) => f).join(' y ')} son contextos excluyentes; usá uno solo.`,
    };
  }
  if (presentes.length === 0) return { ok: true, modo: 'estandar' };

  const modo = presentes[0][1];
  if (modo === 'commit-local') {
    const activa = VARIABLES_CI.find((v) => (env[v] ?? '') !== '');
    if (activa) {
      return {
        ok: false,
        error: `--local-commit no está permitido con ${activa} definido: en CI/Vercel el control nunca es de commit local.`,
      };
    }
    if (argv.includes('--ci')) {
      return {
        ok: false,
        error: '--local-commit no está permitido junto a --ci.',
      };
    }
  }
  return { ok: true, modo };
}

export interface EstadoInspeccionado {
  spec: SpecRulesDeploy;
  estado: EstadoRules;
}

function explicacionEstricta(spec: SpecRulesDeploy, estado: EstadoRules): string {
  switch (estado.tipo) {
    case 'sin-rules':
      return `No existe ${spec.rulesFile}: no se puede certificar qué reglas acompañan este código.`;
    case 'sin-lock':
      return `No existe ${spec.lockFile}: no hay registro de qué reglas están en producción.`;
    case 'lock-invalido':
      return `${spec.lockFile} no tiene un hash parseable: no hay registro válido de producción.`;
    case 'error-lectura':
      return `No se pudo leer ${estado.archivo}: un error de lectura no certifica sincronía.`;
    case 'pendiente':
      return `${spec.rulesFile} difiere de lo registrado como deployado: publicar ahora separaría código y reglas.`;
    case 'sincronizado':
      return '';
  }
}

function forzarFail(
  r: InvariantResult,
  item: EstadoInspeccionado,
  etiqueta: string,
): InvariantResult {
  const explicacion =
    explicacionEstricta(item.spec, item.estado) ||
    `${item.spec.patternId} no está en pass (status=${r.status}).`;
  return {
    ...r,
    status: 'fail',
    hits:
      r.hits.length > 0
        ? r.hits
        : [
            {
              file: item.spec.rulesFile,
              line: 1,
              snippet: `[${etiqueta}] estado de reglas: ${item.estado.tipo}`,
              explanation: `${explicacion} Recuperación: \`${item.spec.comandoDeploy}\`.`,
            },
          ],
    notes: [`[${etiqueta}] ${explicacion}`, ...(r.notes ?? [])],
  };
}

function bajarAWarn(r: InvariantResult, item: EstadoInspeccionado, nota: string): InvariantResult {
  if (item.estado.tipo !== 'pendiente') return r;
  return {
    ...r,
    status: 'warn',
    notes: [
      nota,
      `Evidencia: sha256(${item.spec.rulesFile})=${item.estado.hashActual}`,
      `Evidencia: ${item.spec.lockFile} registra ${item.estado.hashDeployado}`,
      ...(r.notes ?? []),
    ],
  };
}

/**
 * Aplica la política del modo. Sólo toca los resultados cuyos patternId tienen
 * un estado inspeccionado; el resto pasa intacto. No elimina cazadores.
 */
export function aplicarPolitica(
  modo: ModoControl,
  resultados: readonly InvariantResult[],
  estados: readonly EstadoInspeccionado[],
): InvariantResult[] {
  return resultados.map((r) => {
    const item = estados.find((e) => e.spec.patternId === r.patternId);
    if (!item || modo === 'estandar') return r;

    if (modo === 'publicacion') {
      if (item.estado.tipo === 'sincronizado' && r.status === 'pass') return r;
      return forzarFail(r, item, '--publication');
    }

    if (modo === 'verificacion') {
      if (item.estado.tipo === 'sincronizado' && r.status === 'pass') return r;
      if (item.estado.tipo === 'pendiente' && r.status === 'fail') {
        return bajarAWarn(
          r,
          item,
          `[--verification] ${item.spec.rulesFile} difiere del lock deployado. Verificar ` +
            `código no publica; el build de publicación sigue bloqueado hasta ` +
            `\`${item.spec.comandoDeploy}\`. Esto NO prueba producción.`,
        );
      }
      return forzarFail(r, item, '--verification');
    }

    // commit-local
    if (item.estado.tipo === 'pendiente' && r.status === 'fail') {
      return bajarAWarn(
        r,
        item,
        `[--local-commit] Reglas guardadas localmente SIN desplegar. El commit se permite; ` +
          `esto NO prueba producción. La publicación sigue bloqueada hasta ` +
          `\`${item.spec.comandoDeploy}\`.`,
      );
    }
    return r;
  });
}
