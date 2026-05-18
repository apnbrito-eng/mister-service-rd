import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { AvanceEmpleado, Rol } from '../types';
import { calcularQuincenaActual } from '../utils/comisiones';

const COL = 'avances';

function parseAvance(id: string, raw: Record<string, unknown>): AvanceEmpleado {
  return {
    id,
    personalId: (raw.personalId as string) || '',
    personalNombre: (raw.personalNombre as string) || '',
    personalRol: (raw.personalRol as Rol) || undefined,
    monto: Number(raw.monto) || 0,
    fecha: (raw.fecha as { toDate?: () => Date } | undefined)?.toDate?.() || new Date(),
    motivo: (raw.motivo as string) || '',
    metodoPago: (raw.metodoPago as 'efectivo' | 'transferencia' | 'tarjeta') || undefined,
    bancoDestino: (raw.bancoDestino as string) || undefined,
    quincenaAsignada: (raw.quincenaAsignada as string) || '',
    descontado: (raw.descontado as boolean) || false,
    liquidacionId: (raw.liquidacionId as string) || undefined,
    liquidacionFechaDescuento: (raw.liquidacionFechaDescuento as { toDate?: () => Date } | undefined)?.toDate?.(),
    creadoPorId: (raw.creadoPorId as string) || '',
    creadoPorNombre: (raw.creadoPorNombre as string) || '',
    notas: (raw.notas as string) || undefined,
    createdAt: (raw.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() || new Date(),
    updatedAt: (raw.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.(),
  };
}

/** Suscripción en tiempo real a avances. */
export function suscribirAvances(callback: (avances: AvanceEmpleado[]) => void): () => void {
  // @safe-orderby: SPRINT-188 — COL = 'avances' (const arriba). `createdAt` se persiste en todo addDoc de avance (parseAvance lo rehidrata como required raíz).
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => parseAvance(d.id, d.data()));
    callback(items);
  });
}

/** Avances pendientes de un empleado (no descontados aún). */
export async function obtenerAvancesPendientesDePersonal(personalId: string): Promise<AvanceEmpleado[]> {
  const q = query(
    collection(db, COL),
    where('personalId', '==', personalId),
    where('descontado', '==', false),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => parseAvance(d.id, d.data()));
}

/** Avances pendientes de una quincena (para descontar al liquidar nómina). */
export async function obtenerAvancesPendientesDeQuincena(quincena: string): Promise<AvanceEmpleado[]> {
  const q = query(
    collection(db, COL),
    where('quincenaAsignada', '==', quincena),
    where('descontado', '==', false),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => parseAvance(d.id, d.data()));
}

export async function crearAvance(data: Omit<AvanceEmpleado, 'id' | 'createdAt' | 'descontado'>): Promise<string> {
  const payload: Record<string, unknown> = {
    personalId: data.personalId,
    personalNombre: data.personalNombre.trim(),
    monto: Number(data.monto) || 0,
    fecha: Timestamp.fromDate(data.fecha),
    motivo: data.motivo.trim(),
    quincenaAsignada: data.quincenaAsignada || calcularQuincenaActual(data.fecha),
    descontado: false,
    creadoPorId: data.creadoPorId,
    creadoPorNombre: data.creadoPorNombre,
    createdAt: Timestamp.now(),
  };
  if (data.personalRol) payload.personalRol = data.personalRol;
  if (data.metodoPago) payload.metodoPago = data.metodoPago;
  if (data.bancoDestino) payload.bancoDestino = data.bancoDestino;
  if (data.notas) payload.notas = data.notas.trim();
  const ref = await addDoc(collection(db, COL), payload);
  return ref.id;
}

export async function actualizarAvance(
  id: string,
  cambios: Partial<Omit<AvanceEmpleado, 'id' | 'createdAt'>>,
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: Timestamp.now() };
  Object.entries(cambios).forEach(([k, v]) => {
    if (v === undefined) return;
    if (v instanceof Date) payload[k] = Timestamp.fromDate(v);
    else if (typeof v === 'string') payload[k] = v.trim();
    else payload[k] = v;
  });
  await updateDoc(doc(db, COL, id), payload);
}

export async function eliminarAvance(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** Marca un avance como descontado al generar una liquidación. */
export async function marcarAvanceDescontado(
  id: string,
  liquidacionId: string,
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    descontado: true,
    liquidacionId,
    liquidacionFechaDescuento: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}
