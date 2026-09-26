import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { equipoApi } from '../services/equipoApi';
import { esAppNativa } from './camara';
import { muestraValida, type MuestraGPS } from './politicas';
const gps = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
type Jornada = { id: string; expiraEn: number; activa: boolean };
type Estado = { activa: boolean; ultima?: MuestraGPS; error?: string; pendiente: boolean };
let jornada: Jornada | null = null, watcher: string | null = null;
let timer: ReturnType<typeof setInterval> | undefined, vencimiento: ReturnType<typeof setTimeout> | undefined;
let pendiente: MuestraGPS | undefined, enviando = false, ultimoIntento = 0, generacion = 0, iniciando = false;
let estado: Estado = { activa: false, pendiente: false };
const listeners = new Set<(s: Estado) => void>();
function emitir(update: Partial<Estado>) { estado = { ...estado, ...update }; listeners.forEach(fn => fn(estado)); }
export function observarJornada(fn: (s: Estado) => void) { listeners.add(fn); fn(estado); return () => { listeners.delete(fn); }; }
async function enviarPendiente() {
  if (!pendiente || !jornada || enviando || Date.now() - ultimoIntento < 60000) return;
  if (Date.now() >= jornada.expiraEn) { await detenerJornada(); return; }
  const sesion = jornada.id, muestra = pendiente;
  enviando = true; ultimoIntento = Date.now();
  try {
    await equipoApi('/api/movil/estado', { accion: 'ubicacion', jornadaId: sesion, muestra });
    if (jornada?.id === sesion && pendiente === muestra) pendiente = undefined;
    if (jornada?.id === sesion) emitir({ ultima: muestra, pendiente: !!pendiente, error: undefined });
  } catch (err) {
    if (jornada?.id !== sesion) return;
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403 || status === 409) await detenerJornada(false);
    else emitir({ pendiente: true, error: 'Sin sincronizar. Se reintentará al recuperar conexión.' });
  } finally { enviando = false; }
}
function detenerEnSegundoPlano() { void detenerJornada().catch(() => { /* El estado conserva el error y permite reintentar. */ }); }
export async function iniciarJornada() {
  if (!esAppNativa()) throw new Error('Instala la app para iniciar el seguimiento de jornada.');
  if (iniciando) throw new Error('La jornada se está iniciando.');
  if (watcher && estado.error) throw new Error('Finaliza la jornada pendiente antes de volver a iniciarla.');
  if (jornada) return;
  iniciando = true;
  try {
  const generation = ++generacion;
  const permiso = await LocalNotifications.requestPermissions();
  if (permiso.display !== 'granted') throw new Error('Activa las notificaciones para mostrar que la ubicación está en uso.');
  const result = await equipoApi<{ jornada: Jornada }>('/api/movil/estado', { accion: 'iniciar' });
  if (generation !== generacion) return;
  jornada = result.jornada; ultimoIntento = 0;
  try {
    const id = await gps.addWatcher({ backgroundTitle: 'Mister Service · Jornada activa', backgroundMessage: 'Ubicación compartida con la oficina. Finaliza tu jornada desde la app.', requestPermissions: true, stale: false, distanceFilter: 0 }, (location, error) => {
      if (generation !== generacion) return;
      if (error) { emitir({ error: 'No se pudo obtener ubicación. Revisa los permisos.', pendiente: !!pendiente }); return; }
      if (!location?.time) return;
      const muestra: MuestraGPS = { lat: location.latitude, lng: location.longitude, precision: location.accuracy, capturadaEn: location.time, simulada: location.simulated };
      if (!muestraValida(muestra) || muestra.simulada) { emitir({ error: 'No se recibió una ubicación válida.' }); return; }
      pendiente = muestra; emitir({ pendiente: true }); void enviarPendiente().catch(() => { /* Error visible en el estado de jornada. */ });
    });
    watcher = id;
    if (generation !== generacion) { await detenerJornada(false); return; }
    emitir({ activa: true, error: undefined });
    // Los temporizadores son ayuda en primer plano; el watcher nativo sostiene segundo plano.
    timer = setInterval(() => {
      void enviarPendiente().catch(() => { /* Error visible en el estado de jornada. */ });
    }, 60000);
    vencimiento = setTimeout(detenerEnSegundoPlano, Math.max(0, jornada.expiraEn - Date.now()));
  } catch (err) { await detenerJornada(); throw err; }
  } finally { iniciando = false; }
}
export async function detenerJornada(notificar = true) {
  ++generacion;
  const actual = jornada;
  clearInterval(timer); clearTimeout(vencimiento); pendiente = undefined;
  const id = watcher;
  if (id) {
    try { await gps.removeWatcher({ id }); }
    catch {
      emitir({ activa: true, pendiente: false, error: 'No se pudo detener la ubicación del teléfono. Pulsa Finalizar jornada para reintentar.' });
      throw new Error('No se pudo detener la ubicación. Reintenta finalizar la jornada.');
    }
  }
  watcher = null; jornada = null;
  emitir({ activa: false, pendiente: false, ultima: undefined, error: undefined });
  if (actual && notificar) {
    try { await equipoApi('/api/movil/estado', { accion: 'finalizar', jornadaId: actual.id }); }
    catch { emitir({ error: 'Ubicación detenida en este teléfono. No se pudo confirmar el fin con la oficina.' }); }
  }
}
