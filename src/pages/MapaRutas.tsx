import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, getDocs, doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal, Cliente, FaseOrden } from '../types';
import { getTecnicoColor, formatHora, faseLabel, formatFecha, formatTelefono, parseOrden, HORARIOS, HORARIOS_LABEL, crearRegistroAuditoria } from '../utils';
import { optimizarRuta, distanciaTotalRuta } from '../utils/rutas';
import { whatsappUrl, mensajesWhatsApp } from '../utils/whatsapp';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { MapPin, Navigation, Route, Clock, Phone, MessageCircle, Satellite, Truck, WifiOff, Edit2, AlertTriangle, Save, User } from 'lucide-react';
import { suscribirTodasUbicaciones } from '../services/gps.service';
import { UbicacionVehiculo } from '../types';
import { formatDistanceToNow, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, isSameDay } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';

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
  numero: string;
  lat: number;
  lng: number;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string;
  equipoTipo: string;
  equipoMarca?: string;
  equipoModelo?: string;
  tecnicoId?: string;
  tecnicoNombre: string;
  fase: FaseOrden;
  fechaCita: Date | null;
  orden: number; // position in optimized route
}

export default function MapaRutas() {
  const { userProfile } = useApp();
  const puedeEditar =
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora' ||
    userProfile?.rol === 'operaria';

  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [fechaInicio, setFechaInicio] = useState<string>(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [fechaFin, setFechaFin] = useState<string>(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [rutaOptimizada, setRutaOptimizada] = useState(true);
  const [tab, setTab] = useState<'rutas' | 'gps_vivo'>('rutas');
  const [ubicacionesLive, setUbicacionesLive] = useState<UbicacionVehiculo[]>([]);

  // Edición desde pin
  const [editingOrden, setEditingOrden] = useState<OrdenServicio | null>(null);
  const [editForm, setEditForm] = useState({
    tecnicoId: '',
    tecnicoNombre: '',
    fechaCita: '',
    horaInicio: '',
    notas: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

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

  // Resolución de ubicación por orden: prefiere coords en la orden, fallback al cliente
  const getUbicacionDeOrden = (o: OrdenServicio) => {
    if (
      typeof o.clienteLat === 'number' &&
      typeof o.clienteLng === 'number' &&
      !isNaN(o.clienteLat) && !isNaN(o.clienteLng) &&
      o.clienteLat !== 0 && o.clienteLng !== 0
    ) {
      return { lat: o.clienteLat, lng: o.clienteLng, direccion: o.clienteDireccion || '' };
    }
    const c = clientes.find(cl => cl.id === o.clienteId);
    if (
      c &&
      typeof c.lat === 'number' && typeof c.lng === 'number' &&
      !isNaN(c.lat) && !isNaN(c.lng) &&
      c.lat !== 0 && c.lng !== 0
    ) {
      return { lat: c.lat, lng: c.lng, direccion: c.direccion || o.clienteDireccion || '' };
    }
    return null;
  };

  // Filtro robusto: rango de fechas, fase activa, técnico (por id o nombre case-insensitive)
  const ordenesFiltradas = useMemo(() => {
    const inicio = fechaInicio ? startOfDay(new Date(fechaInicio + 'T00:00:00')) : null;
    const fin = fechaFin ? endOfDay(new Date(fechaFin + 'T00:00:00')) : null;
    const nombreFiltro = filtroTecnico
      ? (personal.find(p => p.id === filtroTecnico)?.nombre?.toLowerCase().trim() || '')
      : '';

    return ordenes.filter(o => {
      // Excluir cerrado/cancelado
      if (['cerrado', 'cancelado'].includes(o.fase)) return false;
      if (!o.fechaCita) return false;
      if (inicio && o.fechaCita < inicio) return false;
      if (fin && o.fechaCita > fin) return false;
      if (filtroTecnico) {
        const matchId = o.tecnicoId === filtroTecnico;
        const nombreOrden = o.tecnicoNombre?.toLowerCase().trim() || '';
        const matchNombre = nombreFiltro !== '' && nombreOrden === nombreFiltro;
        if (!matchId && !matchNombre) return false;
      }
      return true;
    });
  }, [ordenes, fechaInicio, fechaFin, filtroTecnico, personal]);

  // Construye marcadores usando coords de la orden o fallback al cliente
  const marcadoresRaw = useMemo(() => {
    return ordenesFiltradas
      .map(o => {
        const ubi = getUbicacionDeOrden(o);
        if (!ubi) return null;
        return {
          id: o.id,
          numero: o.numero || '',
          lat: ubi.lat,
          lng: ubi.lng,
          clienteNombre: o.clienteNombre,
          clienteTelefono: o.clienteTelefono || '',
          direccion: ubi.direccion,
          equipoTipo: o.equipoTipo,
          equipoMarca: o.equipoMarca,
          equipoModelo: o.equipoModelo,
          tecnicoId: o.tecnicoId,
          tecnicoNombre: o.tecnicoNombre || 'Sin asignar',
          fase: o.fase,
          fechaCita: o.fechaCita || null,
          orden: 0,
        } as MarcadorConRuta;
      })
      .filter((m): m is MarcadorConRuta => m !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenesFiltradas, clientes]);

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

      const color = personal.find(p => p.nombre === nombre)?.color || getTecnicoColor(nombre);
      allPolylines.push({
        nombre,
        positions: optimized.map(m => [m.lat, m.lng] as [number, number]),
        color,
      });
      allDistancias[nombre] = distanciaTotalRuta(optimized);
    });

    return { marcadores: allMarcadores, polylines: allPolylines, distancias: allDistancias };
  }, [marcadoresRaw, rutaOptimizada, personal]);

  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);

  // Cantidad de órdenes por técnico activas en el rango (para la leyenda)
  const cantidadPorTecnico = useMemo(() => {
    const conteo: Record<string, number> = {};
    ordenesFiltradas.forEach(o => {
      const key = o.tecnicoNombre || 'Sin asignar';
      conteo[key] = (conteo[key] || 0) + 1;
    });
    return conteo;
  }, [ordenesFiltradas]);

  // Quick-range helpers
  const setRangoHoy = () => {
    const hoy = format(startOfDay(new Date()), 'yyyy-MM-dd');
    setFechaInicio(hoy);
    setFechaFin(hoy);
  };
  const setRangoSemana = () => {
    const ini = startOfWeek(new Date(), { weekStartsOn: 1 });
    const fin = endOfWeek(new Date(), { weekStartsOn: 1 });
    setFechaInicio(format(ini, 'yyyy-MM-dd'));
    setFechaFin(format(fin, 'yyyy-MM-dd'));
  };
  const setRangoMes = () => {
    const ini = startOfMonth(new Date());
    const fin = endOfMonth(new Date());
    setFechaInicio(format(ini, 'yyyy-MM-dd'));
    setFechaFin(format(fin, 'yyyy-MM-dd'));
  };
  const setRangoUltimos30 = () => {
    const fin = startOfDay(new Date());
    const ini = subDays(fin, 30);
    setFechaInicio(format(ini, 'yyyy-MM-dd'));
    setFechaFin(format(fin, 'yyyy-MM-dd'));
  };

  // Horarios ya ocupados por el técnico seleccionado al editar (excluye la orden en edición)
  const horariosOcupadosEdit = useMemo(() => {
    if (!editingOrden || !editForm.tecnicoId || !editForm.fechaCita) return [];
    const fechaSeleccionada = new Date(editForm.fechaCita + 'T00:00:00');
    return ordenes
      .filter(o =>
        o.id !== editingOrden.id &&
        (o.tecnicoId === editForm.tecnicoId || o.tecnicoNombre === editForm.tecnicoNombre) &&
        o.fechaCita &&
        isSameDay(o.fechaCita, fechaSeleccionada) &&
        o.fase !== 'cancelado' &&
        o.fase !== 'cerrado'
      )
      .map(o => o.fechaCita ? format(o.fechaCita, 'HH:00') : '');
  }, [editingOrden, editForm.tecnicoId, editForm.tecnicoNombre, editForm.fechaCita, ordenes]);

  const abrirEditarDesdePin = (ordenId: string) => {
    const o = ordenes.find(x => x.id === ordenId);
    if (!o) return;
    setEditingOrden(o);
    setEditForm({
      tecnicoId: o.tecnicoId || '',
      tecnicoNombre: o.tecnicoNombre || '',
      fechaCita: o.fechaCita ? format(o.fechaCita, 'yyyy-MM-dd') : '',
      horaInicio: o.fechaCita ? format(o.fechaCita, 'HH:00') : '',
      notas: o.notas || '',
    });
  };

  const cerrarEdit = () => {
    setEditingOrden(null);
    setEditForm({ tecnicoId: '', tecnicoNombre: '', fechaCita: '', horaInicio: '', notas: '' });
    setSavingEdit(false);
  };

  const handleGuardarEditDesdeMapa = async () => {
    if (!editingOrden) return;
    // Validación defensiva de horario ocupado
    if (editForm.tecnicoId && editForm.fechaCita && editForm.horaInicio &&
        horariosOcupadosEdit.includes(editForm.horaInicio)) {
      toast.error('Ese horario ya está ocupado por el técnico seleccionado');
      return;
    }
    setSavingEdit(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      let fechaCitaTs: Timestamp | null = null;
      if (editForm.fechaCita && editForm.horaInicio) {
        fechaCitaTs = Timestamp.fromDate(new Date(`${editForm.fechaCita}T${editForm.horaInicio}:00`));
      } else if (editForm.fechaCita) {
        fechaCitaTs = Timestamp.fromDate(new Date(`${editForm.fechaCita}T08:00:00`));
      }
      // Re-derivar operaria si cambió el técnico
      const tecnicoElegido = personal.find(p => p.id === editForm.tecnicoId);
      const registros: Record<string, unknown>[] = [];
      if (editForm.tecnicoNombre !== (editingOrden.tecnicoNombre || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambio técnico asignado desde mapa', 'tecnicoNombre',
          editingOrden.tecnicoNombre || 'Sin asignar',
          editForm.tecnicoNombre || 'Sin asignar'
        ));
      }
      const fechaAnterior = editingOrden.fechaCita ? format(editingOrden.fechaCita, 'yyyy-MM-dd HH:00') : '';
      const fechaNueva = editForm.fechaCita ? `${editForm.fechaCita} ${editForm.horaInicio || '08:00'}` : '';
      if (fechaAnterior !== fechaNueva) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambio fecha/hora desde mapa', 'fechaCita',
          fechaAnterior, fechaNueva
        ));
      }
      if ((editForm.notas || '') !== (editingOrden.notas || '')) {
        registros.push(crearRegistroAuditoria(usuario, 'editar', 'Modificó notas desde mapa', 'notas'));
      }
      const updateData: Record<string, unknown> = {
        tecnicoId: editForm.tecnicoId,
        tecnicoNombre: editForm.tecnicoNombre,
        operariaId: tecnicoElegido?.operariaId || null,
        operariaNombre: tecnicoElegido?.operariaNombre || null,
        fechaCita: fechaCitaTs,
        notas: editForm.notas || '',
        updatedAt: Timestamp.now(),
      };
      if (registros.length > 0) updateData.auditoria = arrayUnion(...registros);
      await updateDoc(doc(db, 'ordenes_servicio', editingOrden.id), updateData);
      toast.success('Orden actualizada');
      cerrarEdit();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar cambios');
    } finally {
      setSavingEdit(false);
    }
  };

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
          <div className="flex items-center gap-1">
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="">Todos los técnicos</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <button onClick={() => setRutaOptimizada(!rutaOptimizada)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              rutaOptimizada ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600'
            }`}>
            <Route size={14} /> {rutaOptimizada ? 'Ruta Optimizada' : 'Orden Cronológico'}
          </button>
        </div>
      </div>

      {/* Quick range buttons + counter */}
      {tab === 'rutas' && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={setRangoHoy}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              Hoy
            </button>
            <button onClick={setRangoSemana}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              Esta semana
            </button>
            <button onClick={setRangoMes}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              Este mes
            </button>
            <button onClick={setRangoUltimos30}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
              Últimos 30
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">
              {ordenesFiltradas.length} orden{ordenesFiltradas.length !== 1 ? 'es' : ''} en el rango
            </span>
            {ordenesFiltradas.length > 100 && (
              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 flex items-center gap-1">
                <AlertTriangle size={10} />
                El mapa puede verse saturado. Considera filtrar por técnico.
              </span>
            )}
          </div>
        </div>
      )}

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
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative" style={{ height: '70vh' }}>
          <MapContainer
            center={marcadores.length > 0 ? [marcadores[0].lat, marcadores[0].lng] : [18.48, -69.93]}
            zoom={marcadores.length > 0 ? 13 : 12}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {marcadores.map(m => {
              const color = personal.find(p => p.id === m.tecnicoId)?.color || getTecnicoColor(m.tecnicoNombre);
              const fechaTexto = m.fechaCita ? format(m.fechaCita, 'yyyy-MM-dd') : '';
              return (
                <Marker
                  key={m.id}
                  position={[m.lat, m.lng]}
                  icon={crearPinSVG(color, m.orden)}
                >
                  <Popup>
                    <div className="text-sm min-w-[220px]">
                      <p className="font-bold text-base">{m.numero || `#${m.orden}`} · {m.clienteNombre}</p>
                      <p className="text-gray-600 mt-1">{m.direccion}</p>
                      <p className="text-gray-600 text-xs mt-1">
                        {m.equipoTipo}
                        {m.equipoMarca ? ` · ${m.equipoMarca}` : ''}
                        {m.equipoModelo ? ` ${m.equipoModelo}` : ''}
                      </p>
                      <p className="text-gray-600 text-xs">Fase: {faseLabel(m.fase)}</p>
                      <p className="text-gray-600 text-xs">Técnico: {m.tecnicoNombre}</p>
                      <div className="flex items-center gap-1 text-gray-600 text-xs">
                        <Clock size={11} /> {m.fechaCita ? formatFecha(m.fechaCita) : '—'}
                      </div>
                      {m.clienteTelefono && (
                        <div className="flex gap-2 mt-2">
                          <a href={`tel:${m.clienteTelefono}`} className="text-blue-600 text-xs flex items-center gap-1">
                            <Phone size={10} /> {formatTelefono(m.clienteTelefono)}
                          </a>
                          <a href={whatsappUrl(m.clienteTelefono, mensajesWhatsApp.recordatorioCita(m.clienteNombre, fechaTexto, m.fechaCita ? formatHora(m.fechaCita) : ''))}
                            target="_blank" rel="noreferrer"
                            className="text-green-600 text-xs flex items-center gap-1">
                            <MessageCircle size={10} /> WhatsApp
                          </a>
                        </div>
                      )}
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => abrirEditarDesdePin(m.id)}
                          className="mt-3 w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-[#1a5fa8] hover:bg-[#0f3460] text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <Edit2 size={11} /> Editar orden
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {polylines.map(pl => (
              <Polyline key={pl.nombre} positions={pl.positions}
                pathOptions={{ color: pl.color, weight: 3, opacity: 0.8, dashArray: rutaOptimizada ? undefined : '8 4' }} />
            ))}
          </MapContainer>
          {marcadores.length === 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-md text-xs text-gray-600 flex items-center gap-2">
              <MapPin size={12} />
              Sin órdenes en este rango
            </div>
          )}
        </div>

        {/* Side panel: route list */}
        <div className="lg:w-80 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Navigation size={16} className="text-[#1a5fa8]" />
              <span className="text-sm font-semibold text-gray-900">
                {ordenesFiltradas.length} órdenes · {marcadores.length} en mapa
              </span>
            </div>
            {/* Distance info */}
            {Object.entries(distancias).map(([nombre, km]) => (
              <div key={nombre} className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: personal.find(p => p.nombre === nombre)?.color || getTecnicoColor(nombre) }} />
                <span>{nombre}: {km.toFixed(1)} km</span>
              </div>
            ))}
          </div>

          {/* Ordered list */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden max-h-[55vh] overflow-y-auto">
            {marcadores.slice().sort((a, b) => a.orden - b.orden).map(m => {
              const color = personal.find(p => p.id === m.tecnicoId)?.color || getTecnicoColor(m.tecnicoNombre);
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: color }}>
                    {m.orden}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.clienteNombre}</p>
                    <p className="text-xs text-gray-500 truncate">{m.equipoTipo} · {m.fechaCita ? formatHora(m.fechaCita) : '—'}</p>
                    <p className="text-xs text-gray-400 truncate">{m.direccion}</p>
                  </div>
                  {puedeEditar && (
                    <button
                      onClick={() => abrirEditarDesdePin(m.id)}
                      title="Editar orden"
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-[#1a5fa8] transition-colors shrink-0"
                    >
                      <Edit2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
            {marcadores.length === 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">Sin citas en el mapa</div>
            )}
          </div>

          {/* Legend con conteo por técnico en el rango */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Técnicos</p>
            <div className="space-y-1">
              {tecnicos.map(t => {
                const count = cantidadPorTecnico[t.nombre] || 0;
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color || getTecnicoColor(t.nombre) }} />
                      <span className="truncate">{t.nombre}{t.zona ? ` · ${t.zona}` : ''}</span>
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${count > 0 ? 'bg-[#1a5fa8]/10 text-[#1a5fa8]' : 'bg-gray-100 text-gray-400'}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Modal edición desde pin */}
      <Modal
        isOpen={!!editingOrden}
        onClose={cerrarEdit}
        title={editingOrden ? `Editar ${editingOrden.numero || 'orden'}` : 'Editar orden'}
        size="md"
      >
        {editingOrden && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <p className="text-sm font-bold text-gray-900">{editingOrden.clienteNombre}</p>
              <p className="text-xs text-gray-600">
                {editingOrden.equipoTipo}
                {editingOrden.equipoMarca ? ` · ${editingOrden.equipoMarca}` : ''}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Técnico</label>
              <select
                value={editForm.tecnicoId}
                onChange={e => {
                  const t = tecnicos.find(x => x.id === e.target.value);
                  setEditForm(f => ({ ...f, tecnicoId: e.target.value, tecnicoNombre: t?.nombre || '' }));
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                <option value="">Sin asignar</option>
                {tecnicos.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}{t.operariaNombre ? ` (grupo ${t.operariaNombre})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de cita</label>
                <input
                  type="date"
                  value={editForm.fechaCita}
                  onChange={e => setEditForm(f => ({ ...f, fechaCita: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hora de inicio</label>
                <div className="grid grid-cols-5 gap-1">
                  {HORARIOS.map(h => {
                    const ocupado = horariosOcupadosEdit.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => !ocupado && setEditForm(f => ({ ...f, horaInicio: h }))}
                        disabled={ocupado}
                        title={ocupado ? 'Horario ocupado' : ''}
                        className={`px-1.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                          ocupado
                            ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed line-through'
                            : editForm.horaInicio === h
                              ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5fa8]'
                        }`}
                      >
                        {HORARIOS_LABEL[h]}
                      </button>
                    );
                  })}
                </div>
                {editForm.tecnicoId && editForm.fechaCita && horariosOcupadosEdit.length > 0 && (
                  <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                    <AlertTriangle size={10} /> {horariosOcupadosEdit.length} horario(s) ocupado(s) ese día
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <textarea
                rows={3}
                value={editForm.notas}
                onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={cerrarEdit}
                disabled={savingEdit}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarEditDesdeMapa}
                disabled={savingEdit}
                className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2"
              >
                <Save size={14} />
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
