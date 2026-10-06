// Cliente para la reasignación de órdenes desde el mapa.
//
// Habla únicamente con el endpoint `/api/mapa/reasignar`, que es el que
// enforce los permisos reales, revalida la agenda, serializa por técnico/día
// y escribe la orden con transacción. Esta capa cliente NO toca Firestore
// directamente — eso evita que el navegador pueda saltarse la validación
// servidor (motivo, operaria derivada, conflicto de agenda, control de
// versión por `updateTime`).
//
// Flujo típico:
//   1. `previewReasignacion({...})` → `{ previewId, conflictos, cambioDeGrupo, orden.version, ... }`
//   2. UI muestra confirmación, pide motivo si aplica. Si hay conflictos,
//      el UI puede mostrarlos como advertencia pero el servidor BLOQUEA
//      cualquier confirmación con solape (no existe forzar en este módulo).
//   3. `confirmarReasignacion(previewId, { motivo? })` → `{ ok, deshacer, undoDisponible }`.
//      Cuando `undoDisponible` es true, `deshacer` es una `PreviewReasignacionPeticion`
//      lista para volver a pasar por `previewReasignacion`, con `updateSeconds/Nanos`
//      para que el undo valide la versión EXACTA que escribimos.
//   4. Si `undoDisponible` es false, la UI NO debe ofrecer deshacer: otra tx
//      pisó la orden entre nuestra escritura y la lectura del receipt, por lo
//      que no conocemos una versión exacta para una triple segura.

import { auth } from '../firebase/config';
import type { FaseOrden } from '../types';

export type OrigenReasignacion = 'mapa' | 'mapa_sugerencia' | 'mapa_repartir' | 'deshacer' | 'reagendar';

export type CodigoReasignacion =
  | 'bad_request'
  | 'destino_invalido'
  | 'tecnico_inactivo'
  | 'operaria_no_configurada'
  | 'operaria_cambio'
  | 'permiso'
  | 'motivo_requerido'
  | 'no_existe'
  | 'bloqueada'
  | 'cambio'
  | 'conflicto_agenda'
  | 'preview_vencido'
  | 'nada_que_cambiar'
  | 'red';

export class ErrorReasignacion extends Error {
  constructor(public codigo: CodigoReasignacion, mensaje: string, public status: number = 0) {
    super(mensaje);
  }
}

export interface VersionOrden { seconds: number; nanos: number }

export interface EsperadoOrden {
  tecnicoId: string | null;
  fase: FaseOrden;
  fechaCitaMs: number | null;
  /** Obligatorio para `origen: 'deshacer'`; opcional en el resto. Captura la versión exacta de la orden. */
  updateSeconds?: number;
  updateNanos?: number;
}

export interface PreviewReasignacionPeticion {
  ordenId: string;
  nuevaFechaCitaMs?: number;
  esperado: EsperadoOrden;
  /** UID (auth) del técnico destino. `null` para dejar la orden sin técnico. */
  destinoUid: string | null;
  origen: OrigenReasignacion;
  motivo?: string;
}

export interface ReferenciaPersonal {
  uid: string;
  nombre: string | null;
}

export interface ConflictoAgenda {
  ordenId: string;
  clienteNombre: string;
  fechaCitaMs: number;
  duracionMin: number;
  fase: string;
}

export interface PreviewReasignacionResultado {
  ok: true;
  previewId: string;
  ttlMs: number;
  emitidoEnMs: number;
  orden: {
    ordenId: string;
    fase: FaseOrden;
    fechaCitaMs: number | null;
    duracionMin: number;
    version: VersionOrden;
    tecnicoAnterior: ReferenciaPersonal | null;
    operariaAnterior: ReferenciaPersonal | null;
  };
  destino: {
    uid: string;
    nombre: string | null;
    operariaUid: string | null;
    operariaNombre: string | null;
  } | null;
  conflictos: ConflictoAgenda[];
  cambioDeGrupo: boolean;
  requiereMotivoCambioGrupo: boolean;
}

