import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.heat';
import { Cliente, ZONAS_RD } from '../../types';
import { formatTelefono } from '../../utils';
import {
  colorAntiguedadPin,
  colorZonaPin,
  etiquetaAntiguedadPin,
} from '../../utils/zonas';
import { mesesDesdeUltimoServicio } from '../../utils/clientesFiltros';
import { Layers, Flame, MapPin as MapPinIcon, AlertTriangle } from 'lucide-react';

type VistaMapa = 'cluster' | 'heatmap' | 'zonas';

interface MapaClientesProps {
  /** Clientes ya filtrados Y con coords válidas. El componente NO filtra. */
  clientes: Cliente[];
  /** Cantidad de clientes que el filtro deja pasar pero no tienen coords. */
  totalSinCoords: number;
  /** Callback cuando el usuario hace click en "Ver detalle" del popup. */
  onSelectCliente: (id: string) => void;
}

/** Fix: iconos default de Leaflet rotos cuando se importa el módulo (CRA/Vite). */
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/**
 * Crea un DivIcon SVG tipo gota con un color sólido.
 * Patrón inspirado en `crearPinSVG` de `MapaRutas.tsx` pero sin numeración —
 * en clientes no hay orden de visita, solo identidad de zona/antigüedad.
 */
function pinClienteSVG(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <svg width="26" height="34" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0 C7.163 0 0 7.163 0 16 C0 28 16 42 16 42 S32 28 32 16 C32 7.163 24.837 0 16 0Z"
              fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="16" cy="16" r="5" fill="white"/>
      </svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -34],
  });
}

/**
 * Construye el HTML del popup. Se hace por string porque markercluster trabaja
 * con `L.Marker` puro (no React-Leaflet). Botones requieren delegación de
 * eventos: ver `useEffect` que adjunta listeners post-render.
 */
