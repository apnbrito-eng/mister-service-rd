import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Banco, BANCOS_RD_SEED } from '../types';

const COL = 'bancos';

function parseBanco(id: string, raw: Record<string, unknown>): Banco {
  const createdAtRaw = raw.createdAt as { toDate?: () => Date } | undefined;
  const updatedAtRaw = raw.updatedAt as { toDate?: () => Date } | undefined;
  return {
    id,
    nombre: (raw.nombre as string) || '',
    activo: raw.activo !== false,
    orden: typeof raw.orden === 'number' ? raw.orden : undefined,
    createdAt: createdAtRaw?.toDate?.() || new Date(),
    updatedAt: updatedAtRaw?.toDate?.(),
  };
}

/**
 * Suscripción en tiempo real a la lista de bancos ordenados por `orden` → `nombre`.
 * Devuelve función de unsubscribe.
 */
export function suscribirBancos(callback: (bancos: Banco[]) => void) {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => parseBanco(d.id, d.data()));
    // Ordenamos en cliente: primero por `orden` si existe, luego por nombre
    items.sort((a, b) => {
      const oa = a.orden ?? 9999;
      const ob = b.orden ?? 9999;
      if (oa !== ob) return oa - ob;
      return a.nombre.localeCompare(b.nombre);
    });
    callback(items);
  });
}

export async function crearBanco(nombre: string, orden?: number): Promise<string> {
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error('El nombre del banco es obligatorio');
  const payload: Record<string, unknown> = {
    nombre: nombreLimpio,
    activo: true,
    createdAt: Timestamp.now(),
  };
  if (typeof orden === 'number') payload.orden = orden;
  const ref = await addDoc(collection(db, COL), payload);
  return ref.id;
}

export async function actualizarBanco(
  id: string,
  cambios: Partial<Pick<Banco, 'nombre' | 'activo' | 'orden'>>,
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (cambios.nombre !== undefined) payload.nombre = cambios.nombre.trim();
  if (cambios.activo !== undefined) payload.activo = cambios.activo;
  if (cambios.orden !== undefined) payload.orden = cambios.orden;
  await updateDoc(doc(db, COL, id), payload);
}

export async function eliminarBanco(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/**
 * Si la colección está vacía, inserta los bancos comunes de RD.
 * Idempotente: solo crea si no hay docs.
 */
export async function seedBancosSiVacio(): Promise<number> {
  const snap = await getDocs(collection(db, COL));
  if (!snap.empty) return 0;
  const batch = writeBatch(db);
  BANCOS_RD_SEED.forEach((nombre, idx) => {
    const ref = doc(collection(db, COL));
    batch.set(ref, {
      nombre,
      activo: true,
      orden: idx + 1,
      createdAt: Timestamp.now(),
    });
  });
  await batch.commit();
  return BANCOS_RD_SEED.length;
}
