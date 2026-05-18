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
import { Banco, BANCOS_RD_SEED, BancoSeed } from '../types';

const COL = 'bancos';

function parseBanco(id: string, raw: Record<string, unknown>): Banco {
  const createdAtRaw = raw.createdAt as { toDate?: () => Date } | undefined;
  const updatedAtRaw = raw.updatedAt as { toDate?: () => Date } | undefined;
  return {
    id,
    nombre: (raw.nombre as string) || '',
    activo: raw.activo !== false,
    orden: typeof raw.orden === 'number' ? raw.orden : undefined,
    numeroCuenta: raw.numeroCuenta as string | undefined,
    tipoCuenta: raw.tipoCuenta as 'ahorro' | 'corriente' | undefined,
    titular: raw.titular as string | undefined,
    rnc: raw.rnc as string | undefined,
    cedula: raw.cedula as string | undefined,
    emailComprobante: raw.emailComprobante as string | undefined,
    createdAt: createdAtRaw?.toDate?.() || new Date(),
    updatedAt: updatedAtRaw?.toDate?.(),
  };
}

function seedToPayload(s: BancoSeed, orden: number): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nombre: s.nombre,
    activo: true,
    orden,
    numeroCuenta: s.numeroCuenta,
    tipoCuenta: s.tipoCuenta,
    titular: s.titular,
    createdAt: Timestamp.now(),
  };
  if (s.rnc) payload.rnc = s.rnc;
  if (s.cedula) payload.cedula = s.cedula;
  if (s.emailComprobante) payload.emailComprobante = s.emailComprobante;
  return payload;
}

/** Suscripción en tiempo real a la lista de bancos. */
export function suscribirBancos(callback: (bancos: Banco[]) => void) {
  // @safe-orderby: SPRINT-188 — COL = 'bancos' (const arriba). `nombre` es required en seedToPayload + UI de bancos lo exige siempre.
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => parseBanco(d.id, d.data()));
    items.sort((a, b) => {
      const oa = a.orden ?? 9999;
      const ob = b.orden ?? 9999;
      if (oa !== ob) return oa - ob;
      return a.nombre.localeCompare(b.nombre);
    });
    callback(items);
  });
}

export async function crearBanco(data: Partial<Banco> & { nombre: string }): Promise<string> {
  const payload: Record<string, unknown> = {
    nombre: data.nombre.trim(),
    activo: data.activo !== false,
    createdAt: Timestamp.now(),
  };
  if (typeof data.orden === 'number') payload.orden = data.orden;
  if (data.numeroCuenta) payload.numeroCuenta = data.numeroCuenta.trim();
  if (data.tipoCuenta) payload.tipoCuenta = data.tipoCuenta;
  if (data.titular) payload.titular = data.titular.trim();
  if (data.rnc) payload.rnc = data.rnc.trim();
  if (data.cedula) payload.cedula = data.cedula.trim();
  if (data.emailComprobante) payload.emailComprobante = data.emailComprobante.trim();
  const ref = await addDoc(collection(db, COL), payload);
  return ref.id;
}

export async function actualizarBanco(
  id: string,
  cambios: Partial<Omit<Banco, 'id' | 'createdAt'>>,
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: Timestamp.now() };
  Object.entries(cambios).forEach(([k, v]) => {
    if (v === undefined) return;
    // Strings se trimean
    payload[k] = typeof v === 'string' ? v.trim() : v;
  });
  await updateDoc(doc(db, COL, id), payload);
}

export async function eliminarBanco(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/**
 * Seed inicial: si la colección está vacía, inserta los bancos reales.
 * Idempotente.
 */
export async function seedBancosSiVacio(): Promise<number> {
  const snap = await getDocs(collection(db, COL));
  if (!snap.empty) return 0;
  const batch = writeBatch(db);
  BANCOS_RD_SEED.forEach((s, idx) => {
    const ref = doc(collection(db, COL));
    batch.set(ref, seedToPayload(s, idx + 1));
  });
  await batch.commit();
  return BANCOS_RD_SEED.length;
}

/**
 * Migración: reemplaza los bancos "genéricos" (los que no tienen `numeroCuenta`)
 * por los bancos reales. Solo corre si *todos* los bancos actuales son genéricos.
 * Si al menos uno ya tiene numeroCuenta, no hace nada.
 * Idempotente — segura de llamar múltiples veces.
 */
export async function migrarBancosGenericosAReales(): Promise<number> {
  const snap = await getDocs(collection(db, COL));
  if (snap.empty) {
    // No hay nada, seed normal
    return seedBancosSiVacio();
  }
  const todos = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  const algunoReal = todos.some(t => !!t.data.numeroCuenta);
  if (algunoReal) return 0; // Ya migrados

  // Borrar todos los genéricos y crear los reales
  const batch = writeBatch(db);
  todos.forEach(t => batch.delete(doc(db, COL, t.id)));
  BANCOS_RD_SEED.forEach((s, idx) => {
    const ref = doc(collection(db, COL));
    batch.set(ref, seedToPayload(s, idx + 1));
  });
  await batch.commit();
  return BANCOS_RD_SEED.length;
}
