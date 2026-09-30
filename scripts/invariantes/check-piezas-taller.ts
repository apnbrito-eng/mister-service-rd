/** P-036: llegada no atómica y solicitudes duplicadas, antecedente dc72250; 2026-09-29. */
import { readFileSync } from 'node:fs';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-036';
const PATTERN_NAME = 'Piezas y taller transaccionales';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const file = 'src/services/flujoPiezasTaller.service.ts';
  const texto = readFileSync(file, 'utf8');
  const hits: InvariantHit[] = [];
  if (!ALLOWLIST_FILES.has(file)) {
    for (const [patron, explanation] of [
      [/if \(datos\.estado === 'llego'\) return/, 'La llegada debe releer estado dentro de transacción y salir si ya llegó para no duplicar avisos.'],
      [/`taller_\$\{equipoId\}`/, 'La solicitud del taller debe usar ID estable por equipo: repetir standby no crea otra pieza.'],
      [/tx\.set\(doc\(db, 'notificaciones'/, 'El aviso debe formar parte de la transacción que registra llegada. No notificar después de un update independiente.'],
    ] as const) if (!patron.test(texto)) hits.push({ file, line: 1, snippet: patron.source, explanation });
    const llegada = texto.slice(texto.indexOf('export async function registrarLlegadaPieza'), texto.indexOf('export async function guardarSolicitudPieza'));
    if (!texto.includes('(actual.standbyRevision ?? 0) !== revision') || !texto.includes("p.data()?.estado !== 'llego'")) hits.push({ file, line: 1, snippet: 'reactivarOrdenPorPiezas', explanation: 'Reactivación humana debe releer revisión padre y estados dentro de la transacción; consultar piezas fuera no bloquea nuevas inserciones.' });
    if (/enStandby:\s*false/.test(llegada)) hits.push({ file, line: 1, snippet: 'enStandby: false', explanation: 'La llegada de una pieza no levanta standby: pueden quedar otras pendientes y falta coordinar la visita.' });
  }
  const pagina = 'src/pages/Standby.tsx';
  if (/query\(collection\(db, ['"]standby_piezas['"]\), orderBy/.test(readFileSync(pagina, 'utf8'))) hits.push({ file: pagina, line: 1, snippet: 'orderBy standby_piezas', explanation: 'orderBy excluye piezas históricas sin createdAt; leer todas y ordenar localmente para hacer visibles los bloqueos.' });
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
