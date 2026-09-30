import {
  collection, doc, runTransaction, serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

/**
 * Errores estructurados del write atómico orden+vínculo cita. Cada valor es
 * discriminable — el caller (`useOrdenCreateForm.handleSubmit`) matchea sobre
 * `error.message` para elegir el toast/unlock adecuado. Nunca cambies estos
 * strings sin actualizar los consumidores.
 */
export const ERR_CITA_DESAPARECIO = 'VINCULO:CITA_DESAPARECIO';
export const ERR_CITA_YA_VINCULADA_PREFIX = 'VINCULO:CITA_YA_VINCULADA:';

export interface IntentoCita { usuarioId: string; intentoId: string; huella: string }
const camposLock = new Set(['procesando', 'procesandoPor', 'procesandoEn', 'procesandoIntento', 'ordenIdCreada', 'clienteIdVinculado']);
function huellaCita(data: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(data).filter(([k]) => !camposLock.has(k)).sort(([a], [b]) => a.localeCompare(b))));
}
function verificarIntento(data: Record<string, unknown>, intento: IntentoCita) {
  if (!intento.usuarioId || !intento.intentoId || data.procesando !== true || data.procesandoPor !== intento.usuarioId || data.procesandoIntento !== intento.intentoId) throw new Error('VINCULO:LOCK_AJENO');
  if (huellaCita(data) !== intento.huella || data.eliminada === true || ['cancelada', 'cancelado', 'rechazada'].includes(String(data.estado))) throw new Error('VINCULO:CITA_CAMBIO');
}
export async function adquirirIntentoCita(db: Firestore, citaId: string, usuarioId: string, intentoId: string) {
  if (!usuarioId || !intentoId) throw new Error('VINCULO:IDENTIDAD_REQUERIDA');
  return runTransaction(db, async tx => {
    const ref = doc(db, 'citas_por_confirmar', citaId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('CITA_NO_EXISTE');
    const data = snap.data();
    if (data.procesando === true) throw new Error('CITA_YA_PROCESANDO');
    if (data.eliminada === true || ['cancelada', 'cancelado', 'rechazada'].includes(String(data.estado))) throw new Error('VINCULO:CITA_CAMBIO');
    tx.update(ref, { procesando: true, procesandoPor: usuarioId, procesandoIntento: intentoId, procesandoEn: serverTimestamp() });
    return { usuarioId, intentoId, huella: huellaCita(data), ordenId: typeof data.ordenIdCreada === 'string' ? data.ordenIdCreada : null };
  });
}
export async function liberarIntentoCita(db: Firestore, citaId: string, intento: IntentoCita) {
  await runTransaction(db, async tx => {
    const ref = doc(db, 'citas_por_confirmar', citaId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.procesandoPor !== intento.usuarioId || data.procesandoIntento !== intento.intentoId) return;
    tx.update(ref, { procesando: false, procesandoPor: null, procesandoIntento: null, procesandoEn: null });
  });
}

export interface EscribirOrdenConVinculoCitaResult {
  ordenId: string;
}

/**
 * Escribe el doc de la orden y el vínculo `ordenIdCreada` en la cita
 * pre-cargada dentro de una **sola** `runTransaction`. Antes esto vivía
 * como dos escrituras separadas (`addDoc` + `updateDoc`); si la segunda
 * fallaba, un reintento creaba una orden duplicada. P042 añade propiedad
 * del intento y validación de vigencia dentro de esta misma transacción.
 *
 * Invariantes garantizadas por la tx:
 *   1. Si el commit falla, NI la orden NI el vínculo persisten — retry limpio.
 *   2. Si el commit exitoso, ambos existen — retry ve `ordenIdCreada` en el
 *      lock pre-tx del caller y salta la creación.
 *   3. El id de la orden es Firestore-generado (auto-id sobre la colección),
 *      no derivado del payload — dos submits con el mismo cliente NUNCA
 *      chocan por id.
 *
 * Notas:
 *   - El caller reservó el `numero` de la orden vía `siguienteNumeroOrden()`
 *     ANTES de invocar esta función. El contador es su propia tx atómica; si
 *     el commit acá falla, el número queda "hueco" (acepta hueco numérico
 *     por diseño — es preferible al riesgo de doble orden).
 *   - Firebase Web SDK NO soporta `tx.get(query)`; solo `tx.get(docRef)`.
 *     Por eso la validación de "cita todavía existe" se hace por doc ref.
 *   - Si otro operador ganó la carrera entre el lock pre-tx y este commit,
 *     `data.ordenIdCreada` estará seteado en el snapshot dentro de la tx y
 *     lanzamos `ERR_CITA_YA_VINCULADA_PREFIX + <id>`. El caller decide si
 *     usar ese id (retry idempotente) o mostrar error al usuario.
 */
export async function escribirOrdenConVinculoCita(
  db: Firestore,
  params: {
    ordenData: Record<string, unknown>;
    citaId: string;
    usuarioId?: string | null;
    intento: IntentoCita;
  },
): Promise<EscribirOrdenConVinculoCitaResult> {
  const { ordenData, citaId } = params;
  if (!citaId || typeof citaId !== 'string') {
    throw new Error('VINCULO:CITA_ID_INVALIDO');
  }
  const citaRef = doc(db, 'citas_por_confirmar', citaId);
  // Firestore auto-id — no mezcla clientes ni depende del payload.
  const nuevaOrdenRef = doc(collection(db, 'ordenes_servicio'));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(citaRef);
    if (!snap.exists()) {
      throw new Error(ERR_CITA_DESAPARECIO);
    }
    const data = snap.data();
    verificarIntento(data, params.intento);
    if (typeof data.ordenIdCreada === 'string' && data.ordenIdCreada) {
      throw new Error(ERR_CITA_YA_VINCULADA_PREFIX + data.ordenIdCreada);
    }
    // Escritura atómica: si cualquier paso falla, Firestore rollback ambos.
    tx.set(nuevaOrdenRef, Object.fromEntries(Object.entries(ordenData).filter(([, v]) => v !== undefined))); 
    tx.update(citaRef, {
      ordenIdCreada: nuevaOrdenRef.id,
      clienteIdVinculado: ordenData.clienteId || null,
      // Refrescamos el lock adentro de la tx: el pre-tx del caller pudo
      // haber terminado hace milisegundos, pero mantenemos la invariante
      // "cita en procesando durante toda la creación" hasta el deleteDoc
      // final del caller.
      procesando: true,
      procesandoPor: params.intento.usuarioId,
      procesandoEn: serverTimestamp(),
    });
  });

  return { ordenId: nuevaOrdenRef.id };
}

