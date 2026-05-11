import {
  collection, addDoc, updateDoc, deleteDoc, getDoc, getDocs, doc,
  query, where, serverTimestamp, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { SolicitudServicio, EstadoSolicitud } from '../types/formularios';
import { siguienteNumeroOrden } from './contadores.service';
import { validarDocumento } from '../utils/uploads';

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
  data: Omit<SolicitudServicio, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  // Firestore no acepta valores undefined — limpiarlos antes de guardar
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  const ref = await addDoc(collection(db, COL), {
    ...cleanData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
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
 * Convierte una solicitud en una orden de servicio.
 * Crea la orden en ordenes_servicio, actualiza la solicitud a estado 'convertida'.
 */
export async function convertirAOrden(
  solicitudId: string,
  ordenData: Record<string, unknown>
): Promise<string> {
  const numero = await siguienteNumeroOrden();
  const ahora = Timestamp.now();

  const ref = await addDoc(collection(db, 'ordenes_servicio'), {
    numero,
    ...ordenData,
    fase: 'nuevo_lead',
    estadoSimple: 'pendiente',
    estado: 'activo',
    historialFases: [{
      fase: 'nuevo_lead',
      timestamp: ahora,
      usuario: 'Sistema',
      nota: `Creada desde solicitud de formulario`,
    }],
    createdAt: ahora,
    updatedAt: ahora,
  });

  await updateDoc(doc(db, COL, solicitudId), {
    estado: 'convertida',
    ordenId: ref.id,
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function subirArchivoSolicitud(
  file: File,
  solicitudId: string,
  campoId: string
): Promise<string> {
  // SPRINT-137 (2026-05-11): validar tamaño + MIME antes de subir.
  // Defense in depth — Storage Rules es la segunda capa (SPRINT-138 pendiente).
  const validacion = validarDocumento(file);
  if (!validacion.ok) {
    throw new Error(validacion.error);
  }

  const timestamp = Date.now();
  const ext = file.name.split('.').pop() || 'bin';
  const path = `solicitudes/${solicitudId}/${campoId}/${timestamp}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  return await getDownloadURL(ref);
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
