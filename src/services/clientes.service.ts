import { collection, query, where, getDocs, doc, setDoc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cliente, DireccionCliente } from '../types';

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

/**
 * Actualiza datos básicos del cliente (ficha global). Strip de undefined para Firestore.
 */
export async function actualizarCliente(
  clienteId: string,
  cambios: Partial<Pick<Cliente, 'nombre' | 'email' | 'direccion' | 'referenciaDireccion' | 'lat' | 'lng' | 'sector' | 'ciudad' | 'zona'>>,
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
  Object.entries(cambios).forEach(([k, v]) => {
    if (v === undefined) return;
    updates[k] = typeof v === 'string' ? v.trim() : v;
  });
  await updateDoc(doc(db, 'clientes', clienteId), updates);
}

function genDireccionId(): string {
  return `dir_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/** Agrega una dirección alternativa al cliente. Retorna el id de la nueva dirección. */
export async function agregarDireccionCliente(
  clienteId: string,
  data: Omit<DireccionCliente, 'id'>,
): Promise<string> {
  const ref = doc(db, 'clientes', clienteId);
  const snap = await getDoc(ref);
  const cliente = snap.data() as Partial<Cliente> | undefined;
  const direcciones: DireccionCliente[] = Array.isArray(cliente?.direcciones)
    ? (cliente!.direcciones as DireccionCliente[])
    : [];
  const nueva: DireccionCliente = { id: genDireccionId(), ...data };
  // Strip undefined
  const nuevaLimpia = Object.fromEntries(Object.entries(nueva).filter(([, v]) => v !== undefined)) as DireccionCliente;
  await updateDoc(ref, {
    direcciones: [...direcciones, nuevaLimpia],
    updatedAt: Timestamp.now(),
  });
  return nueva.id;
}

/** Actualiza una dirección alternativa del cliente. */
export async function actualizarDireccionCliente(
  clienteId: string,
  direccionId: string,
  cambios: Partial<Omit<DireccionCliente, 'id'>>,
): Promise<void> {
  const ref = doc(db, 'clientes', clienteId);
  const snap = await getDoc(ref);
  const cliente = snap.data() as Partial<Cliente> | undefined;
  const direcciones: DireccionCliente[] = Array.isArray(cliente?.direcciones)
    ? (cliente!.direcciones as DireccionCliente[])
    : [];
  const actualizadas = direcciones.map(d => {
    if (d.id !== direccionId) return d;
    const merged: Record<string, unknown> = { ...d };
    Object.entries(cambios).forEach(([k, v]) => {
      if (v === undefined) return;
      merged[k] = typeof v === 'string' ? v.trim() : v;
    });
    return merged as unknown as DireccionCliente;
  });
  await updateDoc(ref, {
    direcciones: actualizadas,
    updatedAt: Timestamp.now(),
  });
}

/** Elimina una dirección alternativa del cliente. */
export async function eliminarDireccionCliente(
  clienteId: string,
  direccionId: string,
): Promise<void> {
  const ref = doc(db, 'clientes', clienteId);
  const snap = await getDoc(ref);
  const cliente = snap.data() as Partial<Cliente> | undefined;
  const direcciones: DireccionCliente[] = Array.isArray(cliente?.direcciones)
    ? (cliente!.direcciones as DireccionCliente[])
    : [];
  const filtradas = direcciones.filter(d => d.id !== direccionId);
  await updateDoc(ref, {
    direcciones: filtradas,
    updatedAt: Timestamp.now(),
  });
}
