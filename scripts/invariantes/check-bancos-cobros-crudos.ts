/** P-033, 2026-09-29: proteger nueva proyección contra fechas inventadas/doble suma. Hash fix pendiente del coordinador. */
import { readFileSync } from 'node:fs';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-033';
const PATTERN_NAME = 'Banco consulta cobros crudos sin mutaciones';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const revisar = (file: string, invalido: RegExp, explanation: string) => {
    if (ALLOWLIST_FILES.has(file)) return;
    const texto = readFileSync(file, 'utf8');
    const match = invalido.exec(texto);
    if (match) hits.push({ file, line: texto.slice(0, match.index).split('\n').length, snippet: match[0], explanation });
  };
  revisar('src/components/bancos/MovimientosBanco.tsx', /\b(parseOrden|addDoc|updateDoc|setDoc|deleteDoc|writeBatch)\s*\(/, 'El historial es sólo lectura de pagos crudos: parseOrden puede inventar fechas y las escrituras no pertenecen a esta proyección.');
  revisar('src/utils/movimientosCobros.ts', /\bparseOrden\s*\(|new Date\(\s*\)/, 'No convertir pagos sin fecha en pagos de hoy. Usar fechaFinanciera(raw.fecha) y reportar incidencia.');
  revisar('src/pages/Bancos.tsx', /migrarBancosGenericosAReales\s*\(/, 'Abrir Bancos no debe ejecutar una migración de cuentas. Migraciones requieren un proceso explícito, no el montaje de la pantalla.');
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
