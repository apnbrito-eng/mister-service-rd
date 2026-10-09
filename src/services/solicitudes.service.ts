import { completarCarteraAlta } from './carteraClientes.service';
import { obtenerAppCheckToken } from '../lib/appCheck';
import {
  collection, updateDoc, deleteDoc, getDoc, getDocs, doc,
  query, where, serverTimestamp, onSnapshot, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { SolicitudServicio, EstadoSolicitud } from '../types/formularios';
import { siguienteNumeroOrden } from './contadores.service';
import { subirArchivoPublicoSeguro } from './subidasPublicas.service';
import { stripUndefinedProfundo } from './firestoreStrip';

// Re-export para preservar cualquier import externo del helper
// (los tests unitarios lo importan desde el módulo estándar del servicio y
// desde el módulo puro `./firestoreStrip`). Ver
// `tests/unit/stripUndefinedProfundo.test.ts` para cobertura P-020.
export { stripUndefinedProfundo };

const COL = 'solicitudes_servicio';

function parseSolicitud(id: string, data: Record<string, unknown>): SolicitudServicio {
  return {
    id,
    formularioId: (data.formularioId as string) || '',
    formularioNombre: (data.formularioNombre as string) || '',
    empresaId: (data.empresaId as string) || '',
    empresaNombre: (data.empresaNombre as string) || '',
    datos: (data.datos as Record<string, unknown>) || {},
    archivos: Array.isArray(data.archivos)
      ? (data.archivos as SolicitudServicio['archivos'])
      : [],
    estado: (data.estado as EstadoSolicitud) || 'pendiente',
    ordenId: (data.ordenId as string) || undefined,
    notas: (data.notas as string) || '',
    ubicacion: data.ubicacion as SolicitudServicio['ubicacion'] | undefined,
    createdAt: data.createdAt as SolicitudServicio['createdAt'],
    updatedAt: data.updatedAt as SolicitudServicio['updatedAt'],
  };
}

export async function crearSolicitud(
  data: Omit<SolicitudServicio, 'id' | 'createdAt' | 'updatedAt'>,
  requestId: string
): Promise<string> {
  const token = await obtenerAppCheckToken();
  if (!token) throw new Error('No pudimos verificar la solicitud. Recarga la página e inténtalo de nuevo.');
  const respuesta = await fetch('/api/publico/solicitud', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': token },
    body: JSON.stringify({ formularioId: data.formularioId, datos: data.datos, archivos: data.archivos, requestId }),
  });
  const resultado = await respuesta.json() as { ok?: boolean; referencia?: string; error?: string };
  if (!respuesta.ok || !resultado.ok || !resultado.referencia) throw new Error(resultado.error || 'No pudimos registrar la solicitud.');
  return resultado.referencia;
}

export async function obtenerSolicitud(id: string): Promise<SolicitudServicio | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return parseSolicitud(snap.id, snap.data() as Record<string, unknown>);
}

export async function listarSolicitudes(
  filtros?: { estado?: EstadoSolicitud; empresaId?: string }
): Promise<SolicitudServicio[]> {
  const constraints = [];
  if (filtros?.estado) constraints.push(where('estado', '==', filtros.estado));
  if (filtros?.empresaId) constraints.push(where('empresaId', '==', filtros.empresaId));

  const q = constraints.length > 0
    ? query(collection(db, COL), ...constraints)
    : query(collection(db, COL));

  const snap = await getDocs(q);
  const solicitudes = snap.docs.map(d => parseSolicitud(d.id, d.data() as Record<string, unknown>));
  return solicitudes.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  });
}

export async function actualizarEstadoSolicitud(
  id: string,
  estado: EstadoSolicitud,
  notas?: string
): Promise<void> {
  const update: Record<string, unknown> = {
    estado,
    updatedAt: serverTimestamp(),
  };
  if (notas !== undefined) update.notas = notas;
  await updateDoc(doc(db, COL, id), update);
}

