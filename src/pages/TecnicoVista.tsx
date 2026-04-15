import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, updateDoc, doc, Timestamp, getDocs, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Cliente, TecnicoPermisos, PERMISOS_DEFAULT_TECNICO, FaseOrden } from '../types';
import { faseLabel, formatHora, formatFecha, formatTelefono, parseOrden, googleMapsLink, estadoSimpleColor, estadoSimpleLabel, crearRegistroAuditoria } from '../utils';
import { whatsappUrl, mensajesWhatsApp } from '../utils/whatsapp';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Logo from '../components/Logo';
import CierreServicioWizard from '../components/CierreServicioWizard';
import { guardarUbicacionVehiculo } from '../services/gps.service';
import {
  MapPin, Clock, Phone, MessageSquare, CheckCircle, LogOut, Navigation,
  User, Bell, StickyNote, Eye, History, FileText, X, Check
} from 'lucide-react';
import { isSameDay, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { optimizarRuta } from '../utils/rutas';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/** Pin SVG tipo gota numerado */
function crearPinNumerado(numero: number, color: string = '#1a5fa8'): L.DivIcon {
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

type VistaTab = 'hoy' | 'semana' | 'mes' | 'rango';

export default function TecnicoVista() {
  const { userProfile } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vista, setVista] = useState<VistaTab>('hoy');
  const [rangoDesde, setRangoDesde] = useState('');
  const [rangoHasta, setRangoHasta] = useState('');
  const [rangoAplicado, setRangoAplicado] = useState<{ desde: string; hasta: string } | null>(null);
  const [selectedOrden, setSelectedOrden] = useState<OrdenServicio | null>(null);
  const [showWizardCierre, setShowWizardCierre] = useState(false);
  const [showNotaModal, setShowNotaModal] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [notaNueva, setNotaNueva] = useState('');
  const [precioSugerido, setPrecioSugerido] = useState('');
  const [saving, setSaving] = useState(false);
  const [nuevaCitaBadge, setNuevaCitaBadge] = useState(false);
  const [previousCount, setPreviousCount] = useState<number | null>(null);
  const [compartiendoGPS, setCompartiendoGPS] = useState(false);

  // Permisos del técnico (con fallback seguro)
  const permisos: TecnicoPermisos = userProfile?.permisos || PERMISOS_DEFAULT_TECNICO;

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const data = snap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>));
      setOrdenes(data);
      setLoading(false);

      // Detect new assignments
      if (permisos.recibeNotificacionNuevaCita && previousCount !== null) {
        const myOrdersCount = data.filter(o => esOrdenMia(o)).length;
        if (myOrdersCount > previousCount) {
          setNuevaCitaBadge(true);
          toast.success('📅 Nueva cita asignada');
        }
      }
      setPreviousCount(data.filter(o => esOrdenMia(o)).length);
    });

    getDocs(collection(db, 'clientes')).then(snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)));
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id]);

  // Auto-compartir ubicación cuando hay órdenes con tracking GPS activo
  useEffect(() => {
    if (!userProfile?.id) return;

    // Verificar si hay alguna orden asignada al técnico con tracking habilitado
    const tieneTrackingActivo = ordenes.some(o =>
      (o.tecnicoId === userProfile.id || o.tecnicoNombre === userProfile.nombre) &&
      o.trackingGPS?.habilitado &&
      !['cerrado', 'cancelado', 'trabajo_realizado'].includes(o.fase)
    );

    if (!tieneTrackingActivo) {
      setCompartiendoGPS(false);
      return;
    }

    if (!navigator.geolocation) return;
    setCompartiendoGPS(true);

    const vehiculoId = userProfile.id;
    let lastSave = 0;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        // Throttle: max every 30 seconds
        if (now - lastSave < 30000) return;
        lastSave = now;

        try {
          await guardarUbicacionVehiculo({
            vehiculoId,
            tecnicoId: userProfile.id,
            tecnicoNombre: userProfile.nombre,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            velocidad: (pos.coords.speed || 0) * 3.6, // m/s → km/h
            rumbo: pos.coords.heading || 0,
            timestamp: new Date(),
            enMovimiento: (pos.coords.speed || 0) > 0.5,
          });
        } catch (err) {
          console.error('Error sharing GPS:', err);
        }
      },
      (err) => console.warn('GPS watchPosition error:', err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setCompartiendoGPS(false);
    };
  }, [ordenes, userProfile?.id, userProfile?.nombre]);

  const esOrdenMia = (orden: OrdenServicio): boolean => {
    if (!userProfile) return false;
    // Matching by name or id
    return (
      orden.tecnicoId === userProfile.id ||
      orden.tecnicoNombre === userProfile.nombre ||
      orden.tecnicoNombre?.includes(userProfile.nombre.split(' ')[0]) === true
    );
  };

  const getRangoFechas = (v: VistaTab): { start: Date; end: Date } => {
    const now = new Date();
    if (v === 'hoy') return { start: new Date(now.setHours(0, 0, 0, 0)), end: new Date(new Date().setHours(23, 59, 59, 999)) };
    if (v === 'semana') return { start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) };
    if (v === 'rango' && rangoAplicado) {
      const start = new Date(`${rangoAplicado.desde}T00:00:00`);
      const end = new Date(`${rangoAplicado.hasta}T23:59:59`);
      return { start, end };
    }
    return { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
  };

  const handleAplicarRango = () => {
    if (!rangoDesde || !rangoHasta) {
      toast.error('Selecciona ambas fechas');
      return;
    }
    if (rangoDesde > rangoHasta) {
      toast.error('La fecha "desde" debe ser anterior a "hasta"');
      return;
    }
    setRangoAplicado({ desde: rangoDesde, hasta: rangoHasta });
  };

  const citasFiltradas = useMemo(() => {
    const { start, end } = getRangoFechas(vista);
    return ordenes
      .filter(o => {
        if (permisos.soloPropiasCitas && !esOrdenMia(o)) return false;
        if (o.estado === 'cancelado') return false;
        if (!o.fechaCita) return false;
        return o.fechaCita >= start && o.fechaCita <= end;
      })
      .sort((a, b) => (a.fechaCita?.getTime() || 0) - (b.fechaCita?.getTime() || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, vista, permisos.soloPropiasCitas, userProfile?.id, rangoAplicado]);

  const citasHoy = useMemo(() => {
    return ordenes.filter(o => o.fechaCita && isSameDay(o.fechaCita, new Date()) && o.estado !== 'cancelado' && (!permisos.soloPropiasCitas || esOrdenMia(o)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, permisos.soloPropiasCitas, userProfile?.id]);

  const getClienteUbicacion = (orden: OrdenServicio) => {
    const c = clientes.find(cl => cl.id === orden.clienteId);
    return c?.lat && c?.lng ? { lat: c.lat, lng: c.lng, direccion: c.direccion || orden.clienteDireccion || '' } : null;
  };

  const marcadoresMapaRaw = useMemo(() => {
    return citasFiltradas
      .map(o => {
        const ubi = getClienteUbicacion(o);
        return ubi ? { ...o, ...ubi } : null;
      })
      .filter((m): m is OrdenServicio & { lat: number; lng: number; direccion: string } => m !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citasFiltradas, clientes]);

  // Ruta optimizada (nearest neighbor)
  const rutaOptimizada = useMemo(() => {
    if (marcadoresMapaRaw.length < 2) {
      return marcadoresMapaRaw.map((m, i) => ({ ...m, orden: i + 1 }));
    }
    const optimized = optimizarRuta(marcadoresMapaRaw);
    return optimized.map((m, i) => ({ ...m, orden: i + 1 }));
  }, [marcadoresMapaRaw]);

  // Compatibility alias para código existente
  const marcadoresMapa = rutaOptimizada;

  const openCompletar = (orden: OrdenServicio) => {
    setSelectedOrden(orden);
    setShowWizardCierre(true);
  };

  const openNota = (orden: OrdenServicio) => {
    setSelectedOrden(orden);
    setNotaNueva('');
    setPrecioSugerido('');
    setShowNotaModal(true);
  };

  const handleAgregarNota = async () => {
    if (!selectedOrden || !notaNueva.trim()) {
      toast.error('Escribe la nota');
      return;
    }
    setSaving(true);
    try {
      const notasExistentes = selectedOrden.notasTecnico || '';
      const timestamp = format(new Date(), "dd/MM HH:mm");
      const nuevaNota = `[${timestamp} - ${userProfile?.nombre}] ${notaNueva}`;
      const notasActualizadas = notasExistentes ? `${notasExistentes}\n${nuevaNota}` : nuevaNota;

      const usuario = userProfile?.nombre || 'Técnico';
      const registros: Record<string, unknown>[] = [];
      registros.push(crearRegistroAuditoria(
        usuario, 'nota_tecnico', `Agregó nota técnica: "${notaNueva.slice(0, 60)}${notaNueva.length > 60 ? '...' : ''}"`
      ));

      const updateData: Record<string, unknown> = {
        notasTecnico: notasActualizadas,
        updatedAt: Timestamp.now(),
      };
      if (precioSugerido && !isNaN(Number(precioSugerido))) {
        const precioAnterior = selectedOrden.precioSugerido;
        updateData.precioSugerido = Number(precioSugerido);
        registros.push(crearRegistroAuditoria(
          usuario, 'precio_sugerido', `Sugirió precio: RD$ ${Number(precioSugerido).toLocaleString('es-DO')}`,
          'precioSugerido',
          precioAnterior !== undefined ? `RD$ ${precioAnterior.toLocaleString('es-DO')}` : '',
          `RD$ ${Number(precioSugerido).toLocaleString('es-DO')}`
        ));
      }

      updateData.auditoria = arrayUnion(...registros);

      await updateDoc(doc(db, 'ordenes_servicio', selectedOrden.id), updateData);
      toast.success('Nota agregada');
      setShowNotaModal(false);
      setSelectedOrden(null);
      setPrecioSugerido('');
    } catch {
      toast.error('Error al agregar nota');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const getTelefonoMostrado = (tel: string | undefined): string => {
    if (!tel) return '';
    if (permisos.verTelefonoCliente) return formatTelefono(tel);
    return '●●●-●●●-●●●●';
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando citas..." />;

  const hoy = new Date();
  const nombreCorto = userProfile?.nombre?.split(' ')[0] || 'Técnico';

  return (
    <div className="min-h-screen bg-[#f0f4f8]">
      {/* Header */}
      <div className="bg-[#0f3460] px-4 py-3 sticky top-0 z-20 shadow-md">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Logo size="sm" white />
          <div className="flex items-center gap-2">
            {compartiendoGPS && (
              <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full" title="Compartiendo ubicación">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                <span className="text-[10px] text-green-200 hidden sm:inline">🛰️ Ubicación activa</span>
              </div>
            )}
            {nuevaCitaBadge && permisos.recibeNotificacionNuevaCita && (
              <button onClick={() => setNuevaCitaBadge(false)} className="relative p-2 text-white">
                <Bell size={18} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              </button>
            )}
            {permisos.verUbicacionGPS && marcadoresMapa.length > 0 && (
              <button onClick={() => setShowMap(!showMap)}
                className="bg-white/20 p-2 rounded-lg text-white hover:bg-white/30" title="Mapa">
                <Navigation size={18} />
              </button>
            )}
            <button onClick={handleLogout} className="bg-white/20 p-2 rounded-lg text-white hover:bg-white/30" title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Greeting */}
        <div className="text-center">
          <p className="text-xs text-gray-500 capitalize">
            📅 {format(hoy, "EEEE, dd 'de' MMMM yyyy", { locale: es })}
          </p>
          <h1 className="text-lg font-bold text-[#0f3460] mt-1">
            Buenos días, {nombreCorto} 👋
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{citasFiltradas.length} citas</p>
          {permisos.verUbicacionGPS && marcadoresMapa.length > 0 && (
            <button
              onClick={() => setShowMap(!showMap)}
              className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-xl text-xs font-medium transition-colors"
            >
              <Navigation size={14} />
              {showMap ? 'Ocultar mapa' : '🗺️ Ver Ruta del Día'}
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">{marcadoresMapa.length}</span>
            </button>
          )}
        </div>

        {/* Tabs selector */}
        {permisos.vistaAgenda !== 'dia' && (
          <div className="space-y-3">
            <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100 max-w-md mx-auto">
              <button onClick={() => setVista('hoy')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${vista === 'hoy' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
                Hoy
              </button>
              {(permisos.vistaAgenda === 'semana' || permisos.vistaAgenda === 'mes') && (
                <button onClick={() => setVista('semana')}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${vista === 'semana' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
                  Esta Semana
                </button>
              )}
              {permisos.vistaAgenda === 'mes' && (
                <button onClick={() => setVista('mes')}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${vista === 'mes' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
                  Este Mes
                </button>
              )}
              <button onClick={() => setVista('rango')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${vista === 'rango' ? 'bg-[#0f3460] text-white' : 'text-gray-600'}`}>
                📅 Rango
              </button>
            </div>

            {vista === 'rango' && (
              <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 max-w-md mx-auto space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Desde</label>
                    <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Hasta</label>
                    <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  </div>
                </div>
                <button onClick={handleAplicarRango}
                  className="w-full py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-xs font-medium transition-colors">
                  Buscar
                </button>
                {rangoAplicado && (
                  <p className="text-[10px] text-center text-gray-500">
                    Mostrando: {rangoAplicado.desde} → {rangoAplicado.hasta}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mapa de Ruta del Día */}
        {showMap && permisos.verUbicacionGPS && (
          <div className="space-y-2">
            {marcadoresMapa.length > 0 ? (
              <>
                <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100" style={{ height: '320px' }}>
                  <MapContainer
                    center={[marcadoresMapa[0].lat, marcadoresMapa[0].lng]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {marcadoresMapa.map(m => (
                      <Marker key={m.id} position={[m.lat, m.lng]} icon={crearPinNumerado(m.orden)}>
                        <Popup>
                          <div className="text-sm">
                            <p className="font-semibold">{m.orden}. {m.clienteNombre}</p>
                            <p>🕐 {formatHora(m.fechaCita)}</p>
                            <p className="text-xs text-gray-600">{m.direccion}</p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {marcadoresMapa.length >= 2 && (
                      <Polyline
                        positions={marcadoresMapa.map(m => [m.lat, m.lng] as [number, number])}
                        pathOptions={{ color: '#1a5fa8', weight: 3, opacity: 0.8, dashArray: '10 5' }}
                      />
                    )}
                  </MapContainer>
                </div>

                {/* Panel inferior compacto con paradas en orden */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                    <Navigation size={12} /> Ruta optimizada · {marcadoresMapa.length} paradas
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {marcadoresMapa.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <div className="w-6 h-6 rounded-full bg-[#1a5fa8] text-white flex items-center justify-center font-bold flex-shrink-0">
                          {m.orden}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{m.clienteNombre}</p>
                          <p className="text-[10px] text-gray-500">{formatHora(m.fechaCita)} · {m.equipoTipo}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Citas sin coordenadas */}
                  {citasFiltradas.length > marcadoresMapa.length && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-[10px] text-orange-600 mb-1">⚠️ Citas sin GPS (no aparecen en el mapa):</p>
                      {citasFiltradas
                        .filter(o => !getClienteUbicacion(o))
                        .map(o => (
                          <div key={o.id} className="text-[10px] text-gray-600 truncate">
                            • {o.clienteNombre} — {formatHora(o.fechaCita)}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
                <MapPin size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Sin citas con ubicación GPS en este período</p>
              </div>
            )}
          </div>
        )}

        {/* Lista citas */}
        {citasFiltradas.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Clock size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400">Sin citas en este período</p>
          </div>
        ) : (
          <div className="space-y-3">
            {citasFiltradas.map(orden => {
              const ubi = getClienteUbicacion(orden);
              const completado = orden.fase === 'trabajo_realizado' || orden.fase === 'cerrado';
              return (
                <div key={orden.id}
                  className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${completado ? 'opacity-60' : ''}`}>
                  <div className="p-4">
                    {/* Hora */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <Clock size={12} />
                      <span>{formatHora(orden.fechaCita)}
                        {orden.duracionMin ? ` — ${orden.duracionMin} min` : ''}</span>
                      <span className="ml-auto">
                        <Badge fase={orden.fase} />
                      </span>
                    </div>

                    {/* Equipo */}
                    <h3 className="text-base font-semibold text-gray-900">
                      {orden.equipoTipo}{orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
                    </h3>
                    {orden.descripcionFalla && (
                      <p className="text-xs text-gray-600 mt-1"><strong>Falla:</strong> {orden.descripcionFalla}</p>
                    )}

                    {/* Dirección (siempre visible) */}
                    {(orden.clienteDireccion || ubi) && (
                      <div className="mt-3 flex items-start gap-2">
                        <MapPin size={14} className="text-[#1a5fa8] mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-700 flex-1">{orden.clienteDireccion || ubi?.direccion}</p>
                      </div>
                    )}

                    {/* Cliente */}
                    <div className="mt-3 flex items-center gap-2">
                      <User size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-800">{orden.clienteNombre}</span>
                    </div>

                    {/* Teléfono condicional */}
                    {orden.clienteTelefono && (
                      <div className="mt-1 flex items-center gap-2">
                        <Phone size={12} className="text-gray-400" />
                        <span className={`text-xs ${permisos.verTelefonoCliente ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                          {getTelefonoMostrado(orden.clienteTelefono)}
                        </span>
                      </div>
                    )}

                    {/* Notas técnico previas */}
                    {orden.notasTecnico && (
                      <div className="mt-2 bg-blue-50 rounded-lg p-2 text-xs text-blue-800 border border-blue-100">
                        <span className="font-medium">🔧 Mis notas:</span>
                        <span className="ml-1 whitespace-pre-line">
                          {orden.notasTecnico.length > 100 ? orden.notasTecnico.substring(0, 100) + '...' : orden.notasTecnico}
                        </span>
                      </div>
                    )}
                    {orden.precioSugerido !== undefined && orden.precioSugerido !== null && (
                      <div className="mt-1 bg-green-50 rounded-lg p-2 text-xs text-green-800 border border-green-100">
                        <span className="font-medium">💰 Mi precio:</span>
                        <span className="ml-1 font-bold">RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {/* Estado de aprobación de precio */}
                    {orden.precioSugerido !== undefined && (
                      orden.estadoAprobacion === 'aprobado' && orden.precioFinal !== undefined ? (
                        <div className="mt-1 bg-emerald-50 rounded-lg p-2 text-xs text-emerald-800 border border-emerald-200">
                          ✅ <span className="font-medium">Precio aprobado:</span>{' '}
                          <span className="font-bold">RD$ {Number(orden.precioFinal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ) : (
                        <div className="mt-1 bg-yellow-50 rounded-lg p-2 text-xs text-yellow-800 border border-yellow-200">
                          ⏳ <span className="font-medium">Precio pendiente de aprobación</span>
                        </div>
                      )
                    )}

                    {/* Estado */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estadoSimpleColor(orden.estadoSimple)}`}>
                        {estadoSimpleLabel(orden.estadoSimple)}
                      </span>
                    </div>

                    {/* Actions */}
                    {!completado && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {permisos.puedeMarcarCompletado && (() => {
                          const necesitaAprobacion =
                            orden.precioSugerido !== undefined &&
                            orden.estadoAprobacion !== 'aprobado';
                          if (necesitaAprobacion) {
                            return (
                              <div className="w-full bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-800 flex items-center gap-1">
                                ⏳ Esperando aprobación del precio por operaciones
                              </div>
                            );
                          }
                          return (
                            <button onClick={() => openCompletar(orden)}
                              className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium">
                              <CheckCircle size={12} /> Marcar Realizado
                            </button>
                          );
                        })()}
                        {permisos.puedeAgregarNotas && (
                          <button onClick={() => openNota(orden)}
                            className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium">
                            <StickyNote size={12} /> Agregar Nota
                          </button>
                        )}
                        {permisos.verUbicacionGPS && ubi && (
                          <a href={googleMapsLink(ubi.lat, ubi.lng)} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium">
                            <Navigation size={12} /> Ver en Maps
                          </a>
                        )}
                        {permisos.puedeContactarCliente && orden.clienteTelefono && (
                          <a href={whatsappUrl(orden.clienteTelefono, mensajesWhatsApp.recordatorioCita(orden.clienteNombre, format(orden.fechaCita || new Date(), "dd/MM/yyyy"), formatHora(orden.fechaCita)))}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium">
                            <MessageSquare size={12} /> WhatsApp
                          </a>
                        )}
                        <button onClick={() => setSelectedOrden(orden)}
                          className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium ml-auto">
                          <Eye size={12} /> Ver detalle
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wizard de cierre de servicio */}
      {selectedOrden && showWizardCierre && (
        <CierreServicioWizard
          isOpen={showWizardCierre}
          onClose={() => { setShowWizardCierre(false); }}
          orden={selectedOrden}
          tecnicoId={userProfile?.id || ''}
          tecnicoNombre={userProfile?.nombre || 'Técnico'}
          clienteLat={getClienteUbicacion(selectedOrden)?.lat}
          clienteLng={getClienteUbicacion(selectedOrden)?.lng}
          onClosed={() => setSelectedOrden(null)}
        />
      )}

      {/* Modal Nota */}
      <Modal isOpen={showNotaModal} onClose={() => setShowNotaModal(false)} title="Agregar nota técnica">
        <div className="space-y-4">
          {selectedOrden && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <p className="font-semibold">{selectedOrden.clienteNombre}</p>
              <p>{selectedOrden.equipoTipo} · {selectedOrden.equipoMarca}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nota técnica *</label>
            <textarea value={notaNueva} onChange={e => setNotaNueva(e.target.value)}
              rows={4} placeholder="Escribe tu nota técnica..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio sugerido (RD$)</label>
            <input
              type="number"
              value={precioSugerido}
              onChange={e => setPrecioSugerido(e.target.value)}
              placeholder="Ej: 3500"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[11px] text-gray-400 mt-1">Precio que sugieres para este trabajo (opcional)</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowNotaModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={handleAgregarNota} disabled={saving}
              className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Guardar Nota'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal detalle */}
      {selectedOrden && !showWizardCierre && !showNotaModal && (
        <Modal isOpen={true} onClose={() => setSelectedOrden(null)} title={`Detalle · ${selectedOrden.numero || ''}`} size="md">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Hora</p>
              <p className="font-semibold">{formatHora(selectedOrden.fechaCita)} ({selectedOrden.duracionMin || 60} min)</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Equipo</p>
              <p className="font-semibold">{selectedOrden.equipoTipo} · {selectedOrden.equipoMarca}</p>
              {selectedOrden.equipoModelo && <p className="text-xs text-gray-600">Modelo: {selectedOrden.equipoModelo}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-500">Falla reportada</p>
              <p>{selectedOrden.descripcionFalla}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cliente</p>
              <p className="font-semibold">{selectedOrden.clienteNombre}</p>
              <p className="text-xs">{getTelefonoMostrado(selectedOrden.clienteTelefono)}</p>
            </div>
            {selectedOrden.clienteDireccion && (
              <div>
                <p className="text-xs text-gray-500">Dirección</p>
                <p>{selectedOrden.clienteDireccion}</p>
                {getClienteUbicacion(selectedOrden) && (
                  <a href={googleMapsLink(getClienteUbicacion(selectedOrden)!.lat, getClienteUbicacion(selectedOrden)!.lng)}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#1a5fa8] mt-1">
                    <Navigation size={10} /> Abrir en Google Maps
                  </a>
                )}
              </div>
            )}

            {selectedOrden.notasTecnico && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                  🔧 Mis Notas
                </p>
                <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                  <p className="text-xs text-blue-800 whitespace-pre-line">{selectedOrden.notasTecnico}</p>
                </div>
              </div>
            )}

            {selectedOrden.precioSugerido !== undefined && selectedOrden.precioSugerido !== null && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">💰 Mi Precio Sugerido</p>
                <p className="text-sm font-bold text-green-700 bg-green-50 rounded-lg p-2 border border-green-200">
                  RD$ {Number(selectedOrden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500">Estado</p>
              <Badge fase={selectedOrden.fase} />
            </div>

            {permisos.puedeVerHistorial && selectedOrden.historialFases.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                  <History size={12} /> Historial
                </p>
                <div className="space-y-2">
                  {selectedOrden.historialFases.map((h, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{faseLabel(h.fase)}</span> · {formatFecha(h.timestamp)} · {h.usuario}
                      {h.nota && <p className="italic text-gray-600 mt-0.5">{h.nota}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setSelectedOrden(null)}
                className="flex-1 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                Cerrar
              </button>
              {permisos.puedeMarcarCompletado && selectedOrden.fase !== 'trabajo_realizado' && selectedOrden.fase !== 'cerrado' && (
                <button onClick={() => setShowWizardCierre(true)}
                  className="flex-1 px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-1">
                  <CheckCircle size={14} /> Cerrar Servicio
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
