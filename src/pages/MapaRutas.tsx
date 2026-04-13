import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal, Cliente } from '../types';
import { getTecnicoColor, formatHora, faseLabel, formatTelefono, parseOrden } from '../utils';
import { optimizarRuta, distanciaTotalRuta } from '../utils/rutas';
import { whatsappUrl, mensajesWhatsApp } from '../utils/whatsapp';
import LoadingSpinner from '../components/LoadingSpinner';
import { MapPin, Navigation, Route, Clock, Phone, MessageCircle, Satellite, Truck, WifiOff } from 'lucide-react';
import { suscribirTodasUbicaciones } from '../services/gps.service';
import { UbicacionVehiculo } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import 'leaflet/dist/leaflet.css';

/** Pin SVG tipo gota con número */
function crearPinSVG(color: string, numero: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0 C7.163 0 0 7.163 0 16 C0 28 16 42 16 42 S32 28 32 16 C32 7.163 24.837 0 16 0Z"
              fill="${color}" stroke="white" stroke-width="2"/>
        <text x="16" y="19" text-anchor="middle" dominant-baseline="middle"
              fill="white" font-weight="bold" font-size="12" font-family="Arial">${numero}</text>
      </svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
  });
}

interface MarcadorConRuta {
  id: string;
  lat: number;
  lng: number;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string;
  equipoTipo: string;
  tecnicoNombre: string;
  fase: string;
  fechaCita: Date | null;
  orden: number; // position in optimized route
}

