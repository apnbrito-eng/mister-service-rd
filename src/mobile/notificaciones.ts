import { auth } from '../firebase/config';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { equipoApi } from '../services/equipoApi';
let dispositivoId: string | null = null;
let owner: string | null = null;
let listener: Awaited<ReturnType<typeof FirebaseMessaging.addListener>> | null = null;
export async function activarNotificacionesMoviles() {
  if (!Capacitor.isNativePlatform()) throw new Error('Instala la app.');
  const permiso = await FirebaseMessaging.requestPermissions();
  if (permiso.receive !== 'granted') throw new Error('Permiso de notificaciones no concedido.');
  owner = auth.currentUser?.uid || null;
  if (!owner) throw new Error('Inicia sesión.');
  const { token } = await FirebaseMessaging.getToken();
  const result = await equipoApi<{ dispositivoId: string }>('/api/movil/estado', { accion: 'dispositivo', token, plataforma: Capacitor.getPlatform() });
  dispositivoId = result.dispositivoId;
  if (!listener) listener = await FirebaseMessaging.addListener('tokenReceived', async event => {
    if (!owner || auth.currentUser?.uid !== owner) return;
    try { const result = await equipoApi<{ dispositivoId: string }>('/api/movil/estado', { accion: 'dispositivo', token: event.token, plataforma: Capacitor.getPlatform() }); dispositivoId = result.dispositivoId; } catch { /* Se reintenta al activar avisos. */ }
  });
}
export async function desactivarNotificacionesMoviles() {
  if (!Capacitor.isNativePlatform()) return;
  const id = dispositivoId; dispositivoId = null; owner = null;
  await listener?.remove(); listener = null;
  try { if (id) await equipoApi('/api/movil/estado', { accion: 'desregistrar', dispositivoId: id }); }
  finally { await FirebaseMessaging.deleteToken(); }
}
