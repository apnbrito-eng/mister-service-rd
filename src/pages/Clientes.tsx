import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cliente, OrdenServicio, ZONAS_RD } from '../types';
import { formatFechaCorta, formatMoneda, formatTelefono } from '../utils';
import { whatsappUrl } from '../utils/whatsapp';
import { coordsFromLatLng, googleMapsViewUrl } from '../utils/maps';
import { inferirZona, zonaColor } from '../utils/zonas';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import MiniMapaCliente from '../components/ordenes/MiniMapaCliente';
import EliminarOrdenButton from '../components/ordenes/EliminarOrdenButton';
import EditarClienteModal from '../components/clientes/EditarClienteModal';
import BotonComoLlegar from '../components/shared/BotonComoLlegar';
import { Search, Plus, User, Phone, Mail, MapPin, Download, History, ChevronRight, Calendar, Wrench, Edit2, MessageCircle, Archive } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Clientes() {
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const puedeCrear = puede(userProfile, 'clientesCrear');
  const puedeModificar = puede(userProfile, 'clientesModificar');
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historialOrdenes, setHistorialOrdenes] = useState<OrdenServicio[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', direccion: '', lat: 0, lng: 0,
    zona: '__auto__' as string,
  });

  const dirInputRefCliente = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRefCliente = useRef<any>(null);

  useEffect(() => {
    if (!showModal) return;

    const initAC = () => {
      if (!dirInputRefCliente.current || !window.google?.maps?.places) return;
      autocompleteRefCliente.current = new window.google.maps.places.Autocomplete(
        dirInputRefCliente.current,
        {
          componentRestrictions: { country: 'do' },
          fields: ['formatted_address', 'geometry', 'name'],
        }
      );
      autocompleteRefCliente.current.addListener('place_changed', () => {
        const place = autocompleteRefCliente.current.getPlace();
        if (!place.geometry) return;
        const nombre = place.name || '';
        const direccion = place.formatted_address || '';
        const textoFinal = nombre && !direccion.startsWith(nombre)
          ? `${nombre}, ${direccion}`
          : direccion;
        setForm(f => ({
          ...f,
          direccion: textoFinal,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }));
        toast.success('\u{1F4CD} Ubicación de Google capturada');
      });
    };

    if (window.google?.maps?.places) {
      initAC();
      return;
    }

    if (!document.getElementById('google-places-script')) {
      const script = document.createElement('script');
      script.id = 'google-places-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&libraries=places&language=es`;
      script.async = true;
      script.defer = true;
      script.onload = initAC;
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(interval);
          initAC();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [showModal]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'clientes'), orderBy('createdAt', 'desc')),
      (snap) => {
        setClientes(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        } as Cliente)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedCliente) return;
    getDocs(query(
      collection(db, 'ordenes_servicio'),
      where('clienteId', '==', selectedCliente.id)
    )).then(snap => {
      const ordenes = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
        updatedAt: d.data().updatedAt?.toDate?.() || new Date(),
        fechaCita: d.data().fechaCita?.toDate?.() || null,
      } as OrdenServicio));
      // Ordenar client-side por fecha descendente (más recientes primero) + excluir eliminadas
      ordenes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setHistorialOrdenes(ordenes.filter(o => !o.eliminada));
    });
  }, [selectedCliente]);

  const filteredClientes = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.telefono.includes(busqueda)
  );

  const geocodeDireccion = async (direccion: string) => {
    if (!direccion) return;
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion + ', Santo Domingo, República Dominicana')}&limit=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await resp.json();
      if (data.length > 0) {
        setForm(f => ({ ...f, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }));
        toast.success('Ubicación encontrada');
      } else {
        toast.error('No se encontró la ubicación');
      }
    } catch {
      toast.error('Error al buscar ubicación');
    } finally {
      setGeocoding(false);
    }
  };

  const handleUsarMiUbicacion = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible');
      return;
    }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=es`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await res.json();
          const raw = (data?.display_name || '').toString();
          const direccion = raw
            ? raw.split(',').slice(0, 3).join(',').trim()
            : '';
          setForm(f => ({
            ...f,
            direccion: direccion || f.direccion,
            lat: latitude,
            lng: longitude,
          }));
          toast.success('Ubicación capturada');
        } catch {
          setForm(f => ({ ...f, lat: latitude, lng: longitude }));
          toast.success('Coordenadas capturadas');
        } finally {
          setGeocoding(false);
        }
      },
      (err) => {
        setGeocoding(false);
        toast.error('No se pudo obtener la ubicación: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.telefono) {
      toast.error('Nombre y teléfono son requeridos');
      return;
    }
    setSaving(true);
    try {
      const zonaFinal = form.zona === '__auto__'
        ? (inferirZona(form.lat || undefined, form.lng || undefined) || undefined)
        : (form.zona || undefined);
      const payload: Record<string, unknown> = {
        nombre: form.nombre,
        telefono: form.telefono,
        email: form.email,
        direccion: form.direccion,
        lat: form.lat || null,
        lng: form.lng || null,
        origen: 'manual',
        createdAt: Timestamp.now(),
      };
      if (zonaFinal) payload.zona = zonaFinal;
      await addDoc(collection(db, 'clientes'), payload);
      toast.success('Cliente creado');
      setShowModal(false);
      setForm({ nombre: '', telefono: '', email: '', direccion: '', lat: 0, lng: 0, zona: '__auto__' });
    } catch {
      toast.error('Error al crear cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleCambiarZonaCliente = async (cliente: Cliente, nuevaZona: string) => {
    try {
      const payload: Record<string, unknown> = {
        updatedAt: Timestamp.now(),
      };
      if (nuevaZona === '__auto__') {
        const inf = inferirZona(cliente.lat, cliente.lng);
        if (inf) payload.zona = inf;
      } else if (nuevaZona) {
        payload.zona = nuevaZona;
      }
      await updateDoc(doc(db, 'clientes', cliente.id), payload);
      setSelectedCliente(c => c && c.id === cliente.id
        ? { ...c, zona: typeof payload.zona === 'string' ? payload.zona : c.zona }
        : c);
      toast.success('Zona actualizada');
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar la zona');
    }
  };

  const exportCSV = () => {
    const headers = 'Nombre,Teléfono,Email,Dirección\n';
    const rows = clientes.map(c => `"${c.nombre}","${c.telefono}","${c.email || ''}","${c.direccion}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes_misterservice.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando clientes..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[#0f3460]">Clientes</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Download size={16} /> CSV
          </button>
          {puedeCrear && (
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
              <Plus size={18} /> Nuevo Cliente
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Lista */}
        <div className="w-full lg:w-1/3 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Buscar por nombre o teléfono..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white" />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden max-h-[70vh] overflow-y-auto">
            {filteredClientes.map(c => {
              const primerNombre = c.nombre.trim().split(/\s+/)[0] || '';
              return (
                <div
                  key={c.id}
                  className={`w-full border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                    selectedCliente?.id === c.id ? 'bg-blue-50 border-l-4 border-l-[#1a5fa8]' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCliente(c)}
                    className="flex-1 min-w-0 text-left px-4 py-3 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 bg-[#0f3460]/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-[#0f3460]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.nombre}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {formatTelefono(c.telefono)}
                        {c.zona && (
                          <span className={`hidden md:inline ml-2 ${zonaColor(c.zona)}`}>· {c.zona}</span>
                        )}
                        {c.origen === 'calendar_legacy' && (
                          <span className="hidden md:inline ml-2 text-amber-600" title="Importado del histórico de Calendar">
                            <Archive size={10} className="inline" /> legacy
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                  {c.telefono && (
                    <a
                      href={whatsappUrl(c.telefono, `Hola ${primerNombre}, te escribimos de Mister Service RD.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title={`Enviar WhatsApp a ${c.nombre}`}
                      aria-label={`Enviar WhatsApp a ${c.nombre}`}
                      className="flex items-center justify-center w-9 h-9 mr-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex-shrink-0"
                    >
                      <MessageCircle size={15} />
                    </a>
                  )}
                  <div className="mr-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <BotonComoLlegar ubicacion={coordsFromLatLng(c.lat, c.lng)} size="sm" />
                  </div>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mr-3" />
                </div>
              );
            })}
            {filteredClientes.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">Sin resultados</div>
            )}
          </div>
        </div>

        {/* Detalle */}
        <div className="flex-1">
          {selectedCliente ? (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <h2 className="text-xl font-bold text-gray-900">{selectedCliente.nombre}</h2>
                  <div className="flex items-center gap-2">
                    {selectedCliente.telefono && (
                      <a
                        href={whatsappUrl(
                          selectedCliente.telefono,
                          `Hola ${selectedCliente.nombre.trim().split(/\s+/)[0] || ''}, te escribimos de Mister Service RD.`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                    )}
                    {puedeModificar && (
                      <button
                        type="button"
                        onClick={() => setShowEditModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0f3460] hover:bg-[#1a5fa8] text-white"
                      >
                        <Edit2 size={13} /> Editar cliente
                      </button>
                    )}
                  </div>
                </div>
                {/* RNC + Razón social arriba del bloque de teléfono si existen */}
                {(selectedCliente.rnc || selectedCliente.razonSocial) && (
                  <div className="mb-4 bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm">
                    {selectedCliente.rnc && (
                      <div className="text-gray-700">
                        <span className="font-medium text-gray-900">RNC:</span> {selectedCliente.rnc}
                      </div>
                    )}
                    {selectedCliente.razonSocial && (
                      <div className="text-gray-700">
                        <span className="font-medium text-gray-900">Razón social:</span>{' '}
                        {selectedCliente.razonSocial}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={14} /> {formatTelefono(selectedCliente.telefono)}
                  </div>
                  {selectedCliente.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail size={14} /> {selectedCliente.email}
                    </div>
                  )}
                  {selectedCliente.cedula && !selectedCliente.rnc && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium">Cédula:</span>
                      {selectedCliente.cedula}
                    </div>
                  )}
                  {selectedCliente.direccion && (
                    <div className="col-span-full">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Dirección escrita</p>
                      <div className="flex items-start gap-2 text-sm text-gray-700">
                        <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                        <span>{selectedCliente.direccion}</span>
                      </div>
                    </div>
                  )}
                  <div className="col-span-full">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Ubicación GPS</p>
                    {(() => {
                      const coords = coordsFromLatLng(selectedCliente.lat, selectedCliente.lng);
                      if (!coords) {
                        return (
                          <p className="text-sm text-gray-400 italic">Sin coordenadas GPS guardadas</p>
                        );
                      }
                      const verUrl = googleMapsViewUrl(coords);
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                            {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                          </span>
                          <BotonComoLlegar ubicacion={coords} size="sm" />
                          {verUrl && (
                            <a
                              href={verUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:underline"
                            >
                              Ver en mapa
                            </a>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="col-span-full flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Zona:</span>
                    <span className={`font-medium ${zonaColor(selectedCliente.zona)}`}>
                      {selectedCliente.zona || 'No definida'}
                    </span>
                    {puedeModificar && (
                      <select
                        value={selectedCliente.zona || '__auto__'}
                        onChange={e => handleCambiarZonaCliente(selectedCliente, e.target.value)}
                        className="ml-auto px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      >
                        <option value="__auto__">Detectar automáticamente</option>
                        {ZONAS_RD.map(z => (
                          <option key={z} value={z}>{z}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-4">Cliente desde {formatFechaCorta(selectedCliente.createdAt)}</p>
              </div>

              {/* Histórico pre-sistema (importado de Calendar) */}
              {selectedCliente.legacyMetricas && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Archive size={16} className="text-amber-700" />
                    <h3 className="font-semibold text-amber-900">Historial pre-sistema (importado)</h3>
                  </div>
                  <p className="text-[11px] text-amber-700 mb-3">
                    Datos consolidados desde Google Calendar (años previos). No se actualiza automáticamente.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="bg-white border border-amber-100 rounded-lg p-3">
                      <p className="text-[11px] text-amber-700 uppercase tracking-wide">Servicios totales</p>
                      <p className="text-xl font-bold text-amber-900 mt-0.5">
                        {selectedCliente.legacyMetricas.totalServicios.toLocaleString('es-DO')}
                      </p>
                    </div>
                    <div className="bg-white border border-amber-100 rounded-lg p-3">
                      <p className="text-[11px] text-amber-700 uppercase tracking-wide">Último servicio</p>
                      <p className="text-base font-semibold text-amber-900 mt-0.5">
                        {selectedCliente.legacyMetricas.fechaUltimoServicio || '—'}
                      </p>
                    </div>
                    <div className="bg-white border border-amber-100 rounded-lg p-3">
                      <p className="text-[11px] text-amber-700 uppercase tracking-wide">Monto histórico</p>
                      <p className="text-base font-semibold text-amber-900 mt-0.5">
                        {formatMoneda(selectedCliente.legacyMetricas.montoTotalHistorico || 0)}
                      </p>
                    </div>
                  </div>
                  {selectedCliente.legacyMetricas.equiposAtendidos && (
                    <div className="mt-2">
                      <p className="text-[11px] text-amber-700 uppercase tracking-wide mb-1">Equipos atendidos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCliente.legacyMetricas.equiposAtendidos
                          .split(',').map(s => s.trim()).filter(Boolean)
                          .map(e => (
                            <span key={e} className="text-xs bg-white border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">
                              {e}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {selectedCliente.legacyMetricas.marcasHabituales && (
                    <div className="mt-2">
                      <p className="text-[11px] text-amber-700 uppercase tracking-wide mb-1">Marcas habituales</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCliente.legacyMetricas.marcasHabituales
                          .split(',').map(s => s.trim()).filter(Boolean)
                          .map(m => (
                            <span key={m} className="text-xs bg-white border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">
                              {m}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {selectedCliente.legacyMetricas.bancosPago && (
                    <div className="mt-2">
                      <p className="text-[11px] text-amber-700 uppercase tracking-wide mb-1">Bancos usados para pagos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCliente.legacyMetricas.bancosPago
                          .split(',').map(s => s.trim()).filter(Boolean)
                          .map(b => (
                            <span key={b} className="text-xs bg-white border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">
                              {b}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Historial */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <History size={16} className="text-[#1a5fa8]" />
                  <h3 className="font-semibold text-gray-900">Historial de Servicios</h3>
                  <span className="text-xs text-gray-500">({historialOrdenes.length})</span>
                </div>
                {historialOrdenes.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin servicios registrados</p>
                ) : (
                  <div className="space-y-2">
                    {historialOrdenes.map(o => (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                        className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 hover:border-[#1a5fa8] border border-transparent rounded-lg transition-all group"
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-[#0f3460] group-hover:text-[#1a5fa8]">
                                {o.numero}
                              </span>
                              <span className="text-sm text-gray-700">·</span>
                              <span className="flex items-center gap-1 text-sm text-gray-700">
                                <Wrench size={12} />
                                {o.equipoTipo}{o.equipoMarca ? ` ${o.equipoMarca}` : ''}
                              </span>
                            </div>
                            {o.descripcionFalla && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-1">{o.descripcionFalla}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                              {o.fechaCita && (
                                <span className="flex items-center gap-1">
                                  <Calendar size={10} />
                                  {formatFechaCorta(o.fechaCita)}
                                </span>
                              )}
                              {o.tecnicoNombre && (
                                <span>Técnico: {o.tecnicoNombre}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge fase={o.fase} />
                            <EliminarOrdenButton orden={o} variant="icon" size="sm" />
                            <ChevronRight size={14} className="text-gray-300 group-hover:text-[#1a5fa8] transition-colors" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <User size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">Selecciona un cliente para ver su detalle</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo cliente */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nuevo Cliente">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
              <input type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección
              <span className="ml-2 text-[10px] text-gray-400 font-normal">
                (Busca en Google: Agora Mall, Plaza Central, etc.)
              </span>
            </label>
            <div className="flex gap-2">
              <input
                ref={dirInputRefCliente}
                type="text"
                value={form.direccion}
                onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                placeholder="Escribe un lugar, dirección o usa GPS"
                autoComplete="off"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <button type="button" onClick={handleUsarMiUbicacion} disabled={geocoding}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors flex items-center gap-1 disabled:opacity-50">
                <MapPin size={14} /> {geocoding ? '...' : 'GPS'}
              </button>
            </div>
            {form.lat !== 0 && (
              <p className="text-xs text-green-600 mt-1">Coordenadas: {form.lat.toFixed(4)}, {form.lng.toFixed(4)}</p>
            )}
            {form.lat !== 0 && form.lng !== 0 && (
              <MiniMapaCliente lat={form.lat} lng={form.lng} direccion={form.direccion} />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
            <select
              value={form.zona}
              onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            >
              <option value="__auto__">Detectar automáticamente</option>
              {ZONAS_RD.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            {form.zona === '__auto__' && form.lat !== 0 && form.lng !== 0 && (
              <p className="text-[11px] text-gray-500 mt-1">
                Zona detectada: {inferirZona(form.lat, form.lng) || 'No se pudo inferir'}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Crear Cliente'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal editar cliente — reutiliza el componente con soporte de direcciones, RNC, cédula */}
      {selectedCliente && (
        <EditarClienteModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          clienteId={selectedCliente.id}
          onUpdated={(c) => {
            // Actualizar el cliente seleccionado con los nuevos datos
            setSelectedCliente({ ...selectedCliente, ...c });
          }}
        />
      )}
    </div>
  );
}
