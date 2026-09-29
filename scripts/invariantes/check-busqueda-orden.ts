/** P-029, 2026-09-29: órdenes no se encontraban por teléfono/falla. Hash original/fix pendiente del commit del coordinador. */
import { readFileSync } from 'node:fs';
import { coincideBusquedaOrden } from '../../src/utils/buscarOrden.js';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-029';
const PATTERN_NAME = 'Búsqueda completa sobre órdenes visibles';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  const file = 'src/pages/Ordenes.tsx';
  if (!ALLOWLIST_FILES.has(file)) {
    const texto = readFileSync(file, 'utf8');
    const bloque = texto.slice(texto.indexOf('const ordenesFiltradas ='), texto.indexOf('// Horarios ocupados'));
    if (!/ordenesVisibles\.filter/.test(bloque) || !/coincideBusquedaOrden\(o, busqueda\)/.test(bloque) || !/matchBusqueda && matchEstado && matchTecnico && matchMes/.test(bloque)) {
      hits.push({ file, line: 1, snippet: 'ordenesFiltradas', explanation: 'La búsqueda debe usar coincideBusquedaOrden sobre ordenesVisibles y conservar estado/técnico/mes; buscar sobre toda la colección puede revelar órdenes fuera del rol.' });
    }
  }
  const helper = 'src/utils/buscarOrden.ts';
  if (!ALLOWLIST_FILES.has(helper)) {
    const orden = { numero: 'OS-0011', clienteNombre: 'José Ramírez', clienteTelefono: '+1 (809) 555-1001', descripcionFalla: 'No centrifuga', equipoMarca: 'Samsung' };
    for (const consulta of ['jose ramirez', '8095551001', '#OS 0011', 'centrifuga', 'samsung']) {
      if (!coincideBusquedaOrden(orden, consulta)) hits.push({ file: helper, line: 1, snippet: consulta, explanation: 'Restaurar coincidencias por nombre sin tildes, teléfono normalizado, número OS y detalle. Esta consulta de control debe encontrar la orden.' });
    }
  }
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