function popupHTMLCliente(c: Cliente, meses: number | null): string {
  const ultimoTexto = c.legacyMetricas?.fechaUltimoServicio
    ? `${c.legacyMetricas.fechaUltimoServicio}${meses !== null ? ` (hace ${meses < 1 ? '<1' : Math.round(meses)} m)` : ''}`
    : 'Sin registro';
  const total = c.legacyMetricas?.totalServicios || 0;
  const zonaTexto = c.zona || 'Sin zona';
  const equipos = c.legacyMetricas?.equiposAtendidos
    ? c.legacyMetricas.equiposAtendidos.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3).join(', ')
    : '';
  const tel = c.telefono ? formatTelefono(c.telefono) : 'Sin teléfono';
  // Escapamos para evitar XSS al construir HTML manualmente.
  const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `
    <div style="min-width:200px;font-family:Inter,system-ui,sans-serif;">
      <div style="font-weight:700;font-size:14px;color:#0f3460;margin-bottom:4px;">${safe(c.nombre || 'Sin nombre')}</div>
      <div style="font-size:12px;color:#475569;">${safe(tel)}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">Zona: <span style="color:#1a5fa8;font-weight:500;">${safe(zonaTexto)}</span></div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">Último servicio: ${safe(ultimoTexto)}</div>
      <div style="font-size:12px;color:#475569;">Total servicios: ${total}</div>
      ${equipos ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${safe(equipos)}</div>` : ''}
      <button data-cliente-id="${safe(c.id)}" data-action="ver-detalle"
        style="margin-top:8px;width:100%;padding:6px 10px;background:#0f3460;color:white;border:none;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">
        Ver detalle
      </button>
    </div>
  `;
}

/** Hook interno: actualiza la capa activa cuando cambian vista o clientes. */
function CapaSegunVista({
  vista,
  clientes,
  onSelectCliente,
}: {
  vista: VistaMapa;
  clientes: Cliente[];
  onSelectCliente: (id: string) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // Limpia la capa anterior antes de recrear
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (clientes.length === 0) {
      // Centro por defecto en Santo Domingo cuando no hay puntos
      map.setView([18.48, -69.93], 11);
      return;
    }

    if (vista === 'cluster') {
      const cluster = (L as unknown as {
        markerClusterGroup: (opts: L.MarkerClusterGroupOptions) => L.MarkerClusterGroup;
      }).markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
      });

      clientes.forEach(c => {
        if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return;
        const meses = mesesDesdeUltimoServicio(c);
        const color = colorAntiguedadPin(meses);
        const marker = L.marker([c.lat, c.lng], { icon: pinClienteSVG(color) });
        marker.bindPopup(popupHTMLCliente(c, meses));
        cluster.addLayer(marker);
      });
      cluster.addTo(map);
      layerRef.current = cluster;
    } else if (vista === 'heatmap') {
      const data: L.HeatLatLngTuple[] = clientes
        .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map(c => {
          const total = c.legacyMetricas?.totalServicios || 0;
          // El peso satura en 10 servicios para que pocos VIPs no tapen el resto.
          const weight = Math.min(total, 10) / 10 || 0.2;
          return [c.lat as number, c.lng as number, weight] as L.HeatLatLngTuple;
        });
      const heat = L.heatLayer(data, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        minOpacity: 0.35,
      });
      heat.addTo(map);
      layerRef.current = heat;
    } else if (vista === 'zonas') {
      const group = L.layerGroup();
      clientes.forEach(c => {
        if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return;
        const color = colorZonaPin(c.zona);
        const meses = mesesDesdeUltimoServicio(c);
        const cm = L.circleMarker([c.lat, c.lng], {
          radius: 6,
          fillColor: color,
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.85,
        });
        cm.bindPopup(popupHTMLCliente(c, meses));
        group.addLayer(cm);
      });
      group.addTo(map);
      layerRef.current = group;
    }

    // Auto-fit a los puntos al cambiar de vista o set de datos
    const validos = clientes.filter(c =>
      typeof c.lat === 'number' && typeof c.lng === 'number' &&
      !isNaN(c.lat) && !isNaN(c.lng)
    );
    if (validos.length > 0) {
      const bounds = L.latLngBounds(validos.map(c => [c.lat as number, c.lng as number] as [number, number]));
      try {
        map.fitBounds(bounds.pad(0.15), { animate: false, maxZoom: 14 });
      } catch {
        // bounds inválido: dejamos centro default
      }
    }
  }, [vista, clientes, map]);

  // Delegación de click sobre el botón "Ver detalle" del popup.
  // Los popups de markercluster no son React; necesitamos un listener global.
  useEffect(() => {
    const container = map.getContainer();
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest('button[data-action="ver-detalle"]') as HTMLButtonElement | null;
      if (!btn) return;
      const id = btn.getAttribute('data-cliente-id');
      if (id) onSelectCliente(id);
    };
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [map, onSelectCliente]);

  return null;
}

export default function MapaClientes({
  clientes,
  totalSinCoords,
  onSelectCliente,
}: MapaClientesProps) {
  const [vista, setVista] = useState<VistaMapa>('cluster');

  // Centro inicial: usar el primer cliente con coords si hay, o Santo Domingo
  const centroInicial = useMemo<[number, number]>(() => {
    const primero = clientes.find(c =>
      typeof c.lat === 'number' && typeof c.lng === 'number'
    );
    if (primero) return [primero.lat as number, primero.lng as number];
    return [18.48, -69.93];
  }, [clientes]);

  return (
    <div className="relative bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: '70vh' }}>
      {/* Botones segmentados de vista */}
      <div className="absolute top-3 left-3 z-[450] bg-white rounded-xl shadow-md border border-gray-100 p-1 flex">
        <button
          type="button"
          onClick={() => setVista('cluster')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            vista === 'cluster' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Layers size={12} /> Cluster
        </button>
        <button
          type="button"
          onClick={() => setVista('heatmap')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            vista === 'heatmap' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Flame size={12} /> Heatmap
        </button>
        <button
          type="button"
          onClick={() => setVista('zonas')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            vista === 'zonas' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <MapPinIcon size={12} /> Zonas
        </button>
      </div>

      {/* Contador esquina sup. derecha */}
      <div className="absolute top-3 right-3 z-[450] bg-white/95 backdrop-blur rounded-full shadow-md px-3 py-1.5 text-xs text-gray-700 border border-gray-100">
        <span className="font-semibold text-primary">{clientes.length.toLocaleString('es-DO')}</span> en mapa
      </div>

      {/* Leyenda inferior izquierda según vista */}
      {vista === 'zonas' && (
        <div className="absolute bottom-12 left-3 z-[450] bg-white/95 backdrop-blur rounded-xl shadow-md border border-gray-100 p-3 text-xs max-w-[200px]">
          <p className="font-semibold text-gray-700 mb-1.5">Zonas</p>
          <div className="space-y-1">
            {ZONAS_RD.map(z => (
              <div key={z} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: colorZonaPin(z) }}
                />
                <span className="text-gray-700">{z}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: colorZonaPin(null) }}
              />
              <span className="text-gray-500 italic">Sin zona</span>
            </div>
          </div>
        </div>
      )}

      {vista === 'cluster' && (
        <div className="absolute bottom-12 left-3 z-[450] bg-white/95 backdrop-blur rounded-xl shadow-md border border-gray-100 p-3 text-xs max-w-[210px]">
          <p className="font-semibold text-gray-700 mb-1.5">Antigüedad servicio</p>
          <div className="space-y-1">
            {([null, 1, 4, 8, 18] as Array<number | null>).map(m => (
              <div key={String(m)} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: colorAntiguedadPin(m) }}
                />
                <span className="text-gray-700">{etiquetaAntiguedadPin(m)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vista === 'heatmap' && (
        <div className="absolute bottom-12 left-3 z-[450] bg-white/95 backdrop-blur rounded-xl shadow-md border border-gray-100 p-3 text-xs max-w-[220px]">
          <p className="font-semibold text-gray-700 mb-1">Densidad de clientes</p>
          <p className="text-[11px] text-gray-500">
            Las zonas más cálidas concentran más clientes. El peso aumenta con el total de servicios histórico.
          </p>
        </div>
      )}

      {/* Banner inferior si hay clientes sin coords */}
      {totalSinCoords > 0 && (
        <div className="absolute bottom-3 left-3 right-3 z-[450] bg-amber-50 border border-amber-200 text-amber-900 rounded-xl shadow-md px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>{totalSinCoords.toLocaleString('es-DO')}</strong>{' '}
            cliente{totalSinCoords === 1 ? '' : 's'} cumple{totalSinCoords === 1 ? '' : 'n'} los filtros pero no tiene{totalSinCoords === 1 ? '' : 'n'} coordenadas y no aparece{totalSinCoords === 1 ? '' : 'n'} en el mapa.
          </span>
        </div>
      )}

      <MapContainer
        center={centroInicial}
        zoom={11}
        style={{ height: '100%', width: '100%' }}
        preferCanvas={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CapaSegunVista
          vista={vista}
          clientes={clientes}
          onSelectCliente={onSelectCliente}
        />
      </MapContainer>
    </div>
  );
}