/**
 * Payload de resolución de cliente para la conversión. El caller decide una
 * de estas dos formas:
 *
 * - `existente`: reusar un cliente que ya está en la colección `clientes`
 *   (encontrado por búsqueda previa por teléfono). La transacción verifica
 *   que el doc siga existiendo antes de escribir la orden — si desapareció
 *   (borrado por otro admin entre la búsqueda y la conversión) la
 *   conversión falla y NO se crea orden huérfana.
 *
 * - `crear`: crear un cliente nuevo dentro de la misma transacción. Se
 *   usa `telefonoNormalizado` como id del doc (convención canónica del
 *   módulo — ver `clientes.service.ts::buscarOCrearCliente`). Si dos
 *   admins hacen click "convertir" al mismo tiempo, el segundo hallará el
 *   doc ya creado por el primero (optimistic-lock de Firestore) y hará
 *   un merge que preserva los campos no vacíos existentes — nunca los
 *   sobrescribe.
 */
export type ClienteConversion =
  | { tipo: 'existente'; clienteId: string }
  | {
      tipo: 'crear';
      telefonoNormalizado: string;
      telefonoOriginal: string;
      nombre: string;
      email?: string;
      direccion?: string;
      referenciaDireccion?: string;
      lat?: number;
      lng?: number;
    };

/**
 * Lista TODOS los clientes activos que comparten `telefonoNormalizado`.
 * Usado por la UI de conversión para detectar ambigüedad (>1 candidato) y
 * forzar selección explícita del admin. La invariante es "1 doc por telNorm"
 * porque el id canónico ES el telNorm (ver `buscarOCrearCliente`), pero
 * puede haber legacy pre-dedup con id auto-generado + telefonoNormalizado.
 * `buscarClientePorTelefono` silenciosamente pica el primero — este helper
 * expone el conteo real.
 */
export async function listarClientesActivosPorTelefono(
  telefono: string,
): Promise<Array<{ id: string; nombre: string; telefono: string; direccion: string }>> {
  const soloDigitos = telefono.replace(/\D/g, '');
  let telNorm = '';
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) telNorm = soloDigitos.slice(1);
  else if (soloDigitos.length === 10) telNorm = soloDigitos;
  if (!telNorm || telNorm.length !== 10) return [];
  const q = query(collection(db, 'clientes'), where('telefonoNormalizado', '==', telNorm));
  const snap = await getDocs(q);
  return snap.docs
    .filter(d => d.data().eliminado !== true)
    .map(d => {
      const data = d.data();
      return {
        id: d.id,
        nombre: (data.nombre as string) || '',
        telefono: (data.telefono as string) || telNorm,
        direccion: (data.direccion as string) || '',
      };
    });
}

/**
 * Convierte una solicitud en una orden de servicio de forma atómica e
 * idempotente. El nuevo doc de la orden y el update de la solicitud van en
 * un solo `runTransaction`, por lo que un cliente que reintente tras un
 * timeout NO creará dos órdenes: la segunda invocación detectará
 * `data.ordenId` dentro del callback y retornará el mismo id.
 *
 * Idempotencia: si la solicitud ya tiene `ordenId`, se retorna sin escribir
 * nada. El chequeo se hace ANTES de reservar número (para no quemar
 * counters) y también DENTRO del callback (defensivo contra race con
 * escrituras concurrentes).
 *
 * NO marca la solicitud como `convertida` antes de haber escrito la orden
 * — ambos writes viven en el mismo commit atómico.
 *
 * Resolución de cliente (2026-09-29 iteración 2):
 *   - Si el caller pasa `clienteConversion`, la resolución del cliente
 *     ocurre DENTRO de la misma transacción que la orden — la orden nunca
 *     queda apuntando a un `clienteId` que no existe.
 *   - `tipo: 'existente'` verifica que el doc de cliente esté vivo antes
 *     de escribir la orden; si desapareció, throw sin crear orden.
 *   - `tipo: 'crear'` usa `telefonoNormalizado` como id, hace `tx.get` y
 *     - Si NO existe: `tx.set` con los datos del formulario (payload
 *       limpio, sin `undefined`).
 *     - Si YA existe (race con otra conversión / cliente pre-existente
 *       encontrado tarde): NO sobrescribe campos ya poblados — solo
 *       agrega los que están vacíos, y refresca `updatedAt`.
 *   - Si el caller NO pasa `clienteConversion`, se usa el `clienteId` que
 *     venga en `ordenData` tal cual (retrocompat).
 *
 * El caller (Solicitudes.tsx) debe garantizar que si hay más de un cliente
 * activo con el mismo teléfono, muestre selector explícito al admin — este
 * servicio NO adivina cuál usar.
 */
