import {
  collection, addDoc, updateDoc, getDoc, getDocs, doc,
  query, orderBy, where, serverTimestamp, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { SolicitudServicio, EstadoSolicitud } from '../types/formularios';
import { siguienteNumeroOrden } from './contadores.service';

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
  const ref = await addDoc(collection(db, COL), {
    ...data,
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
  let q = query(collection(db, COL), orderBy('createdAt', 'desc'));

  if (filtros?.estado && filtros?.empresaId) {
    q = query(
      collection(db, COL),
      where('estado', '==', filtros.estado),
      where('empresaId', '==', filtros.empresaId),
      orderBy('createdAt', 'desc')
    );
  } else if (filtros?.estado) {
    q = query(
      collection(db, COL),
      where('estado', '==', filtros.estado),
      orderBy('createdAt', 'desc')
    );
  } else if (filtros?.empresaId) {
    q = query(
      collection(db, COL),
      where('empresaId', '==', filtros.empresaId),
      orderBy('createdAt', 'desc')
    );
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => parseSolicitud(d.id, d.data() as Record<string, unknown>));
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
  const timestamp = Date.now();
  const ext = file.name.split('.').pop() || 'bin';
  const path = `solicitudes/${solicitudId}/${campoId}/${timestamp}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  return await getDownloadURL(ref);
}

/** Listener de solicitudes en tiempo real para el panel admin */
export function onSolicitudesChange(
  callback: (solicitudes: SolicitudServicio[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const solicitudes = snap.docs.map(d =>
      parseSolicitud(d.id, d.data() as Record<string, unknown>)
    );
    callback(solicitudes);
  });
}
