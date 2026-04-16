import {
  collection, addDoc, updateDoc, getDoc, getDocs, doc,
  query, orderBy, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { FormularioServicio } from '../types/formularios';

const COL = 'formularios';

function parseFormulario(id: string, data: Record<string, unknown>): FormularioServicio {
  return {
    id,
    empresaId: (data.empresaId as string) || '',
    empresaNombre: (data.empresaNombre as string) || '',
    nombre: (data.nombre as string) || '',
    slug: (data.slug as string) || '',
    descripcion: (data.descripcion as string) || '',
    tipoServicio: (data.tipoServicio as FormularioServicio['tipoServicio']) || 'reparacion',
    camposEstandar: Array.isArray(data.camposEstandar)
      ? (data.camposEstandar as FormularioServicio['camposEstandar'])
      : [],
    camposPersonalizados: Array.isArray(data.camposPersonalizados)
      ? (data.camposPersonalizados as FormularioServicio['camposPersonalizados'])
      : [],
    activo: data.activo !== false,
    createdAt: data.createdAt as FormularioServicio['createdAt'],
    updatedAt: data.updatedAt as FormularioServicio['updatedAt'],
  };
}

/** Genera slug URL-friendly: "Innovacientro" + "Reparación Lavadoras" → "innovacientro-reparacion-lavadoras" */
export function generarSlug(empresaNombre: string, nombreFormulario: string): string {
  const raw = `${empresaNombre} ${nombreFormulario}`;
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '')   // quitar caracteres especiales
    .replace(/\s+/g, '-')           // espacios → guiones
    .replace(/-+/g, '-')            // múltiples guiones → uno
    .replace(/^-|-$/g, '');          // quitar guiones al inicio/final
}

export async function crearFormulario(
  data: Omit<FormularioServicio, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarFormulario(
  id: string,
  data: Partial<FormularioServicio>
): Promise<void> {
  const { id: _id, createdAt: _ca, ...rest } = data as Record<string, unknown>;
  await updateDoc(doc(db, COL, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function obtenerFormulario(id: string): Promise<FormularioServicio | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return parseFormulario(snap.id, snap.data() as Record<string, unknown>);
}

/** Obtiene formulario por slug — para la URL pública /formulario/:slug */
export async function obtenerFormularioPorSlug(slug: string): Promise<FormularioServicio | null> {
  const q = query(collection(db, COL), where('slug', '==', slug), where('activo', '==', true));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return parseFormulario(d.id, d.data() as Record<string, unknown>);
}

export async function listarFormularios(empresaId?: string): Promise<FormularioServicio[]> {
  let q = query(collection(db, COL), orderBy('updatedAt', 'desc'));
  if (empresaId) {
    q = query(collection(db, COL), where('empresaId', '==', empresaId), orderBy('updatedAt', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => parseFormulario(d.id, d.data() as Record<string, unknown>));
}

export async function toggleFormulario(id: string, activo: boolean): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    activo,
    updatedAt: serverTimestamp(),
  });
}
