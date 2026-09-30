/** P-038, base 80f704d3833ddb9e37f0e2cc31d41cb8ac75dfa4 (2026-09-29).
 * Dos rutas emitían conduce para la misma orden y la emisión recreaba comisión.
 */
import { readFileSync } from 'node:fs';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-038';
const PATTERN_NAME = 'Cotización usa emisión canónica sin nuevo devengo';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const checks: Array<[string, RegExp, string]> = [
    ['src/pages/Cotizaciones.tsx', /writeBatch\s*\(|deleteDoc\s*\(/g, 'Los vínculos requieren lectura transaccional y limpieza de ambos extremos; usar vinculoCotizacion.service.'],
    ['src/pages/Cotizaciones.tsx', /siguienteNumeroFactura\s*\(|collection\(db,\s*['"]facturas['"]\)/g, 'Abrir la orden y emitir por ProcesarFacturacionModal; no crear otra ruta de conduce.'],
    ['src/components/facturacion-pendiente/ProcesarFacturacionModal.tsx', /registrarComision(?:esPorItems|PorFactura)\s*\(/g, 'La emisión solo refleja comisiones devengadas; no crear/recalcular comisiones antes de confirmar el conduce.'],
  ];
  for (const [file, pattern, explanation] of checks) {
    if (ALLOWLIST_FILES.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) hits.push({ file, line: source.slice(0, match.index).split('\n').length, snippet: match[0], explanation });
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
