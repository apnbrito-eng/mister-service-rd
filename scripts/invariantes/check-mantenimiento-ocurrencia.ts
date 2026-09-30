/** P-039, base 80f704d3833ddb9e37f0e2cc31d41cb8ac75dfa4, 2026-09-29.
 * Batch con orden aleatoria permitía duplicar una ocurrencia de mantenimiento.
 */
import { readFileSync } from 'node:fs';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-039';
const PATTERN_NAME = 'Mantenimiento conserva identidad de ocurrencia';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const file = 'src/pages/Mantenimiento.tsx';
  if (!ALLOWLIST_FILES.has(file)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/addMonths\(item\.proximaFecha|doc\(collection\(db,\s*['"]ordenes_servicio['"]\)\)|proximaFecha[^\n]*\|\|\s*new Date\(/g)) hits.push({ file, line: source.slice(0, match.index).split('\n').length, snippet: match[0], explanation: 'Usar generarOcurrenciaMantenimiento con fecha real. Una orden aleatoria duplica solicitudes simultáneas; fecha ausente requiere corrección, nunca hoy.' });
    if (!source.includes('generarOcurrenciaMantenimiento(item.id')) hits.push({ file, line: 1, snippet: 'handler de generación', explanation: 'La acción manual debe usar el servicio transaccional por ocurrencia para no adelantar dos veces la programación.' });
  }
  for (const ruta of ['src/services/seguimientoChequeo.service.ts', 'api/_lib/avisosChequeo.ts']) {
    if (ALLOWLIST_FILES.has(ruta)) continue;
    const texto = readFileSync(ruta, 'utf8');
    if (!texto.includes('soloChequeoDisponible(')) hits.push({ file:ruta,line:1,snippet:'guard cancelación',explanation:'El seguimiento y cron deben detener órdenes canceladas, conservando los cierres legítimos de solo chequeo.' });
    if (ruta.startsWith('api/') && (!texto.includes("where('uid', '==', s.responsableUid)") || !texto.includes('personal.size !== 1') || !texto.includes('empleado.activo === false'))) hits.push({file:ruta,line:1,snippet:'responsable vigente',explanation:'Validar vínculo personal.uid único y activo además de usuarios: desactivar Personal debe detener avisos.'});
  }
  const helper = readFileSync('src/utils/soloChequeoDisponible.ts', 'utf8');
  if (!helper.includes("orden.fase !== 'cancelado'")) hits.push({file:'src/utils/soloChequeoDisponible.ts',line:1,snippet:'cancelación',explanation:'El helper común debe excluir canceladas sin excluir cerradas legítimas.'});
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