export async function convertirAOrden(
  solicitudId: string,
  ordenData: Record<string, unknown>,
  clienteConversion?: ClienteConversion,
): Promise<string> {
  const solicitudRef = doc(db, COL, solicitudId);
  const existente = await getDoc(solicitudRef);
  if (!existente.exists()) throw new Error('La solicitud ya no existe.');
  const dataExistente = existente.data();
  if (dataExistente.ordenId) {
    if (clienteConversion?.tipo === 'crear') await completarCarteraAlta(clienteConversion.telefonoNormalizado);
    return dataExistente.ordenId as string;
  }
  if (dataExistente.estado === 'rechazada' || dataExistente.estado === 'convertida') {
    throw new Error(
      `La solicitud no puede convertirse (estado actual: ${dataExistente.estado}).`,
    );
  }

  // Validaciones fail-fast del payload cliente ANTES de reservar contador.
  if (clienteConversion?.tipo === 'existente') {
    if (!clienteConversion.clienteId) {
      throw new Error('clienteId requerido para vincular cliente existente.');
    }
  } else if (clienteConversion?.tipo === 'crear') {
    if (
      !clienteConversion.telefonoNormalizado ||
      clienteConversion.telefonoNormalizado.length !== 10
    ) {
      throw new Error('Teléfono inválido: se requiere un número RD de 10 dígitos ya normalizado.');
    }
    if (!clienteConversion.nombre?.trim()) {
      throw new Error('Nombre requerido para crear cliente nuevo desde la solicitud.');
    }
  }

  // Para clientes existentes, completar cartera antes de convertir.
  if (clienteConversion?.tipo === 'existente') await completarCarteraAlta(clienteConversion.clienteId);

  // El contador conserva su servicio central. Un intento concurrente puede reservar
  // un número sin usar; nunca se reutiliza ni se crea una segunda orden.
  const numero = await siguienteNumeroOrden();
  const ordenRef = doc(collection(db, 'ordenes_servicio'));
  const ordenIdResultado = await runTransaction(db, async tx => {
    const solicitud = await tx.get(solicitudRef);
    if (!solicitud.exists()) throw new Error('La solicitud ya no existe.');
    const data = solicitud.data();
    if (data.ordenId) return data.ordenId as string;
    if (data.estado === 'rechazada' || data.estado === 'convertida') {
      throw new Error(
        `La solicitud no puede convertirse (estado actual: ${data.estado}).`,
      );
    }

    // === Reads del cliente (ANTES de cualquier write, requisito de tx) ===
    let clienteRefResuelto: ReturnType<typeof doc> | null = null;
    let clienteExistenteData: Record<string, unknown> | undefined;
    let clienteExistenteSnap = false;
    let clienteIdFinal: string | undefined;

    if (clienteConversion?.tipo === 'existente') {
      clienteRefResuelto = doc(db, 'clientes', clienteConversion.clienteId);
      const snap = await tx.get(clienteRefResuelto);
      if (!snap.exists()) {
        throw new Error(
          'El cliente vinculado ya no existe. Refrescá la solicitud y elegí otro cliente.',
        );
      }
      clienteExistenteSnap = true;
      clienteExistenteData = snap.data();
      clienteIdFinal = clienteConversion.clienteId;
    } else if (clienteConversion?.tipo === 'crear') {
      clienteRefResuelto = doc(db, 'clientes', clienteConversion.telefonoNormalizado);
      const snap = await tx.get(clienteRefResuelto);
      clienteExistenteSnap = snap.exists();
      clienteExistenteData = clienteExistenteSnap ? snap.data() : undefined;
      clienteIdFinal = clienteConversion.telefonoNormalizado;
    } else if (typeof ordenData.clienteId === 'string' && ordenData.clienteId) {
      clienteIdFinal = ordenData.clienteId;
    }

    // === Writes ===
    // Cliente primero (si toca crear/mergear en la misma tx).
    if (clienteConversion?.tipo === 'crear' && clienteRefResuelto) {
      const c = clienteConversion;
      if (clienteExistenteSnap && clienteExistenteData) {
        // Preservar: NO sobrescribir campos no vacíos. Solo agregamos lo
        // que falta. Esto cubre el caso "dos operadores convierten al mismo
        // tiempo": el segundo halla el doc creado por el primero y NO le
        // pisa el nombre/dirección.
        const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
        if (c.nombre && !clienteExistenteData.nombre) updates.nombre = c.nombre;
        if (c.email && !clienteExistenteData.email) updates.email = c.email;
        if (c.direccion && !clienteExistenteData.direccion) updates.direccion = c.direccion;
        if (c.referenciaDireccion && !clienteExistenteData.referenciaDireccion) {
          updates.referenciaDireccion = c.referenciaDireccion;
        }
        if (typeof c.lat === 'number' && clienteExistenteData.lat == null) updates.lat = c.lat;
        if (typeof c.lng === 'number' && clienteExistenteData.lng == null) updates.lng = c.lng;
        tx.update(clienteRefResuelto, updates);
      } else {
        const payload: Record<string, unknown> = {
          nombre: c.nombre,
          telefono: c.telefonoOriginal || c.telefonoNormalizado,
          telefonoNormalizado: c.telefonoNormalizado,
          origen: 'solicitud_formulario',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        if (c.email) payload.email = c.email;
        if (c.direccion) payload.direccion = c.direccion;
        if (c.referenciaDireccion) payload.referenciaDireccion = c.referenciaDireccion;
        if (typeof c.lat === 'number') payload.lat = c.lat;
        if (typeof c.lng === 'number') payload.lng = c.lng;
        const payloadLimpio = stripUndefinedProfundo(payload) as Record<string, unknown>;
        tx.set(clienteRefResuelto, payloadLimpio);
      }
    }

    const ahora = Timestamp.now();
    const ordenBase: Record<string, unknown> = { ...ordenData };
    if (clienteIdFinal) ordenBase.clienteId = clienteIdFinal;
    // Strip PROFUNDO de undefined (Firestore los rechaza en cualquier nivel;
    // metadatosCita anidado puede traer undefined desde el caller cuando
    // arma con ternarios sin filtrar).
    const ordenLimpia = stripUndefinedProfundo(ordenBase) as Record<string, unknown>;
    tx.set(ordenRef, {
      ...ordenLimpia,
      numero,
      fase: 'nuevo_lead', estadoSimple: 'pendiente', estado: 'activo',
      historialFases: [{ fase: 'nuevo_lead', timestamp: ahora, usuario: 'Sistema', nota: 'Creada desde solicitud de formulario' }],
      createdAt: ahora, updatedAt: ahora,
    });
    tx.update(solicitudRef, { estado: 'convertida', ordenId: ordenRef.id, updatedAt: serverTimestamp() });
    return ordenRef.id;
  });
  if (clienteConversion?.tipo === 'crear') await completarCarteraAlta(clienteConversion.telefonoNormalizado);
  return ordenIdResultado;
}

export async function subirArchivoSolicitud(file: Blob, formularioId: string, campoId: string): Promise<string> {
  return subirArchivoPublicoSeguro(file, 'solicitud', { formularioId, campoId });
}

export async function eliminarSolicitud(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** Listener de solicitudes en tiempo real para el panel admin */
export function onSolicitudesChange(
  callback: (solicitudes: SolicitudServicio[]) => void
): () => void {
  const q = query(collection(db, COL));
  return onSnapshot(q, (snap) => {
    const solicitudes = snap.docs.map(d =>
      parseSolicitud(d.id, d.data() as Record<string, unknown>)
    );
    solicitudes.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });
    callback(solicitudes);
  });
}
