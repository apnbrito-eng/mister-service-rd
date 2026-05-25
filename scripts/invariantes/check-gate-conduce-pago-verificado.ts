/**
 * P-023 — Gate del conduce DEBE bloquear emisión si hay pago con verificado===false
 *
 * Bug original (anticipado, no histórico — preventivo post fase A de
 * SPRINT-PAGOS-CONFIRMA-MARIA, 2026-05-21):
 *
 * `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx`
 * (función `handleGenerar`) contiene la línea crítica que separa el flujo
 * "operaria registra pago" del flujo "admin/coord/María confirma":
 *
 *   const pagosSinVerificar = pagosPrevios.filter(p => p.verificado === false);
 *   if (pagosSinVerificar.length > 0) {
 *     toast.error('Hay X pago(s) sin confirmar...');
 *     return;
 *   }
 *
 * Sin este gate, una operaria registra pago + emite conduce ella misma sin
 * intervención de la coordinadora → se rompe el control de separación de
 * funciones que fase A introdujo. Es el bug de dinero que más le importa
 * a Jorge porque María se hizo responsable de validar cada cobro.
 *
 * El cazador verifica que el archivo `ProcesarFacturacionModal.tsx` siga
 * conteniendo el filtro + el bloqueo (returna early con toast). Si un
 * refactor lo borra (por simplificación de spec, por error en merge, por
 * "lo limpio porque no entiendo qué hace"), el cazador falla.
 *
 * Regla:
 *   El archivo `src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx`
 *   DEBE contener TODAS estas señales:
 *     1. `.verificado === false` o `.verificado===false` (el filtro).
 *     2. `pagosSinVerificar` o nombre similar que indique "filtro de pagos sin verificar".
 *     3. `toast.error(` cercano (mismo bloque) — el bloqueo visible al usuario.
 *     4. Algún `return` en la cercanía — la salida temprana que bloquea.
 *
 * Si falta alguna → FAIL.
 *
 * Cazador NO-allowlist: el archivo es único y específico. No tiene sentido
 * permitir exenciones — si el gate se quita, sub-regla CLAUDE.md
 * "Mutaciones cross-collection sobre dinero" requiere OK explícito de
 * Jorge y nuevo sprint con la spec del cambio.
 *
 * Si el archivo se renombra o el modal se splittea (refactor mayor),
 * actualizar `TARGET_FILE` y `EXPECTED_SIGNALS` en este cazador, NO
 * desactivarlo.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InvariantResult, InvariantHit } from './types.js';

const PATTERN_ID = 'P-023';
const PATTERN_NAME =
  'Gate del conduce (ProcesarFacturacionModal) bloquea emisión con pago verificado===false';
const ROOT_DIR = path.resolve(process.cwd());

const TARGET_FILE = 'src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx';

// Patrones que DEBEN estar presentes en el archivo:
const REQUIRED_SIGNALS: { name: string; regex: RegExp; explanation: string }[] = [
  {
    name: 'filter verificado===false',
    regex: /\.verificado\s*===\s*false/,
    explanation:
      'Falta el filtro `.verificado === false` que identifica pagos sin confirmar. ' +
      'Sin él, el gate del conduce no distingue pagos verificados de no-verificados.',
  },
  {
    name: 'variable pagosSinVerificar',
    regex: /\bpagosSinVerificar\b/,
    explanation:
      'Falta la variable `pagosSinVerificar` que materializa el filtro. Si fue ' +
      'renombrada, actualizar este cazador. Si fue eliminada, el gate del conduce ' +
      'puede haberse perdido en un refactor.',
  },
  {
    name: 'bloqueo con toast.error',
    regex: /toast\.error\([^)]*sin\s+confirmar/i,
    explanation:
      'Falta el `toast.error(...)` que avisa al usuario que el conduce está ' +
      'bloqueado por pagos sin confirmar. El gate sin feedback al usuario es ' +
      'casi tan malo como sin gate (usuario no entiende qué pasa).',
  },
];

export async function check(): Promise<InvariantResult> {
  const fullPath = path.join(ROOT_DIR, TARGET_FILE);
  let content: string;
  try {
    content = await fs.readFile(fullPath, 'utf8');
  } catch (err) {
    return {
      patternId: PATTERN_ID,
      patternName: PATTERN_NAME,
      status: 'fail',
      hits: [
        {
          file: TARGET_FILE,
          line: 0,
          snippet: `Archivo no existe o no se pudo leer: ${(err as Error).message}`,
          explanation:
            `El archivo target del cazador no se encontró. Si el modal se renombró ` +
            `o splitteó, actualizar TARGET_FILE en \`scripts/invariantes/check-gate-conduce-pago-verificado.ts\`. ` +
            `NO simplemente borrar el cazador — verificar primero que el gate sigue en algún lugar.`,
        },
      ],
      notes: [`Target: ${TARGET_FILE}`],
    };
  }

  const hits: InvariantHit[] = [];
  const lines = content.split('\n');

  for (const signal of REQUIRED_SIGNALS) {
    if (!signal.regex.test(content)) {
      hits.push({
        file: TARGET_FILE,
        line: 1, // signal missing — no line specific
        snippet: `Falta señal: "${signal.name}" (regex: ${signal.regex})`,
        explanation: signal.explanation,
      });
    }
  }

  // Si alguna señal está presente pero el patrón completo está roto, agregamos
  // verificación adicional: las 3 señales deberían estar dentro de ~50 líneas
  // entre sí (es el bloque del gate). Si están muy dispersas, alguien las
  // desconectó.
  if (hits.length === 0) {
    const lineWithFilter = lines.findIndex((l) => /\.verificado\s*===\s*false/.test(l));
    const lineWithPagosSinVerificar = lines.findIndex((l) => /\bpagosSinVerificar\b/.test(l));
    const lineWithToast = lines.findIndex((l) => /toast\.error\([^)]*sin\s+confirmar/i.test(l));

    if (
      lineWithFilter !== -1 &&
      lineWithPagosSinVerificar !== -1 &&
      lineWithToast !== -1
    ) {
      const minL = Math.min(lineWithFilter, lineWithPagosSinVerificar, lineWithToast);
      const maxL = Math.max(lineWithFilter, lineWithPagosSinVerificar, lineWithToast);
      if (maxL - minL > 50) {
        hits.push({
          file: TARGET_FILE,
          line: minL + 1,
          snippet: `Señales del gate están separadas por ${maxL - minL} líneas`,
          explanation:
            `Las 3 señales del gate del conduce (filtro \`verificado === false\`, ` +
            `variable \`pagosSinVerificar\`, \`toast.error\` con "sin confirmar") existen ` +
            `pero están separadas por más de 50 líneas. Esto sugiere que el gate ` +
            `fue desconectado en un refactor (ej: la variable se calcula pero ya no se ` +
            `usa para bloquear). Revisar manualmente que el flujo \`if (pagosSinVerificar.length > 0) { ` +
            `toast.error(...); return; }\` sigue intacto.`,
        });
      }
    }
  }

  return {
    patternId: PATTERN_ID,
    patternName: PATTERN_NAME,
    status: hits.length > 0 ? 'fail' : 'pass',
    hits,
    notes: [
      `Target: ${TARGET_FILE}`,
      `Señales verificadas: ${REQUIRED_SIGNALS.map((s) => s.name).join(', ')}`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  });
}
