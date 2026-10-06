/** Un solo cargador compartido por mapas y autocompletado de direcciones. */
export type EstadoGoogle = 'sin_cargar' | 'cargando' | 'listo' | 'sin_clave' | 'clave_rechazada' | 'sin_conexion';
let intento = 0;
let estado: EstadoGoogle = 'sin_cargar';
let pendiente: Promise<boolean> | null = null;
let resolverCarga: ((ok: boolean, estado: EstadoGoogle) => void) | undefined;
const oyentes = new Set<(estado: EstadoGoogle) => void>();
const cambiar = (nuevo: EstadoGoogle) => { estado = nuevo; oyentes.forEach(f => f(nuevo)); };
export const estadoGoogleMaps = () => estado;
export function oirEstadoGoogleMaps(f: (estado: EstadoGoogle) => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}
export const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';
export const MENSAJE_ESTADO: Record<EstadoGoogle, string> = {
  sin_cargar: '', cargando: 'Cargando el mapa…', listo: '',
  sin_clave: 'Falta configurar Google Maps. Puedes continuar en la lista.',
  clave_rechazada: 'Google rechazó la configuración del mapa. Puedes continuar en la lista.',
  sin_conexion: 'No se pudo cargar Google Maps. Revisa la conexión o continúa en la lista.',
};

/** Un rechazo de credenciales requiere corregir la configuración y recargar la página. */
export function cargarGoogleMaps(clave = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (estado === 'clave_rechazada') return Promise.resolve(false);
  if (pendiente) return pendiente;
  if (window.google?.maps?.Map) { cambiar('listo'); return Promise.resolve(true); }
  if (!clave?.trim()) { cambiar('sin_clave'); return Promise.resolve(false); }
  if (navigator.onLine === false) { cambiar('sin_conexion'); return Promise.resolve(false); }
  cambiar('cargando');
  const global = window as unknown as Record<string, unknown>;
  global.gm_authFailure = () => {
    if (resolverCarga) resolverCarga(false, 'clave_rechazada');
    else cambiar('clave_rechazada');
  };
  pendiente = new Promise<boolean>(resolve => {
    // Todos los consumidores del proyecto usan este módulo; se conserva el ID anterior.
    document.getElementById('google-places-script')?.remove();
    const script = document.createElement('script');
    script.id = 'google-places-script';
    script.async = true;
    let terminado = false;
    const callback = `__msGoogleMapsListo${++intento}`;
    const fin = (ok: boolean, nuevo: EstadoGoogle) => {
      if (terminado) return;
      terminado = true;
      window.clearTimeout(timer);
      resolverCarga = undefined;
      // Un callback tardío tras un timeout no debe resolver el siguiente intento.
      global[callback] = () => undefined;
      if (!ok) { script.remove(); pendiente = null; }
      cambiar(nuevo);
      resolve(ok);
    };
    const timer = window.setTimeout(() => fin(false, 'sin_conexion'), 15_000);
    resolverCarga = fin;
    global[callback] = () => fin(Boolean(window.google?.maps?.Map), window.google?.maps?.Map ? 'listo' : 'sin_conexion');
    script.onerror = () => fin(false, 'sin_conexion');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(clave)}&v=weekly&loading=async&language=es&region=DO&libraries=places,marker,geometry&callback=${callback}`;
    document.head.appendChild(script);
  });
  return pendiente;
}
