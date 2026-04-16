import {
  collection, addDoc, updateDoc, getDoc, getDocs, doc,
  query, orderBy, where, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { EmpresaAliada } from '../types/formularios';

const COL = 'empresas_aliadas';

function parseEmpresa(id: string, data: Record<string, unknown>): EmpresaAliada {
  return {
    id,
    nombre: (data.nombre as string) || '',
    logoUrl: (data.logoUrl as string) || '',
    contactoNombre: (data.contactoNombre as string) || '',
    contactoTelefono: (data.contactoTelefono as string) || '',
    contactoEmail: (data.contactoEmail as string) || '',
    activa: data.activa !== false,
    createdAt: data.createdAt as EmpresaAliada['createdAt'],
    updatedAt: data.updatedAt as EmpresaAliada['updatedAt'],
  };
}

export async function crearEmpresa(
  data: Omit<EmpresaAliada, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarEmpresa(
  id: string,
  data: Partial<EmpresaAliada>
): Promise<void> {
  const { id: _id, createdAt: _ca, ...rest } = data as Record<string, unknown>;
  await updateDoc(doc(db, COL, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function obtenerEmpresa(id: string): Promise<EmpresaAliada | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return parseEmpresa(snap.id, snap.data() as Record<string, unknown>);
}

export async function listarEmpresas(soloActivas?: boolean): Promise<EmpresaAliada[]> {
  let q = query(collection(db, COL), orderBy('nombre'));
  if (soloActivas) {
    q = query(collection(db, COL), where('activa', '==', true), orderBy('nombre'));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => parseEmpresa(d.id, d.data() as Record<string, unknown>));
}

export async function eliminarEmpresa(id: string): Promise<void> {
  // Soft delete
  await updateDoc(doc(db, COL, id), {
    activa: false,
    updatedAt: serverTimestamp(),
  });
}

export async function subirLogoEmpresa(file: File, empresaId: string): Promise<string> {
  const path = `empresas/${empresaId}/logo.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  return await getDownloadURL(ref);
}
