import { obtenerAppCheckToken } from '../lib/appCheck';
import { auth } from '../firebase/config';
import type { CarteraEquipo } from '../types';

export async function gestionarCartera(payload: { clienteId: string; accion: 'asignar' | 'trasladar'; destino?: CarteraEquipo; motivo?: string; solicitudId?: string }): Promise<CarteraEquipo> {
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión para gestionar carteras.');
  const appCheck = await obtenerAppCheckToken();
  const response = await fetch('/api/clientes/cartera', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`, ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}) }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la cartera.');
  return data.equipo;
}

export async function completarCarteraAlta(clienteId: string): Promise<void> {
  try { await gestionarCartera({ clienteId, accion: 'asignar' }); }
  catch { throw new Error('El cliente quedó guardado, pero su cartera sigue pendiente. Reintenta el guardado antes de crear la orden.'); }
}

export async function leerHistorialCartera(clienteId: string) {
  const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
  const { db } = await import('../firebase/config');
  // @safe-orderby: solo cartera_historial, no clientes raíz; sus escritores api/_lib/carteraClientes.ts (alta/traslado) y scripts/migraciones/repartir-cartera.ts siempre guardan timestamp con FieldValue.serverTimestamp().
  const snap = await getDocs(query(collection(db, 'clientes', clienteId, 'cartera_historial'), orderBy('timestamp', 'desc'), limit(20)));
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Array<{ id: string; anteriorEquipo: CarteraEquipo | null; nuevoEquipo: CarteraEquipo; actorNombre: string; motivo: string }>;
}
