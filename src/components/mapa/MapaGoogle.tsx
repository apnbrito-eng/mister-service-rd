/**
 * MapaGoogle.tsx — envoltorio del Google Maps JS. Recibe marcadores y líneas
 * ya calculados y notifica interacciones.
 *
 * Garantías:
 *  - Si Google no carga pinta `sinMapa`.
 *  - Marcadores se actualizan por id; nunca se recrean innecesariamente.
 *  - Un marcador arrastrable SIEMPRE vuelve a su lugar al soltar.
 *  - Reintento efectivo: el reintento reconstruye el mapa (crea el div, llama a
 *    `importLibrary`, re-registra listeners). Antes solo marcaba `listo=true`
 *    sin volver a instanciar `new Map(...)` → el mapa quedaba null.
 *
 * Dependencias: `src/utils/cargarGoogleMaps.ts` (Codex) y `@types/google.maps`.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  cargarGoogleMaps,
  estadoGoogleMaps,
  MAP_ID,
  MENSAJE_ESTADO,
  oirEstadoGoogleMaps,
  type EstadoGoogle,
} from '../../utils/cargarGoogleMaps';
import type { LatLng } from '../../utils/geo';
import type { Limites } from '../../utils/clusterPantalla';

export type CapaMarcador = 'cliente' | 'grupo_citas' | 'grupo' | 'cita' | 'van' | 'oficina';

export interface MarcadorMapa {
  id: string;
  pos: LatLng;
  capa: CapaMarcador;
  /** Cambia cuando cambia el aspecto; si no cambia, no se redibuja. */
  clave: string;
  contenido: () => HTMLElement;
  z?: number;
  arrastrable?: boolean;
  titulo: string;
}

export interface LineaMapa {
  id: string;
  puntos: LatLng[];
  color: string;
  grosor?: number;
  punteada?: boolean;
  opacidad?: number;
}

export interface Encuadre {
  clave: string;
  puntos: LatLng[];
}

export interface Vista {
  limites: Limites;
  zoom: number;
}

interface Props {
  marcadores: MarcadorMapa[];
  lineas: LineaMapa[];
  tipo: 'mapa' | 'satelite';
  trafico: boolean;
  encuadre?: Encuadre | null;
  relleno?: { top: number; right: number; bottom: number; left: number };
  onClickMarcador: (m: MarcadorMapa) => void;
  onClickMapa?: () => void;
  onCambioVista?: (v: Vista) => void;
  onSoltar?: (m: MarcadorMapa, clientX: number, clientY: number) => void;
  sinMapa?: ReactNode;
}

const SANTO_DOMINGO: LatLng = { lat: 18.4861, lng: -69.9312 };

/** Dispara los handlers teclado de un marcador cuando el nodo tiene role=button. */
function manejarTeclaMarcador(
  node: HTMLElement,
  dato: MarcadorMapa,
  onActivar: (m: MarcadorMapa) => void,
) {
  const kb = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onActivar(dato);
    }
  };
  node.addEventListener('keydown', kb);
  return () => node.removeEventListener('keydown', kb);
}

