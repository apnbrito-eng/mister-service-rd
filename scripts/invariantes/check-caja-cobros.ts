/** P-035: caja desde pagos verificables y cierre atómico. Bug original: hash pendiente del coordinador (sin git en builder). */
import { readFileSync } from 'node:fs';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-035';
const PATTERN_NAME = 'Caja usa pagos reales y cierre atómico';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const hits: InvariantHit[] = [];
  for (const [file, pattern, explanation] of [
    ['src/pages/CierreDia.tsx', /isSameDay\s*\(/, 'El cierre usa día RD con diaCobroRD; no la zona horaria del navegador.'],
    ['src/utils/resumenOperativoDia.ts', /\.updatedAt\b|\|\|\s*new Date\(\)/, 'La fecha de cierre requiere evidencia de cierreServicio o historial. No asignar updatedAt ni hoy a un cierre desconocido.'],
    ['src/pages/CierreDia.tsx', /transferenciasMap\[t\.banco\]/, 'El nombre de banco no identifica la cuenta: conservar bancoId como clave del snapshot para no sobrescribir cuentas homónimas.'],
    ['src/services/cierreDia.service.ts', /entregadoPor:\s*(usuario|actor\.nombre)\b/, 'La entrega necesita UID autenticado como entregadoPor; conservar nombre en entregadoPorNombre.'],
    ['src/pages/CierreDia.tsx', /\b(addDoc|updateDoc)\s*\(/, 'Cerrar y entregar requieren transacciones: usar cierreDia.service, no escrituras parciales desde la página.'],
    ['src/pages/Facturas.tsx', /pagadasAnio\.reduce|estado:\s*['"]pagada['"]\s*,\s*fechaPago:\s*Timestamp\.now/, 'Un conduce marcado pagado no constituye ingreso. Registrar pago real en la orden y proyectar pagos confirmados.'],
    ['src/pages/Gastos.tsx', /Timestamp\.fromDate\(new Date\(form\.fecha\)\)/, 'Fecha YYYY-MM-DD es día RD: usar fechaFinanciera para no trasladar el gasto al día anterior.'],
  ] as const) {
    if (ALLOWLIST_FILES.has(file)) continue;
    const source = readFileSync(file, 'utf8'); const match = pattern.exec(source);
    if (match) hits.push({ file, line: source.slice(0, match.index).split('\n').length, snippet: match[0], explanation });
  }
  const servicio = 'src/services/ordenes.service.ts';
  const reparacion = readFileSync(servicio, 'utf8').split('export async function conciliarIdentidadFechaPago')[1] || '';
  if (!/if \(tieneIdPagoRepetido\(actual, pagos\)\) throw/.test(reparacion)) hits.push({ file: servicio, line: 1, snippet: 'conciliarIdentidadFechaPago', explanation: 'Bloquear ID repetido antes de regenerar identidad: una copia podría convertirse en otro cobro confirmado.' });
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const result = check(); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'fail' ? 1 : 0; }