export interface ConfirmarReasignacionOpciones {
  motivo?: string;
}

export type MotivoUndoNoDisponible =
  | 'orden_cambio_despues'
  | 'firestore_sin_updateTime'
  | 'tecnico_anterior_legacy_sin_uid';

export interface ConfirmarReasignacionResultado {
  ok: true;
  aplicadoMs: number;
  /** Commit time exacto escrito en Firestore (seconds/nanos). Null si Firestore no lo devolvió. */
  commit: VersionOrden | null;
  /** True si la orden quedó en la misma versión que escribimos y el técnico anterior tiene UID autorizado. */
  undoDisponible: boolean;
  motivoUndoNoDisponible?: MotivoUndoNoDisponible;
  /** Petición inversa lista para `previewReasignacion`; null cuando `undoDisponible=false`. */
  deshacer: PreviewReasignacionPeticion | null;
}

const RUTA = '/api/mapa/reasignar';
const TIMEOUT_MS = 30000;

async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ErrorReasignacion('permiso', 'Inicia sesión para continuar.', 401);
  const pedir = async (renovar = false) => fetch(RUTA, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken(renovar)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let response: Response;
  try {
    response = await pedir();
    if (response.status === 401 && auth.currentUser?.uid === user.uid) {
      response = await pedir(true);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'sin red';
    throw new ErrorReasignacion('red', `No se pudo contactar al servidor (${msg}).`);
  }
  let parsed: unknown = null;
  let parseFailed = false;
  try { parsed = await response.json(); } catch { parseFailed = true; }
  if (!response.ok) {
    const err = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? parsed as { error?: string; codigo?: string }
      : null;
    const codigo = (err?.codigo as CodigoReasignacion | undefined) ?? 'red';
    throw new ErrorReasignacion(
      codigo,
      err?.error ?? `El servidor respondió ${response.status}.`,
      response.status,
    );
  }
  // Respuesta HTTP 200 pero sin JSON (p.ej. dev server devolviendo HTML del index
  // cuando el endpoint `/api/mapa/reasignar` no está montado en Vite). Evita que
  // la UI reciba `null` tipado y falle con TypeError al acceder `.conflictos`.
  if (parseFailed || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ErrorReasignacion(
      'red',
      'El servidor respondió 200 sin JSON válido (endpoint ausente o mal configurado).',
      response.status,
    );
  }
  return parsed as T;
}

export async function previewReasignacion(p: PreviewReasignacionPeticion): Promise<PreviewReasignacionResultado> {
  return callApi<PreviewReasignacionResultado>({
    nuevaFechaCitaMs: p.nuevaFechaCitaMs,
    action: 'preview',
    ordenId: p.ordenId,
    esperado: p.esperado,
    destinoUid: p.destinoUid,
    origen: p.origen,
    motivo: p.motivo,
  });
}

export async function confirmarReasignacion(
  previewId: string,
  opts: ConfirmarReasignacionOpciones = {},
): Promise<ConfirmarReasignacionResultado> {
  return callApi<ConfirmarReasignacionResultado>({
    action: 'confirmar',
    previewId,
    motivo: opts.motivo,
  });
}

export interface DisponibilidadReagendar {
  ok: true; duracionMin: number;
  horarios: { hora: string; disponible: boolean; citas: ConflictoAgenda[] }[];
}
export function consultarDisponibilidadReagendar(p: PreviewReasignacionPeticion): Promise<DisponibilidadReagendar> {
  return callApi({ ...p, action: 'preview', origen: 'reagendar', consultarDisponibilidad: true });
}

export function cancelarVisitaOrden(ordenId: string, esperado: EsperadoOrden, motivo: string): Promise<{ ok: true; yaCancelada: boolean }> {
  return callApi({ action: 'cancelar_visita', ordenId, esperado, motivo });
}