export default function MapaRutas() {
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [rutaOptimizada, setRutaOptimizada] = useState(true);
  const [tab, setTab] = useState<'rutas' | 'gps_vivo'>('rutas');
  const [ubicacionesLive, setUbicacionesLive] = useState<UbicacionVehiculo[]>([]);

  useEffect(() => {
    if (tab !== 'gps_vivo') return;
    const unsub = suscribirTodasUbicaciones(setUbicacionesLive);
    return () => unsub();
  }, [tab]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>)));
      setLoading(false);
    });
    getDocs(collection(db, 'clientes')).then(snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)));
    });
    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
    return () => unsub();
  }, []);

  const ordenesDelDia = useMemo(() => {
    const targetDate = new Date(selectedDate + 'T00:00:00');
    return ordenes
      .filter(o => o.fechaCita && isSameDay(o.fechaCita, targetDate) && o.estado !== 'cancelado')
      .filter(o => !filtroTecnico || o.tecnicoNombre === filtroTecnico);
  }, [ordenes, selectedDate, filtroTecnico]);

  // Build markers with client coordinates
  const marcadoresRaw = useMemo(() => {
    return ordenesDelDia
      .map(o => {
        const cliente = clientes.find(c => c.id === o.clienteId);
        if (!cliente?.lat || !cliente?.lng) return null;
        return {
          id: o.id,
          lat: cliente.lat,
          lng: cliente.lng,
          clienteNombre: o.clienteNombre,
          clienteTelefono: o.clienteTelefono || '',
          direccion: cliente.direccion,
          equipoTipo: o.equipoTipo,
          tecnicoNombre: o.tecnicoNombre || 'Sin asignar',
          fase: o.fase,
          fechaCita: o.fechaCita || null,
          orden: 0,
        } as MarcadorConRuta;
      })
      .filter((m): m is MarcadorConRuta => m !== null);
  }, [ordenesDelDia, clientes]);

  // Group by technician, optimize each route, assign order numbers
  const { marcadores, polylines, distancias } = useMemo(() => {
    const groups: Record<string, MarcadorConRuta[]> = {};
    marcadoresRaw.forEach(m => {
      const key = m.tecnicoNombre;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });

    const allMarcadores: MarcadorConRuta[] = [];
    const allPolylines: { nombre: string; positions: [number, number][]; color: string }[] = [];
    const allDistancias: Record<string, number> = {};

    Object.entries(groups).forEach(([nombre, puntos]) => {
      const optimized = rutaOptimizada
        ? optimizarRuta(puntos)
        : puntos.sort((a, b) => (a.fechaCita?.getTime() || 0) - (b.fechaCita?.getTime() || 0));

      optimized.forEach((m, i) => {
        allMarcadores.push({ ...m, orden: i + 1 });
      });

      const color = getTecnicoColor(nombre);
      allPolylines.push({
        nombre,
        positions: optimized.map(m => [m.lat, m.lng] as [number, number]),
        color,
      });
      allDistancias[nombre] = distanciaTotalRuta(optimized);
    });

    return { marcadores: allMarcadores, polylines: allPolylines, distancias: allDistancias };
  }, [marcadoresRaw, rutaOptimizada]);

  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);

  if (loading) return <LoadingSpinner fullPage text="Cargando mapa..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[#0f3460]">Mapa de Rutas</h1>
        <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100">
          <button onClick={() => setTab('rutas')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === 'rutas' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
            <Route size={12} /> Rutas del Día
          </button>
          <button onClick={() => setTab('gps_vivo')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === 'gps_vivo' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
            <Satellite size={12} /> 🛰️ GPS en Vivo
          </button>
        </div>
        <div className={`flex items-center gap-3 flex-wrap ${tab === 'gps_vivo' ? 'hidden' : ''}`}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="">Todos los técnicos</option>
            {tecnicos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
          </select>
          <button onClick={() => setRutaOptimizada(!rutaOptimizada)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              rutaOptimizada ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600'
            }`}>
            <Route size={14} /> {rutaOptimizada ? 'Ruta Optimizada' : 'Orden Cronológico'}
          </button>
        </div>
      </div>

      {tab === 'gps_vivo' && (
        <div className="flex gap-6 flex-col lg:flex-row">
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: '70vh' }}>
            {ubicacionesLive.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <Truck size={48} className="mx-auto mb-3 opacity-30" />
                  <p>Sin vehículos con señal activa</p>
                  <p className="text-xs mt-1">Los técnicos comparten ubicación cuando hay tracking GPS activo en sus órdenes.</p>
                </div>
              </div>
            ) : (
              <MapContainer
                center={[ubicacionesLive[0]?.lat || 18.48, ubicacionesLive[0]?.lng || -69.93]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {ubicacionesLive.map(u => {
                  const color = getTecnicoColor(u.tecnicoNombre || '');
                  const icon = L.divIcon({
                    className: '',
                    html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>`,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18],
                  });
                  return (
                    <Marker key={u.vehiculoId} position={[u.lat, u.lng]} icon={icon}>
                      <Popup>
                        <div className="text-sm">
                          <p className="font-semibold">{u.tecnicoNombre || 'Técnico'}</p>
                          <p>{Math.round(u.velocidad)} km/h · {u.enMovimiento ? 'En movimiento' : 'Detenido'}</p>
                          <p className="text-xs text-gray-500">{formatDistanceToNow(u.timestamp, { locale: es, addSuffix: true })}</p>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
          </div>

          {/* Panel lateral */}
          <div className="lg:w-80 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Satellite size={16} className="text-[#1a5fa8]" />
                <span className="text-sm font-semibold">Técnicos activos ({ubicacionesLive.length})</span>
              </div>
              <div className="space-y-2">
                {ubicacionesLive.map(u => {
                  const minutosSinSeñal = Math.floor((Date.now() - u.timestamp.getTime()) / 60000);
                  const sinSeñal = minutosSinSeñal > 5;
                  const ordenEnCurso = ordenes.find(o => o.tecnicoId === u.tecnicoId && o.estado === 'activo');
                  return (
                    <div key={u.vehiculoId} className={`rounded-lg p-3 border ${sinSeñal ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: getTecnicoColor(u.tecnicoNombre || '') }}>
                          {(u.tecnicoNombre || 'T').split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{u.tecnicoNombre || 'Técnico'}</p>
                          <p className="text-xs text-gray-500">
                            {sinSeñal ? (
                              <span className="flex items-center gap-1 text-yellow-700">
                                <WifiOff size={10} /> Sin señal ({minutosSinSeñal} min)
                              </span>
                            ) : u.enMovimiento ? (
                              <span className="text-green-600">🟢 En movimiento · {Math.round(u.velocidad)} km/h</span>
                            ) : (
                              <span className="text-gray-600">⏸ Detenido</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {ordenEnCurso && (
                        <p className="text-[10px] text-gray-500 mt-1">Orden: {ordenEnCurso.numero} · {ordenEnCurso.clienteNombre}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">Actualizado {formatDistanceToNow(u.timestamp, { locale: es, addSuffix: true })}</p>
                    </div>
                  );
                })}
                {ubicacionesLive.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Sin técnicos activos</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'rutas' && (
      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Map */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: '70vh' }}>
          {marcadores.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <MapPin size={48} className="mx-auto mb-3 opacity-30" />
                <p>Sin citas con ubicación para esta fecha</p>
                <p className="text-xs mt-1">Los clientes necesitan tener coordenadas GPS</p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={[marcadores[0]?.lat || 18.48, marcadores[0]?.lng || -69.93]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {marcadores.map(m => (
                <Marker
                  key={m.id}
                  position={[m.lat, m.lng]}
                  icon={crearPinSVG(getTecnicoColor(m.tecnicoNombre), m.orden)}
                >
                  <Popup>
                    <div className="text-sm min-w-[200px]">
                      <p className="font-bold text-base">{m.orden}. {m.clienteNombre}</p>
                      <p className="text-gray-600 mt-1">{m.direccion}</p>
                      <div className="flex items-center gap-1 text-gray-600 mt-1">
                        <Clock size={12} /> {m.fechaCita ? formatHora(m.fechaCita) : '—'}
                      </div>
                      <p className="text-gray-600">Técnico: {m.tecnicoNombre}</p>
                      <p className="text-gray-600">{m.equipoTipo} · {faseLabel(m.fase as import('../types').FaseOrden)}</p>
                      {m.clienteTelefono && (
                        <div className="flex gap-2 mt-2">
                          <a href={`tel:${m.clienteTelefono}`} className="text-blue-600 text-xs flex items-center gap-1">
                            <Phone size={10} /> {formatTelefono(m.clienteTelefono)}
                          </a>
                          <a href={whatsappUrl(m.clienteTelefono, mensajesWhatsApp.recordatorioCita(m.clienteNombre, selectedDate, m.fechaCita ? formatHora(m.fechaCita) : ''))}
                            target="_blank" rel="noreferrer"
                            className="text-green-600 text-xs flex items-center gap-1">
                            <MessageCircle size={10} /> WhatsApp
                          </a>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
              {polylines.map(pl => (
                <Polyline key={pl.nombre} positions={pl.positions}
                  pathOptions={{ color: pl.color, weight: 3, opacity: 0.8, dashArray: rutaOptimizada ? undefined : '8 4' }} />
              ))}
            </MapContainer>
          )}
        </div>

        {/* Side panel: route list */}
        <div className="lg:w-80 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Navigation size={16} className="text-[#1a5fa8]" />
              <span className="text-sm font-semibold text-gray-900">
                {ordenesDelDia.length} citas · {marcadores.length} en mapa
              </span>
            </div>
            {/* Distance info */}
            {Object.entries(distancias).map(([nombre, km]) => (
              <div key={nombre} className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getTecnicoColor(nombre) }} />
                <span>{nombre}: {km.toFixed(1)} km</span>
              </div>
            ))}
          </div>

          {/* Ordered list */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden max-h-[55vh] overflow-y-auto">
            {marcadores.sort((a, b) => a.orden - b.orden).map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: getTecnicoColor(m.tecnicoNombre) }}>
                  {m.orden}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.clienteNombre}</p>
                  <p className="text-xs text-gray-500 truncate">{m.equipoTipo} · {m.fechaCita ? formatHora(m.fechaCita) : '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{m.direccion}</p>
                </div>
              </div>
            ))}
            {marcadores.length === 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">Sin citas en el mapa</div>
            )}
          </div>

          {/* Legend */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Técnicos</p>
            <div className="space-y-1">
              {tecnicos.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color || getTecnicoColor(t.nombre) }} />
                  {t.nombre} {t.zona ? `· ${t.zona}` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