export interface ValidarOrdenReusableResult {
  existe: boolean;
  numero: string;
}

/**
 * Valida que el `ordenIdCreada` heredado de un intento previo apunta a un
 * doc REAL antes de reusarlo en el flujo de garantía/notificaciones. Sin
 * esto, un vínculo bogus (borrado manual admin, replica inconsistente)
 * llevaría a re-ejecutar `onAfterCreate` con un id fantasma y reportar
 * "éxito" al usuario sin orden real detrás.
 */
export async function validarOrdenReusable(
  db: Firestore,
  ordenId: string,
  contexto: { citaId: string; intento: IntentoCita },
): Promise<ValidarOrdenReusableResult> {
  return runTransaction(db, async tx => {
    const cita = await tx.get(doc(db, 'citas_por_confirmar', contexto.citaId));
    if (!cita.exists()) return { existe: false, numero: '' };
    const datosCita = cita.data();
    verificarIntento(datosCita, contexto.intento);
    const snap = await tx.get(doc(db, 'ordenes_servicio', ordenId));
    if (!snap.exists()) return { existe: false, numero: '' };
    const raw = snap.data();
    const telefono = (v: unknown) => String(v || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    const clienteCorrecto = datosCita.clienteIdVinculado
      ? datosCita.clienteIdVinculado === raw.clienteId
      : !!telefono(datosCita.telefono) && telefono(datosCita.telefono) === telefono(raw.clienteTelefono);
    const valida = datosCita.ordenIdCreada === ordenId && raw.metadatosCita?.citaOrigenId === contexto.citaId && clienteCorrecto && raw.estado === 'activo' && raw.eliminada !== true && raw.estaAnulada !== true;
    return { existe: valida, numero: valida && typeof raw.numero === 'string' ? raw.numero : '' };
  });
}
