import { collection, getDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizarTelefono } from '../services/clientes.service';
import type { Cliente } from '../types';
export function numeroWhatsAppCliente(telefono: string): string | null {
  const numero = normalizarTelefono(telefono);
  return numero.length === 10 ? `1${numero}` : null;
}
/** Consulta vínculos exactos; abrir una ficha nunca crea una conversación. */
export async function resolverChatCliente(cliente: Cliente): Promise<string> {
  const numero = numeroWhatsAppCliente(cliente.telefono);
  if (!numero) throw new Error('El teléfono del cliente no es compatible con este canal. Revisa el número.');
  const encontrados = await getDocs(query(collection(db, 'whatsapp_conversaciones'), where('clienteId', '==', cliente.id)));
  const validos = encontrados.docs.filter(d => /^\d{7,15}$/.test(d.id));
  const exacto = validos.find(d => d.id === numero || d.id === numero.slice(1));
  if (exacto) return exacto.id;
  if (validos.length) throw new Error('La conversación vinculada tiene otro teléfono. Revisa la asociación antes de abrirla.');
  const directo = await getDoc(doc(db, 'whatsapp_conversaciones', numero));
  if (directo.exists() && directo.data().clienteId && directo.data().clienteId !== cliente.id) throw new Error('La conversación pertenece a otro cliente. Revisa la asociación.');
  return numero;
}
