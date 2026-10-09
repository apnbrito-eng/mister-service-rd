import { tieneCoord } from '../utils/geo';
import { cargarGoogleMaps } from '../utils/cargarGoogleMaps';
import { motion } from 'motion/react';
import { useMovimientoReducido } from '../hooks/useMovimientoReducido';
import { obtenerTransicionMovimiento, DESPLAZAMIENTO_PANEL } from '../utils/motion';
import CarterasClientes from '../components/clientes/CarterasClientes';
import EditarUbicacionCliente from '../components/clientes/EditarUbicacionCliente';
import { numeroWhatsAppCliente, resolverChatCliente } from '../utils/resolverChatCliente';
import { useAtencion } from '../context/AtencionContext';
import { useState, useEffect, useMemo, useRef, lazy, Suspense, useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, updateDoc, doc, Timestamp, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cliente, OrdenServicio, ZONAS_RD } from '../types';
import { formatFechaCorta, formatMoneda, formatTelefono, parseCliente } from '../utils';
import { buscarOCrearCliente, buscarClientePorTelefono, normalizarTelefono } from '../services/clientes.service';
import { whatsappUrl } from '../utils/whatsapp';
import { coordsFromLatLng, googleMapsViewUrl } from '../utils/maps';
import { inferirZona, zonaColor } from '../utils/zonas';
import {
  FiltrosClientes,
  FILTROS_DEFAULT,
  aplicaFiltros,
  equiposPresentesEnBase,
} from '../utils/clientesFiltros';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import MiniMapaCliente from '../components/ordenes/MiniMapaCliente';
import EliminarOrdenButton from '../components/ordenes/EliminarOrdenButton';
import EditarClienteModal from '../components/clientes/EditarClienteModal';
const MapaClientes = lazy(() => import('../components/clientes/MapaClientes'));
import FiltrosSidebarClientes from '../components/clientes/FiltrosSidebarClientes';
const TabReactivacion = lazy(() => import('../components/clientes/TabReactivacion'));
import BotonComoLlegar from '../components/shared/BotonComoLlegar';
import { Search, Plus, User, Phone, Mail, MapPin, Download, History, ChevronRight, Calendar, Wrench, Edit2, MessageCircle, Archive, List, Map as MapIcon, Filter, Sparkles, MoreHorizontal, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Clientes() {
  const navigate = useNavigate();
  const reducido = useMovimientoReducido();
  const [vistaMovil, setVistaMovil] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => { if (typeof window === 'undefined' || !window.matchMedia) return; const media = window.matchMedia('(max-width: 1023px)'); const cambiar = () => setVistaMovil(media.matches); media.addEventListener('change', cambiar); return () => media.removeEventListener('change', cambiar); }, []);
  const [editarUbicacion, setEditarUbicacion] = useState(false);
  const [abriendoChat, setAbriendoChat] = useState(false);
  const botonClienteRef = useRef<HTMLButtonElement | null>(null);
  const { seleccionar } = useAtencion();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userProfile } = useApp();
  const puedeCrear = puede(userProfile, 'clientesCrear');
  const puedeModificar = puede(userProfile, 'clientesModificar');
  // Gating inline del tab Mapa: técnico/operaria no acceden (decisión D2 — sin
  // permiso nuevo en `PermisosSistema` hasta Commit 2 de Reactivación).
  const puedeVerMapa =
    userProfile?.rol !== 'tecnico' && userProfile?.rol !== 'operaria';
  // Tab Reactivación — gateado por permiso explícito (Commit 2 sprint
  // Reactivación). Default true para admin/coord, false resto.
  const puedeVerReactivacion = puede(userProfile, 'clientesReactivacionGestionar');

  const puedeInbox = !!userProfile && ['administrador', 'coordinadora', 'secretaria', 'operaria'].includes(userProfile.rol);
  async function abrirChatEmpresa(cliente: Cliente) {
    if (abriendoChat || !puedeInbox) return;
    setAbriendoChat(true);
    try {
      const waId = await resolverChatCliente(cliente);
      seleccionar({ clienteId: cliente.id, telefono: cliente.telefono, nombre: cliente.nombre, waId });
      navigate(`/admin/inbox/${encodeURIComponent(waId)}?clienteId=${encodeURIComponent(cliente.id)}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo abrir la conversación.'); }
    finally { setAbriendoChat(false); }
  }

  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [historialOrdenes, setHistorialOrdenes] = useState<OrdenServicio[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const busquedaDiferida = useDeferredValue(busqueda);
  const [limiteVisible, setLimiteVisible] = useState(50);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Tab "Lista" (default) | "Mapa" | "Reactivación"
  const [tab, setTab] = useState<'lista' | 'mapa' | 'reactivacion' | 'carteras'>('lista');
  // Filtros aplicados al tab Mapa
  const [filtros, setFiltros] = useState<FiltrosClientes>(FILTROS_DEFAULT);
  // Drawer mobile de filtros (lg breakpoint)
  const [filtrosDrawerOpen, setFiltrosDrawerOpen] = useState(false);

  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', direccion: '', lat: 0, lng: 0,
    zona: '__auto__' as string,
    tipo: 'particular' as 'particular' | 'b2b',
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

    let cancelado = false;
    void cargarGoogleMaps().then(ok => { if (ok && !cancelado) initAC(); });
    return () => { cancelado = true; };
  }, [showModal]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'clientes'),
      (snap) => {
        // parseCliente normaliza legacyMetricas / tipo / origen para uso
        // consistente en filtros del mapa.
        // No orderBy servidor: excluye clientes importados sin createdAt.
        setClientes(snap.docs.map(d => parseCliente(d.id, d.data() as Record<string, unknown>)).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // SPRINT-INBOX-11 (2026-05-22): deep-link `/admin/clientes?id=<docId>`.
  // CardCliente del inbox navega con `?id=` para abrir el detalle del cliente
  // específico. Acá lo leemos una sola vez cuando la lista de clientes está
  // cargada y seteamos el `selectedCliente`. Guard `idAbiertoRef` evita
  // re-disparar el setter si el usuario después cierra el panel y la URL
  // sigue trayendo `?id=`. Si el id no existe en la lista, no hacemos nada
  // (queda en el listado sin romper).
  const idAbiertoRef = useRef<string | null>(null);
  useEffect(() => {
    const idQS = searchParams.get('id');
    if (!idQS) {
      idAbiertoRef.current = null;
      return;
    }
    if (clientes.length === 0) return;
    if (idAbiertoRef.current === idQS) return;
    const match = clientes.find((c) => c.id === idQS);
    if (match) {
      setSelectedCliente(match); setDetalleVisible(true);
      seleccionar({clienteId:match.id, telefono:match.telefono, nombre:match.nombre});
      idAbiertoRef.current = idQS;
    } else {
      // ID no encontrado (o cliente soft-deleted). Limpiamos el param para
      // que el usuario vea el listado en vez de quedar atrapado en un loop.
      idAbiertoRef.current = idQS;
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  }, [clientes, searchParams, setSearchParams, seleccionar]);

  const clienteHistorialId = selectedCliente?.id;
  useEffect(() => {
    if (!clienteHistorialId) return;
    let vigente = true;
    setHistorialOrdenes([]);
    setHistorialLoading(true);
    setHistorialError(false);
    getDocs(query(
      collection(db, 'ordenes_servicio'),
      where('clienteId', '==', clienteHistorialId)
    )).then(snap => {
      if (!vigente) return;
      const ordenes = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
        updatedAt: d.data().updatedAt?.toDate?.() || new Date(),
        fechaCita: d.data().fechaCita?.toDate?.() || null,
      } as OrdenServicio));
      // Ordenar client-side por fecha descendente (más recientes primero) + excluir eliminadas
      ordenes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setHistorialOrdenes(ordenes.filter(o => !o.eliminada));
    }).catch(() => { if (vigente) setHistorialError(true); })
      .finally(() => { if (vigente) setHistorialLoading(false); });
    return () => { vigente = false; };
  }, [clienteHistorialId]);

  // Filtra mergedos (SPRINT-185 soft-delete) ANTES de aplicar búsqueda.
  // Los clientes con `eliminado === true` fueron consolidados con otro
  // canónico vía `scripts/dedup-clientes-por-telefono.ts --apply`.
  const clientesVisibles = useMemo(() => clientes.filter(c => c.eliminado !== true), [clientes]);
  const filteredClientes = useMemo(() => clientesVisibles.filter(c =>
    c.nombre.toLowerCase().includes(busquedaDiferida.trim().toLowerCase()) ||
    c.telefono.includes(busquedaDiferida.trim())
  ), [clientesVisibles, busquedaDiferida]);

  // ─── Tab Mapa: derivados ────────────────────────────────────────────────
  /** Clientes que pasan los filtros del sidebar (sin importar coords). */
  const clientesFiltrados = useMemo(
    () => clientesVisibles.filter(c => aplicaFiltros(c, filtros)),
    [clientesVisibles, filtros],
  );

  /** Subset con coords válidas — los que efectivamente se renderizan en el mapa. */
  const clientesConCoords = useMemo(
    () => clientesFiltrados.filter(tieneCoord),
    [clientesFiltrados],
  );

  /** Cantidad que pasó filtros pero no tiene coords (banner informativo). */
  const totalSinCoords = clientesFiltrados.length - clientesConCoords.length;

  /** Zonas únicas presentes en la base entera (para el multi-select). */
  const zonasDisponibles = useMemo(() => {
    const set = new Set<string>();
    clientes.forEach(c => { if (c.zona) set.add(c.zona); });
    // Mantener el orden canónico de ZONAS_RD; agregar cualquier extra al final.
    const canonicas = ZONAS_RD.filter(z => set.has(z));
    const extras = Array.from(set).filter(z => !ZONAS_RD.includes(z as typeof ZONAS_RD[number]));
    return [...canonicas, ...extras];
  }, [clientes]);

  /** Tipos de equipo detectados en legacyMetricas (CSV). */
  const equiposDisponibles = useMemo(
    () => equiposPresentesEnBase(clientes),
    [clientes],
  );

  /** Vuelve al tab Lista mostrando el cliente clickeado en el mapa. */
  const handleSelectClienteDesdeMapa = (id: string) => {
    const c = clientes.find(cl => cl.id === id);
    if (!c) return;
    setSelectedCliente(c);
    setDetalleVisible(true);
    seleccionar({ clienteId: c.id, telefono: c.telefono, nombre: c.nombre });
    setTab('lista');
  };

  /** Si pierde permisos durante la sesión y estaba en tab Mapa, lo regresamos. */
  useEffect(() => {
    if (!puedeVerMapa && tab === 'mapa') setTab('lista');
  }, [puedeVerMapa, tab]);

  /** Si pierde permiso de Reactivación durante la sesión, fallback a Lista. */
  useEffect(() => {
    if (!puedeVerReactivacion && tab === 'reactivacion') setTab('lista');
  }, [puedeVerReactivacion, tab]);

  // Dead code histórico: helper de geocoding manual via Nominatim, reemplazado
  // por Google Places Autocomplete + handleUsarMiUbicacion (geolocation directa).
  // Se conserva por si algún flow de import lo vuelve a necesitar. Prefijo `_`
  // silencia warning de unused (regla eslint allows /^_/u).
  const _geocodeDireccion = async (direccion: string) => {
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
    // Guard SPRINT-185: validar teléfono RD antes de tocar Firestore.
    // El normalizador retorna '' si la entrada no es un teléfono RD válido
    // (>11 dígitos, código internacional NO-RD, <10 dígitos).
    const telNorm = normalizarTelefono(form.telefono);
    if (!telNorm || telNorm.length !== 10) {
      toast.error('Teléfono inválido. Debe ser un número RD de 10 dígitos.');
      return;
    }
    setSaving(true);
    try {
      // Guard runtime contra duplicados (SPRINT-185): si ya existe un cliente
      // con este teléfono normalizado, NO crear duplicado. Antes del fix esta
      // página usaba `addDoc` con auto-id, lo que ignoraba la convención de
      // `buscarOCrearCliente` (ID = telNorm) y permitía 2 docs con mismo tel.
      // Ese fue el bug que originó el sprint (caso QA Test en producción).
      const existente = await buscarClientePorTelefono(form.telefono);
      if (existente) {
        toast.error(
          `Ya existe un cliente con este teléfono: ${existente.data.nombre} (${formatTelefono(existente.data.telefono)}). ` +
          `Asociá la nueva orden a ese cliente en vez de crear duplicado.`,
        );
        setSaving(false);
        return;
      }

      // No hay duplicado → delegar a `buscarOCrearCliente` (helper canónico).
      // Esto persiste el cliente con id == telefonoNormalizado, escribe el
      // campo `telefonoNormalizado`, infiere zona si aplica, y hace strip
      // de undefined (Firestore los rechaza).
      const zonaFinal = form.zona === '__auto__'
        ? undefined  // el helper auto-infiere desde lat/lng
        : (form.zona || undefined);

      const clienteId = await buscarOCrearCliente(form.telefono, {
        nombre: form.nombre,
        email: form.email || undefined,
        direccion: form.direccion || undefined,
        lat: form.lat || undefined,
        lng: form.lng || undefined,
        tipo: form.tipo,
      });

      // Si el usuario eligió zona manual (no __auto__), persistirla post-crear.
      if (zonaFinal) {
        await updateDoc(doc(db, 'clientes', clienteId), {
          zona: zonaFinal,
          updatedAt: Timestamp.now(),
        });
      }

      toast.success('Cliente creado');
      setShowModal(false);
      setForm({ nombre: '', telefono: '', email: '', direccion: '', lat: 0, lng: 0, zona: '__auto__', tipo: 'particular' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear cliente';
      toast.error(msg);
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
    <div className="service-page clients-page space-y-6">
      <header className={`clients-toolbar ${selectedCliente && tab === 'lista' ? 'clients-toolbar-detail' : ''}`}>
        <div className="clients-title-row">
          <h1>Clientes <span className="clients-count">{clientesVisibles.length}</span></h1>
          <div className="flex items-center gap-2">
            {puedeCrear && <button type="button" onClick={() => setShowModal(true)} className="clients-new"><Plus size={18} /><span>Nuevo</span></button>}
            <details className="clients-more relative">
              <summary aria-label="Más opciones de clientes" className="list-none flex items-center justify-center min-h-11 min-w-11 cursor-pointer rounded-xl border border-gray-200"><MoreHorizontal size={22} /></summary>
              <div className="absolute right-0 top-full z-20 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg p-1">
                <button type="button" onClick={e => { exportCSV(); e.currentTarget.closest('details')?.removeAttribute('open'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"><Download size={18} /> Exportar clientes</button>
              </div>
            </details>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <nav aria-label="Vistas de clientes" className="clients-tabs">
            <button type="button" aria-pressed={tab === 'lista'} onClick={() => setTab('lista')}><List size={16} /> Lista</button>
            <button type="button" aria-pressed={tab === 'carteras'} onClick={() => setTab('carteras')}><User size={16} /> Carteras A/B</button>
            {puedeVerMapa && <button type="button" aria-pressed={tab === 'mapa'} onClick={() => setTab('mapa')}><MapIcon size={16} /> Mapa</button>}
            {puedeVerReactivacion && <button type="button" aria-pressed={tab === 'reactivacion'} onClick={() => setTab('reactivacion')}><Sparkles size={16} /> Reactivación</button>}
          </nav>
          {(tab === 'mapa' || tab === 'reactivacion') && <button type="button" aria-label="Abrir filtros de clientes" onClick={() => setFiltrosDrawerOpen(true)} className="lg:hidden min-h-11 min-w-11 flex items-center justify-center"><Filter size={18} /></button>}
        </div>
      </header>
      <Suspense fallback={<div role="status" className="p-4 text-gray-600">Cargando vista de clientes…</div>}>
      {tab === 'carteras' && <CarterasClientes clientes={clientes} puedeTrasladar={puedeModificar && puedeInbox} abrir={cliente => { setSelectedCliente(cliente); setDetalleVisible(true); setTab('lista'); seleccionar({ clienteId: cliente.id, telefono: cliente.telefono, nombre: cliente.nombre }); }} />}
      {tab === 'mapa' && puedeVerMapa && (
        <div className="grid grid-cols-1 lg:flex gap-6 lg:flex-row">
          <FiltrosSidebarClientes
            filtros={filtros}
            onChange={setFiltros}
            zonasDisponibles={zonasDisponibles}
            equiposDisponibles={equiposDisponibles}
            totalCoincidentes={clientesFiltrados.length}
            totalSinCoords={totalSinCoords}
            onLimpiar={() => setFiltros(FILTROS_DEFAULT)}
            drawerOpen={filtrosDrawerOpen}
            onCloseDrawer={() => setFiltrosDrawerOpen(false)}
          />
          <div className="flex-1 min-w-0">
            <MapaClientes
              clientes={clientesConCoords}
              totalSinCoords={totalSinCoords}
              onSelectCliente={handleSelectClienteDesdeMapa}
            />
          </div>
        </div>
      )}

      {tab === 'reactivacion' && puedeVerReactivacion && userProfile && (
        <TabReactivacion
          clientes={clientesVisibles}
          userProfile={userProfile}
          filtrosDrawerOpen={filtrosDrawerOpen}
          onCloseFiltrosDrawer={() => setFiltrosDrawerOpen(false)}
        />
      )}

      {tab === 'lista' && (
      <div className="grid grid-cols-1 lg:flex gap-6 lg:flex-row">
        {/* Lista */}
        <motion.div initial={false} animate={{ opacity: vistaMovil && detalleVisible ? 0 : 1, x: !reducido && vistaMovil && detalleVisible ? -DESPLAZAMIENTO_PANEL : 0 }} aria-hidden={vistaMovil && detalleVisible} {...(vistaMovil && detalleVisible ? { inert: '' } : {})} style={{ gridArea: '1 / 1', pointerEvents: vistaMovil && detalleVisible ? 'none' : undefined }} transition={obtenerTransicionMovimiento(reducido)} className="w-full lg:w-1/3 space-y-4 self-start">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Buscar por nombre o teléfono..."
              aria-label="Buscar cliente por nombre o teléfono" value={busqueda} onChange={e => { setBusqueda(e.target.value); setLimiteVisible(50); }}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium bg-white" />
          </div>
          <div className="service-client-list bg-white overflow-hidden lg:max-h-[70vh] lg:overflow-y-auto">
            {filteredClientes.slice(0, limiteVisible).map(c => {
              const primerNombre = c.nombre.trim().split(/\s+/)[0] || '';
              return (
                <div
                  key={c.id}
                  className={`service-client-row w-full border-b border-gray-100 hover:bg-gray-50 transition-colors flex flex-wrap items-center gap-2 ${
                    selectedCliente?.id === c.id ? 'bg-blue-50 border-l-4 border-l-primary-medium' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={e => { botonClienteRef.current = e.currentTarget; setSelectedCliente(c); setDetalleVisible(true); seleccionar({clienteId:c.id, telefono:c.telefono, nombre:c.nombre}); }}
                    className="w-full min-w-0 text-left px-4 py-3 flex items-center gap-3"
                  >
                    <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-gray-900 break-words leading-snug">{c.nombre}</p>
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
                      href={numeroWhatsAppCliente(c.telefono) ? whatsappUrl(c.telefono, `Hola ${primerNombre}, te escribimos de Mister Service RD.`) : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => { e.stopPropagation(); if (!numeroWhatsAppCliente(c.telefono)) { e.preventDefault(); toast.error('El teléfono no es compatible con este canal. Revisa el número.'); } }}
                      title={`Enviar WhatsApp a ${c.nombre}`}
                      aria-label={`Enviar WhatsApp a ${c.nombre}`}
                      className="flex items-center justify-center min-w-11 min-h-11 mr-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex-shrink-0"
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
            {filteredClientes.length > limiteVisible && <button type="button" className="w-full min-h-11 text-blue-700 font-medium" onClick={() => setLimiteVisible(n => n + 50)}>Mostrar más clientes ({filteredClientes.length - limiteVisible})</button>}
            {filteredClientes.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">Sin resultados</div>
            )}
          </div>
        </motion.div>

        {/* Detalle */}
        <motion.div initial={false} animate={{ opacity: vistaMovil && !detalleVisible ? 0 : 1, x: !reducido && vistaMovil && !detalleVisible ? DESPLAZAMIENTO_PANEL : 0 }} transition={obtenerTransicionMovimiento(reducido)} aria-hidden={vistaMovil && !detalleVisible} {...(vistaMovil && !detalleVisible ? { inert: '' } : {})} style={{ gridArea: '1 / 1', pointerEvents: vistaMovil && !detalleVisible ? 'none' : undefined }} className="flex-1 min-w-0 self-start">
          {selectedCliente ? (
            <motion.div initial={reducido ? false : { opacity: 0, x: DESPLAZAMIENTO_PANEL }} animate={{ opacity: 1, x: 0 }} transition={obtenerTransicionMovimiento(reducido)} className="space-y-4">
              {historialLoading && <p role="status" className="text-sm text-gray-600">Cargando historial…</p>}
              {historialError && <p role="alert" className="text-sm text-red-700">No se pudo cargar el historial. Vuelve a abrir la ficha para reintentar.</p>}
              <button type="button" onClick={() => { setDetalleVisible(false); const next = new URLSearchParams(searchParams); next.delete('id'); setSearchParams(next, { replace: true }); requestAnimationFrame(() => botonClienteRef.current?.focus({ preventScroll: true })); }} className="lg:hidden min-h-11 flex items-center gap-2 text-sm font-medium"><ArrowLeft size={20} /> Clientes</button>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <h2 className="text-xl font-bold text-gray-900">{selectedCliente.nombre}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedCliente.telefono && (
                      <a
                        href={numeroWhatsAppCliente(selectedCliente.telefono) ? whatsappUrl(
                          selectedCliente.telefono,
                          `Hola ${selectedCliente.nombre.trim().split(/\s+/)[0] || ''}, te escribimos de Mister Service RD.`,
                        ) : undefined}
                        onClick={e => { if (!numeroWhatsAppCliente(selectedCliente.telefono)) { e.preventDefault(); toast.error('El teléfono no es compatible con este canal. Revisa el número.'); } }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <MessageCircle size={13} /> WhatsApp externo
                      </a>
                    )}
                    {puedeInbox && <button type="button" disabled={abriendoChat} onClick={() => abrirChatEmpresa(selectedCliente)} className="min-h-11 px-3 rounded-lg border text-sm">WhatsApp empresa</button>}
                    {puedeModificar && <button type="button" onClick={() => setEditarUbicacion(true)} className="min-h-11 px-3 rounded-lg border text-sm">Cambiar ubicación</button>}
                    {puedeModificar && (
                      <button
                        type="button"
                        onClick={() => setShowEditModal(true)}
                        className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary-medium text-white"
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
                        <div>
                          <MiniMapaCliente lat={coords.lat} lng={coords.lng} direccion={selectedCliente.direccion} />
                          <div className="flex items-center gap-2 flex-wrap mt-2">
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
                        </div>
                      );
                    })()}
                  </div>
                  {(() => {
                    const zonaEfectiva = selectedCliente.zona
                      || inferirZona(selectedCliente.lat, selectedCliente.lng);
                    const zonaEsAuto = !selectedCliente.zona && !!zonaEfectiva;
                    return (
                      <div className="col-span-full flex items-center gap-2 text-sm">
                        <span className="text-gray-600">Zona:</span>
                        <span className={`font-medium ${zonaColor(zonaEfectiva)}`}>
                          {zonaEfectiva || 'No definida'}
                          {zonaEsAuto && (
                            <span className="ml-1 text-[10px] text-gray-400 italic">(auto)</span>
                          )}
                        </span>
                        {puedeModificar && (
                          <select
                            value={selectedCliente.zona || '__auto__'}
                            onChange={e => handleCambiarZonaCliente(selectedCliente, e.target.value)}
                            className="ml-auto px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
                          >
                            <option value="__auto__">Detectar automáticamente</option>
                            {ZONAS_RD.map(z => (
                              <option key={z} value={z}>{z}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })()}
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
                  <History size={16} className="text-primary-medium" />
                  <h3 className="font-semibold text-gray-900">Historial de Servicios</h3>
                  <span className="text-xs text-gray-500">({historialOrdenes.length})</span>
                </div>
                {historialLoading ? <p role="status" className="text-sm text-gray-600">Cargando servicios…</p> : historialError ? <p className="text-sm text-red-700">Historial no disponible.</p> : historialOrdenes.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin servicios registrados</p>
                ) : (
                  <div className="space-y-2">
                    {historialOrdenes.map(o => (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/admin/ordenes/${o.id}`)}
                        className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 hover:border-primary-medium border border-transparent rounded-lg transition-all group"
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-primary group-hover:text-primary-medium">
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
                            <ChevronRight size={14} className="text-gray-300 group-hover:text-primary-medium transition-colors" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <User size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">Selecciona un cliente para ver su detalle</p>
            </div>
          )}
        </motion.div>
      </div>
      )}

      {/* Modal nuevo cliente */}
      </Suspense>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nuevo Cliente">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
              <input type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cliente</label>
            <select
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'particular' | 'b2b' }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              <option value="particular">Particular</option>
              <option value="b2b">B2B (empresa o taller aliado)</option>
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Particular: cliente final que llega al taller. B2B: empresa, otro taller o distribuidor.
            </p>
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
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
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
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
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
              className="px-6 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Crear Cliente'}
            </button>
          </div>
        </form>
      </Modal>

      {selectedCliente && puedeModificar && <EditarUbicacionCliente cliente={selectedCliente} isOpen={editarUbicacion} onClose={() => setEditarUbicacion(false)} onGuardar={setSelectedCliente} />}

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
