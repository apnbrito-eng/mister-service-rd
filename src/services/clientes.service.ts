import { collection, query, where, getDocs, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cliente } from '../types';

/** Normaliza teléfono a 10 dígitos locales de RD */
export function normalizarTelefono(tel: string): string {
  const soloDigitos = tel.replace(/\D/g, '');
  if (soloDigitos.length === 11 && soloDigitos.startsWith('1')) {
    return soloDigitos.substring(1);
  }
  return soloDigitos.slice(-10);
}

/** Formatea para mostrar: (809) 555-1234 */
export function formatearTelefono(tel: string): string {
  const norm = normalizarTelefono(tel);
  if (norm.length === 10) {
    return `(${norm.slice(0, 3)}) ${norm.slice(3, 6)}-${norm.slice(6)}`;
  }
  return tel;
}

/** Busca cliente por teléfono normalizado. Retorna id si existe, null si no. */
export async function buscarClientePorTelefono(telefono: string): Promise<{ id: string; data: Cliente } | null> {
  const telNorm = normalizarTelefono(telefono);
  if (telNorm.length < 7) return null;

  const q = query(
    collection(db, 'clientes'),
    where('telefonoNormalizado', '==', telNorm)
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    const d = snap.docs[0];
    return {
      id: d.id,
      data: { id: d.id, ...d.data() } as Cliente,
    };
  }
  return null;
}

/** Busca o crea cliente. NUNCA duplica por teléfono. Retorna clienteId. */
export async function buscarOCrearCliente(
  telefono: string,
  datos: {
    nombre: string;
    email?: string;
    direccion?: string;
    referenciaDireccion?: string;
    lat?: number;
    lng?: number;
  }
): Promise<string> {
  const telNorm = normalizarTelefono(telefono);

  // Buscar existente
  const existente = await buscarClientePorTelefono(telefono);
  if (existente) {
    // Actualizar datos que vengan nuevos (sin sobreescribir vacíos)
    const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (datos.nombre) updates.nombre = datos.nombre;
    if (datos.email) updates.email = datos.email;
    if (datos.direccion) updates.direccion = datos.direccion;
    if (datos.referenciaDireccion) updates.referenciaDireccion = datos.referenciaDireccion;
    if (datos.lat) updates.lat = datos.lat;
    if (datos.lng) updates.lng = datos.lng;
    await updateDoc(doc(db, 'clientes', existente.id), updates);
    return existente.id;
  }

  // Crear nuevo con teléfono normalizado como ID
  const clienteId = telNorm;
  await setDoc(doc(db, 'clientes', clienteId), {
    nombre: datos.nombre,
    telefono: telefono,
    telefonoNormalizado: telNorm,
    email: datos.email || '',
    direccion: datos.direccion || '',
    referenciaDireccion: datos.referenciaDireccion || '',
    lat: datos.lat || null,
    lng: datos.lng || null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return clienteId;
}

/** Valida que el teléfono no esté usado por otro cliente */
export async function validarClienteUnico(
  telefono: string,
  clienteIdActual?: string
): Promise<boolean> {
  const existente = await buscarClientePorTelefono(telefono);
  if (!existente) return true;
  return existente.id === clienteIdActual;
}
