import { auth } from '../firebase/config';
import { enviarTexto } from './whatsapp.service';
export interface MensajePendiente { id: string; uid: string; waId: string; texto: string; fecha: number; error?: string; }
const evento = 'cola-whatsapp-cambio';
const clave = (uid: string) => `mr-cola-whatsapp-v1:${uid}`;
const notificar = () => window.dispatchEvent(new Event(evento));
export function leerPendientes(uid: string): MensajePendiente[] {
  const items: MensajePendiente[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(clave(uid) + ':')) continue;
    try {
      const m = JSON.parse(localStorage.getItem(key) || 'null');
      if (m?.uid === uid && typeof m.texto === 'string' && typeof m.id === 'string' && /^\d{7,16}$/.test(m.waId) && Number.isFinite(m.fecha)) items.push(m);
    } catch { /* A corrupt entry must not block the remaining queue. */ }
  }
  return items.sort((a, b) => a.fecha - b.fecha || a.id.localeCompare(b.id));
}
function guardar(m: MensajePendiente) { localStorage.setItem(clave(m.uid) + ':' + m.id, JSON.stringify(m)); notificar(); }
export function encolarMensaje(uid: string, waId: string, texto: string): void {
  if (auth.currentUser?.uid !== uid) throw new Error('Inicia sesión antes de enviar.');
  if (!/^\d{7,16}$/.test(waId) || !texto.trim()) throw new Error('Mensaje inválido.');
  if (leerPendientes(uid).length >= 100) throw new Error('Revisa tus mensajes pendientes antes de añadir más.');
  guardar({ id: crypto.randomUUID().replace(/-/g, ''), uid, waId, texto, fecha: Date.now() });
}
export function descartarPendiente(uid: string, id: string) { localStorage.removeItem(clave(uid) + ':' + id); notificar(); }
export function escucharPendientes(callback: () => void) {
  window.addEventListener(evento, callback); window.addEventListener('storage', callback);
  return () => { window.removeEventListener(evento, callback); window.removeEventListener('storage', callback); };
}
const trabajando = new Set<string>();
/** Stable IDs make network retries safe even if the first response was lost. */
export async function procesarPendientes(uid: string) {
  if (trabajando.has(uid) || navigator.onLine === false || auth.currentUser?.uid !== uid) return;
  trabajando.add(uid);
  try {
    for (const m of leerPendientes(uid).filter(m => !m.error)) {
      if (auth.currentUser?.uid !== uid || !navigator.onLine) break;
      try {
        const r = await enviarTexto(m.waId, m.texto, { tempId: m.id });
        if ('ok' in r && r.ok) descartarPendiente(uid, m.id);
        else { const error = 'error' in r ? r.error : 'No se pudo enviar.'; if (localStorage.getItem(clave(uid) + ':' + m.id)) guardar({ ...m, error }); }
      } catch { break; } // Offline/uncertain response: keep same ID and retry on reconnection.
    }
  } catch { /* Storage temporarily unavailable; retain the queue for the next attempt. */ } finally { trabajando.delete(uid); }
}
