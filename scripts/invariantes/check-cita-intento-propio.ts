/** P-042, 2026-09-29. Base auditada 80f704d3833ddb9e37f0e2cc31d41cb8ac75dfa4.
 * Lock robado por ordenIdCreada y unlock no condicional; hash intro exacto desconocido.
 * Fix pendiente de commit del coordinador. */
import { readFileSync } from 'node:fs';
import type { InvariantHit, InvariantResult } from './types.js';
const PATTERN_ID = 'P-042';
const PATTERN_NAME = 'Confirmación de cita conserva propietario e intento';
const ALLOWLIST_FILES = new Set<string>(); // si crece >5, refactorear el cazador
export function check(): InvariantResult {
  const file = 'src/utils/vinculoOrdenCita.ts';
  const source = readFileSync(file, 'utf8');
  const hits: InvariantHit[] = [];
  const exigir = (ok: boolean, explanation: string) => { if (!ok && !ALLOWLIST_FILES.has(file)) hits.push({ file, line: 1, snippet: 'Protocolo intento cita', explanation }); };
  exigir(source.includes('data.procesandoIntento !== intento.intentoId') && source.includes('data.procesandoPor !== intento.usuarioId'), 'Validar propietario y token en commit y liberación; un intento antiguo no puede liberar al nuevo.');
  const adquirir = source.slice(source.indexOf('export async function adquirirIntentoCita'), source.indexOf('export async function liberarIntentoCita'));
  exigir(adquirir.indexOf('CITA_YA_PROCESANDO') >= 0 && adquirir.indexOf('CITA_YA_PROCESANDO') < adquirir.indexOf('ordenIdCreada'), 'Comprobar lock antes de reutilizar ordenIdCreada: callback de garantía aún puede estar activo.');
  const escribir = source.slice(source.indexOf('export async function escribirOrdenConVinculoCita'), source.indexOf('export interface ValidarOrdenReusableResult'));
  exigir(escribir.includes('verificarIntento(data, params.intento)'), 'Commit debe verificar token y vigencia de cita dentro de la transacción.');
  exigir(source.includes('raw.metadatosCita?.citaOrigenId === contexto.citaId') && source.includes("raw.estado === 'activo'") && source.includes('clienteCorrecto'), 'Reutilización exige cita de origen, cliente y orden activa, no sólo existencia.');
  const hook = readFileSync('src/hooks/useOrdenCreateForm.ts', 'utf8');
  exigir(hook.includes('liberarIntentoCita(db, citaPreset.id, intentoCita)'), 'Liberar lock mediante transacción condicional, nunca updateDoc incondicional.');
  const finalizacion = readFileSync('src/utils/finalizarConfirmacionCita.ts', 'utf8');
  exigir(hook.includes('await finalizarConfirmacionCita({') && finalizacion.includes('return false;') && finalizacion.indexOf('return false;') < finalizacion.indexOf('params.completada()'), 'Un fallo del callback debe finalizar sin éxito ni reset; usar finalizarConfirmacionCita que conserva el formulario.');
  return { patternId: PATTERN_ID, patternName: PATTERN_NAME, status: hits.length ? 'fail' : 'pass', hits };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = check(); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.status === 'fail' ? 1 : 0; }