export default function MapaGoogle(p: Props) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<google.maps.Map | null>(null);
  const traficoCapa = useRef<google.maps.TrafficLayer | null>(null);
  const Avanzado = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(null);
  const marcas = useRef(
    new Map<string, { m: google.maps.marker.AdvancedMarkerElement; clave: string; dato: MarcadorMapa; cleanupTeclado: () => void }>(),
  );
  const lineas = useRef(new Map<string, { l: google.maps.Polyline; firma: string }>());
  const ultimaClave = useRef<string | null>(null);
  const props = useRef(p);
  props.current = p;
  const [estado, setEstado] = useState<EstadoGoogle>(estadoGoogleMaps());
  const [listo, setListo] = useState(false);
  const [intentos, setIntentos] = useState(0);

  const inicializar = useCallback(async (sigueVivo: () => boolean) => {
    if (!div.current) return false;
    const ok = await cargarGoogleMaps();
    if (!ok || !sigueVivo()) return false;
    try {
      const { Map, TrafficLayer } = (await google.maps.importLibrary(
        'maps',
      )) as google.maps.MapsLibrary;
      const { AdvancedMarkerElement } = (await google.maps.importLibrary(
        'marker',
      )) as google.maps.MarkerLibrary;
      // Si entre tanto el componente desmontó, abortamos.
      if (!div.current || !sigueVivo()) return false;
      Avanzado.current = AdvancedMarkerElement;
      const m = new Map(div.current, {
        center: SANTO_DOMINGO,
        zoom: 12,
        mapId: MAP_ID,
        gestureHandling: 'greedy',
        clickableIcons: false,
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
      });
      traficoCapa.current = new TrafficLayer();
      m.addListener('click', () => props.current.onClickMapa?.());
      m.addListener('idle', () => {
        const b = m.getBounds();
        const z = m.getZoom();
        if (!b || z === undefined) return;
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        props.current.onCambioVista?.({
          limites: { norte: ne.lat(), este: ne.lng(), sur: sw.lat(), oeste: sw.lng() },
          zoom: z,
        });
      });
      mapa.current = m;
      setListo(true);
      return true;
    } catch (e) {
      console.error('[MapaGoogle] no se pudo crear el mapa', e);
      setEstado('clave_rechazada');
      return false;
    }
  }, []);

  // Cargar Google y crear el mapa; se re-ejecuta cuando cambia `intentos`
  useEffect(() => {
    let vivo = true;
    const quitar = oirEstadoGoogleMaps(setEstado);
    (async () => {
      const ok = await inicializar(() => vivo);
      if (!vivo || !ok) return;
    })();
    const marcasRef = marcas;
    const lineasRef = lineas;
    return () => {
      vivo = false;
      quitar();
      marcasRef.current.forEach((x) => { x.cleanupTeclado?.(); x.m.map = null; });
      marcasRef.current.clear();
      lineasRef.current.forEach((x) => x.l.setMap(null));
      lineasRef.current.clear();
      if (traficoCapa.current) { traficoCapa.current.setMap(null); traficoCapa.current = null; }
      if (mapa.current) google.maps.event.clearInstanceListeners(mapa.current);
      mapa.current = null;
      ultimaClave.current = null;
    };
  }, [intentos, inicializar]);

  // Tipo y tráfico
  useEffect(() => {
    if (!listo || !mapa.current) return;
    mapa.current.setMapTypeId(p.tipo === 'satelite' ? 'hybrid' : 'roadmap');
    traficoCapa.current?.setMap(p.trafico ? mapa.current : null);
  }, [listo, p.tipo, p.trafico]);

  // Marcadores
  useEffect(() => {
    const m = mapa.current;
    const CM = Avanzado.current;
    if (!listo || !m || !CM) return;
    const vistos = new Set<string>();
    for (const d of p.marcadores) {
      vistos.add(d.id);
      const ya = marcas.current.get(d.id);
      if (ya) {
        ya.dato = d;
        ya.m.title = d.titulo;
        if (ya.clave !== d.clave) {
          const nuevoContenido = d.contenido();
          ya.m.content = nuevoContenido;
          ya.clave = d.clave;
          // Re-registra manejador teclado sobre el nodo nuevo.
          ya.cleanupTeclado?.();
          ya.cleanupTeclado = manejarTeclaMarcador(nuevoContenido, d, (x) => props.current.onClickMarcador(x));
        }
        const pos = ya.m.position as google.maps.LatLngLiteral | null;
        if (!pos || pos.lat !== d.pos.lat || pos.lng !== d.pos.lng) {
          ya.m.position = d.pos;
        }
        ya.m.zIndex = d.z ?? null;
        ya.m.gmpDraggable = !!d.arrastrable;
        continue;
      }
      const contenido = d.contenido();
      const mk = new CM({
        map: m,
        position: d.pos,
        content: contenido,
        zIndex: d.z ?? null,
        title: d.titulo,
        gmpDraggable: !!d.arrastrable,
      });
      const reg = {
        m: mk,
        clave: d.clave,
        dato: d,
        cleanupTeclado: manejarTeclaMarcador(contenido, d, (x) => props.current.onClickMarcador(x)),
      };
      mk.addListener('click', () => props.current.onClickMarcador(reg.dato));
      mk.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        const ev = e.domEvent as MouseEvent | TouchEvent | undefined;
        const punto = ev && 'changedTouches' in ev ? ev.changedTouches[0] : (ev as MouseEvent | undefined);
        mk.position = reg.dato.pos;
        if (punto) props.current.onSoltar?.(reg.dato, punto.clientX, punto.clientY);
      });
      marcas.current.set(d.id, reg);
    }
    marcas.current.forEach((x, id) => {
      if (!vistos.has(id)) {
        x.cleanupTeclado?.();
        x.m.map = null;
        marcas.current.delete(id);
      }
    });
  }, [listo, p.marcadores]);

  // Líneas
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m) return;
    const vistos = new Set<string>();
    for (const d of p.lineas) {
      vistos.add(d.id);
      const firma = JSON.stringify([d.puntos, d.color, d.grosor, d.punteada, d.opacidad]);
      const ya = lineas.current.get(d.id);
      if (ya && ya.firma === firma) continue;
      ya?.l.setMap(null);
      const op = d.opacidad ?? 0.9;
      const l = new google.maps.Polyline({
        map: m,
        path: d.puntos,
        clickable: false,
        strokeColor: d.color,
        strokeOpacity: d.punteada ? 0 : op,
        strokeWeight: d.grosor ?? 5,
        icons: d.punteada
          ? [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: op,
                  strokeColor: d.color,
                  scale: 3,
                },
                offset: '0',
                repeat: '14px',
              },
            ]
          : undefined,
      });
      lineas.current.set(d.id, { l, firma });
    }
    lineas.current.forEach((x, id) => {
      if (!vistos.has(id)) {
        x.l.setMap(null);
        lineas.current.delete(id);
      }
    });
  }, [listo, p.lineas]);

  useEffect(() => {
    const m = mapa.current;
    const e = p.encuadre;
    if (!listo || !m || !e || e.clave === ultimaClave.current) return;
    ultimaClave.current = e.clave;
    const pts = e.puntos.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
    if (!pts.length) return;
    if (pts.length === 1) {
      m.panTo(pts[0]);
      if ((m.getZoom() ?? 0) < 15) m.setZoom(15);
      return;
    }
    const b = new google.maps.LatLngBounds();
    pts.forEach((x) => b.extend(x));
    m.fitBounds(b, p.relleno ?? 48);
  }, [listo, p.encuadre, p.relleno]);

  const fallo = estado === 'sin_clave' || estado === 'clave_rechazada' || estado === 'sin_conexion';
  const puedeReintentar = estado === 'sin_conexion';
  const reintentar = () => {
    // Fuerza al effect principal a re-ejecutarse: `intentos+1` → cambia la dep.
    // El cleanup del effect anterior limpia marcas, listeners y ref mapa.
    setListo(false);
    setEstado('cargando');
    setIntentos((n) => n + 1);
  };
  return (
    <div className="relative h-full w-full bg-[#e8eaed]">
      <div ref={div} className="absolute inset-0" role="region" aria-label="Mapa" hidden={fallo} />
      {estado === 'cargando' && (
        <div className="absolute inset-0 grid place-items-center text-sm text-gray-600">
          {MENSAJE_ESTADO.cargando}
        </div>
      )}
      {fallo && (
        <div className="absolute inset-0 overflow-auto bg-white">
          <div className="m-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <p role="status" className="flex-1">
              {MENSAJE_ESTADO[estado]}
            </p>
            {puedeReintentar && (
              <button
                type="button"
                onClick={reintentar}
                className="min-h-[44px] shrink-0 rounded-md border border-amber-400 bg-white px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Reintentar
              </button>
            )}
          </div>
          {p.sinMapa}
        </div>
      )}
    </div>
  );
}
