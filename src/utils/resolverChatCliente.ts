import { collection, getDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizarTelefono } from '../services/clientes.service';
import type { Cliente } from '../types';
export function numeroWhatsAppCliente(telefono: string): string | null {
  const numero = normalizarTelefono(telefono);
  return numero.length === 10 ? `1${numero}` : null;
}
async function conversacionesDirectas(numero: string) {
  const docs = await Promise.all([numero, numero.slice(1)].map(id => getDoc(doc(db, 'whatsapp_conversaciones', id))));
  const existentes = docs.filter(d => d.exists());
  if (existentes.length > 1) throw new Error('Hay dos conversaciones para ese teléfono. Revisa la asociación antes de abrirla.');
  return existentes;
}
/** Consulta vínculos exactos; abrir una ficha nunca crea una conversación. */
export async function resolverChatCliente(cliente: Pick<Cliente, 'id' | 'telefono'>): Promise<string> {
  const numero = numeroWhatsAppCliente(cliente.telefono);
  if (!numero) throw new Error('El teléfono del cliente no es compatible con este canal. Revisa el número.');
  const encontrados = await getDocs(query(collection(db, 'whatsapp_conversaciones'), where('clienteId', '==', cliente.id)));
  const validos = encontrados.docs.filter(d => /^\d{7,15}$/.test(d.id));
  const directos = await conversacionesDirectas(numero);
  for (const directo of directos) {
    if (directo.data()?.clienteId && directo.data()?.clienteId !== cliente.id) throw new Error('La conversación pertenece a otro cliente. Revisa la asociación.');
  }
  const exactos = validos.filter(d => d.id === numero || d.id === numero.slice(1));
  if (exactos.length > 1) throw new Error('Hay dos conversaciones para ese cliente. Revisa la asociación.');
  if (exactos[0]) return exactos[0].id;
  if (validos.length) throw new Error('La conversación vinculada tiene otro teléfono. Revisa la asociación antes de abrirla.');
  return directos[0]?.id || numero;
}

export interface ContactoChatCliente { telefono?: string; nombre?: string; clienteId?: string }
export interface DestinoChatCliente { waId: string; telefono: string; nombre?: string; clienteId?: string }
/** Resuelve contactos sin crear cuentas, clientes, vínculos ni mensajes. */
export async function resolverChatContacto(contacto: ContactoChatCliente): Promise<DestinoChatCliente> {
  const numero = numeroWhatsAppCliente(contacto.telefono || '');
  if (!numero) throw new Error('El teléfono del cliente no es compatible con este canal. Revisa el número.');
  let cliente: { id: string; telefono: string; nombre?: string } | undefined;
  if (contacto.clienteId) {
    if (contacto.clienteId.includes('/')) throw new Error('La identidad del cliente no es válida.');
    const ref = await getDoc(doc(db, 'clientes', contacto.clienteId));
    if (!ref.exists() || ref.data().eliminado === true) throw new Error('No se encontró una ficha activa del cliente. Revisa la asociación.');
    const data = ref.data();
    cliente = { id: ref.id, telefono: String(data.telefono || ''), nombre: typeof data.nombre === 'string' ? data.nombre : undefined };
  } else {
    const encontrados = await getDocs(query(collection(db, 'clientes'), where('telefonoNormalizado', '==', numero.slice(1))));
    const activos = encontrados.docs.filter(d => d.data().eliminado !== true);
    if (activos.length > 1) throw new Error('Hay varias fichas con ese teléfono. Abre el chat desde la ficha correcta.');
    const unico = activos[0];
    if (unico) {
      const data = unico.data();
      cliente = { id: unico.id, telefono: String(data.telefono || ''), nombre: typeof data.nombre === 'string' ? data.nombre : undefined };
    }
  }
  if (cliente) {
    if (numeroWhatsAppCliente(cliente.telefono) !== numero) throw new Error('El teléfono no coincide con la ficha del cliente. Revisa la asociación.');
    return { waId: await resolverChatCliente(cliente), telefono: cliente.telefono, nombre: cliente.nombre || contacto.nombre, clienteId: cliente.id };
  }
  // Contacto nuevo: no fabricar una ficha ni reasignar una conversación existente.
  for (const conversacion of await conversacionesDirectas(numero)) {
    const waId = conversacion.id;
    const vinculo = conversacion.data()?.clienteId;
    if (vinculo) {
      if (typeof vinculo !== 'string' || vinculo.includes('/')) throw new Error('La asociación de la conversación no es válida.');
      const ficha = await getDoc(doc(db, 'clientes', vinculo));
      if (!ficha.exists() || ficha.data().eliminado === true || numeroWhatsAppCliente(String(ficha.data().telefono || '')) !== numero) throw new Error('La conversación tiene una asociación incompatible. Revisa la ficha del cliente.');
      return { waId, clienteId: ficha.id, telefono: String(ficha.data().telefono), nombre: typeof ficha.data().nombre === 'string' ? ficha.data().nombre : contacto.nombre };
    }
    return { waId, telefono: contacto.telefono || numero, nombre: contacto.nombre };
  }
  return { waId: numero, telefono: contacto.telefono || numero, nombre: contacto.nombre };
}
