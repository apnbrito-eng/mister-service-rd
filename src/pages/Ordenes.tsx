import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, onSnapshot, addDoc, doc, updateDoc,
  Timestamp, getDocs, query, orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { siguienteNumeroOrden } from '../services/contadores.service';
import { OrdenServicio, FaseOrden, EstadoOrdenSimple, Cliente, Personal } from '../types';
import {
  faseLabel, faseColor, formatFecha, formatHora, tiempoTranscurrido,
  TIPOS_EQUIPO, DURACIONES, HORARIOS, HORARIOS_LABEL,
  estadoSimpleLabel, estadoSimpleColor, estadoSimpleBorder,
  formatTelefono, whatsappLink, googleMapsLink, parseOrden, formatMoneda
} from '../utils';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import {
  Plus, Search, Clock, Calendar, MapPin, Phone, MessageCircle,
  Wrench, User, FileText, Edit2, CalendarDays, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

const ESTADOS_SIMPLE: EstadoOrdenSimple[] = ['pendiente', 'en_proceso', 'completado', 'cancelado'];

function estadoSimpleToFase(estado: EstadoOrdenSimple): FaseOrden {
  switch (estado) {
    case 'pendiente': return 'agendado';
    case 'en_proceso': return 'en_diagnostico';
    case 'completado': return 'trabajo_realizado';
    case 'cancelado': return 'cancelado';
  }
}

/** Detecta coordenadas en URLs de Google Maps o texto pegado */
function detectarCoordenadasURL(texto: string): { lat: number; lng: number } | null {
  // Formato 1: https://maps.google.com/?q=18.496946,-70.002151
  const match1 = texto.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (match1) return { lat: parseFloat(match1[1]), lng: parseFloat(match1[2]) };

  // Formato 2: https://www.google.com/maps/@18.496946,-70.002151,17z
  const match2 = texto.match(/maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (match2) return { lat: parseFloat(match2[1]), lng: parseFloat(match2[2]) };

  // Formato 3: coordenadas puras "18.496946,-70.002151"
  const match3 = texto.match(/^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/);
  if (match3) return { lat: parseFloat(match3[1]), lng: parseFloat(match3[2]) };

  return null;
}

export default function Ordenes() {
  const { userProfile } = useApp();

  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrden, setSelectedOrden] = useState<OrdenServicio | null>(null);
  const [showEditInDetail, setShowEditInDetail] = useState(false);

  // Filters
  const [busqueda, setBusqueda] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  // Create form
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [isNewCliente, setIsNewCliente] = useState(false);
  const [form, setForm] = useState({
    clienteId: '',
    clienteNombre: '',
    clienteTelefono: '',
    clienteEmail: '',
    clienteDireccion: '',
    clienteReferencia: '',
    clienteLat: undefined as number | undefined,
    clienteLng: undefined as number | undefined,
    equipoTipo: '',
    equipoMarca: '',
    equipoModelo: '',
    descripcionFalla: '',
    tecnicoId: '',
    tecnicoNombre: '',
    duracionMin: 60,
    fechaCita: '',
    horaInicio: '',
  });
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  // Edit form (dentro del modal de detalles)
  const [editForm, setEditForm] = useState({
    tecnicoId: '',
    tecnicoNombre: '',
    fechaCita: '',
    horaInicio: '',
    clienteTelefono: '',
    clienteDireccion: '',
    clienteReferencia: '',
    clienteLat: undefined as number | undefined,
    clienteLng: undefined as number | undefined,
    descripcionFalla: '',
    notas: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [geoEditLoading, setGeoEditLoading] = useState(false);
  const dirInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  // Listen to real-time updates of the selected orden
  useEffect(() => {
    if (!selectedOrden?.id) return;
    const ordenId = selectedOrden.id;
    const unsub = onSnapshot(
      doc(db, 'ordenes_servicio', ordenId),
      (snap) => {
        if (snap.exists()) {
          setSelectedOrden(parseOrden(snap.id, snap.data() as Record<string, unknown>));
        }
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrden?.id]);

  // Populate edit form when opening edit mode
  useEffect(() => {
    if (showEditInDetail && selectedOrden) {
      const fc = selectedOrden.fechaCita;
      setEditForm({
        tecnicoId: selectedOrden.tecnicoId || '',
        tecnicoNombre: selectedOrden.tecnicoNombre || '',
        fechaCita: fc ? format(fc, 'yyyy-MM-dd') : '',
        horaInicio: fc ? format(fc, 'HH:00') : '',
        clienteTelefono: selectedOrden.clienteTelefono || '',
        clienteDireccion: selectedOrden.clienteDireccion || '',
        clienteReferencia: selectedOrden.clienteReferencia || '',
        clienteLat: selectedOrden.clienteLat,
        clienteLng: selectedOrden.clienteLng,
        descripcionFalla: selectedOrden.descripcionFalla || '',
        notas: selectedOrden.notas || '',
      });
    }
  }, [showEditInDetail, selectedOrden]);

  // Carga Google Places Autocomplete cuando se abre el formulario de edición
  useEffect(() => {
    if (!showEditInDetail) return;

    const initAC = () => {
      if (!dirInputRef.current || !window.google?.maps?.places) return;
      autocompleteRef.current = new window.google.maps.places.Autocomplete(dirInputRef.current, {
        componentRestrictions: { country: 'do' },
        fields: ['formatted_address', 'geometry'],
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (!place.geometry) return;
        setEditForm(f => ({
          ...f,
          clienteDireccion: place.formatted_address || '',
          clienteLat: place.geometry.location.lat(),
          clienteLng: place.geometry.location.lng(),
        }));
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
      // Script ya existe, esperar a que cargue
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(interval);
          initAC();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [showEditInDetail]);

  const handleUsarMiUbicacionEdit = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible en este navegador');
      return;
    }
    setGeoEditLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=es`
          );
          const data = await res.json();
          const raw = (data?.display_name || '').toString();
          // Tomar solo los primeros 3 componentes (calle, barrio, ciudad)
          // para evitar texto extra, URLs de Google Maps, o códigos postales largos
          const direccion = raw
            ? raw.split(',').slice(0, 3).join(',').trim()
            : '';
          setEditForm(f => ({
            ...f,
            clienteDireccion: direccion || f.clienteDireccion,
            clienteLat: latitude,
            clienteLng: longitude,
          }));
          toast.success('Ubicación capturada');
        } catch {
          setEditForm(f => ({ ...f, clienteLat: latitude, clienteLng: longitude }));
          toast.success('Coordenadas capturadas');
        } finally {
          setGeoEditLoading(false);
        }
      },
      (err) => {
        setGeoEditLoading(false);
        toast.error('No se pudo obtener la ubicación: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  /** Maneja cambios en el campo dirección del form de EDICIÓN, detectando URLs de Maps */
  const handleEditDireccionChange = (texto: string) => {
    const coords = detectarCoordenadasURL(texto);
    if (coords) {
      // Guardar la URL ORIGINAL tal como la pegó el usuario + coordenadas exactas
      setEditForm(f => ({
        ...f,
        clienteDireccion: texto,
        clienteLat: coords.lat,
        clienteLng: coords.lng,
      }));
      toast.success('📍 Coordenadas exactas guardadas');
      return;
    }
    setEditForm(f => ({ ...f, clienteDireccion: texto }));
  };

  /** Maneja cambios en el campo dirección del form de CREAR ORDEN, detectando URLs de Maps */
  const handleCreateDireccionChange = (texto: string) => {
    const coords = detectarCoordenadasURL(texto);
    if (coords) {
      // Guardar la URL ORIGINAL tal como la pegó el usuario + coordenadas exactas
      setForm(f => ({
        ...f,
        clienteDireccion: texto,
        clienteLat: coords.lat,
        clienteLng: coords.lng,
      }));
      toast.success('📍 Coordenadas exactas guardadas');
      return;
    }
    setForm(f => ({ ...f, clienteDireccion: texto }));
  };

  const handleGuardarEdicion = async () => {
    if (!selectedOrden) return;
    setSavingEdit(true);
    try {
      let fechaCitaTs: Timestamp | null = null;
      if (editForm.fechaCita && editForm.horaInicio) {
        fechaCitaTs = Timestamp.fromDate(new Date(`${editForm.fechaCita}T${editForm.horaInicio}:00`));
      } else if (editForm.fechaCita) {
        fechaCitaTs = Timestamp.fromDate(new Date(`${editForm.fechaCita}T08:00:00`));
      }

      await updateDoc(doc(db, 'ordenes_servicio', selectedOrden.id), {
        tecnicoId: editForm.tecnicoId,
        tecnicoNombre: editForm.tecnicoNombre,
        fechaCita: fechaCitaTs,
        clienteTelefono: editForm.clienteTelefono,
        clienteDireccion: editForm.clienteDireccion,
        clienteReferencia: editForm.clienteReferencia,
        clienteLat: editForm.clienteLat ?? null,
        clienteLng: editForm.clienteLng ?? null,
        descripcionFalla: editForm.descripcionFalla,
        notas: editForm.notas,
        updatedAt: Timestamp.now(),
      });
      toast.success('Orden actualizada');
      setShowEditInDetail(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar cambios');
    } finally {
      setSavingEdit(false);
    }
  };

  // Load data
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'ordenes_servicio'), orderBy('createdAt', 'desc')),
      (snap) => {
        const data = snap.docs.map(d => parseOrden(d.id, d.data()) as OrdenServicio);
        setOrdenes(data);
        setLoading(false);
      }
    );

    getDocs(collection(db, 'clientes')).then(snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)));
    });

    getDocs(query(collection(db, 'personal'), orderBy('nombre'))).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });

    return () => unsub();
  }, []);

  const tecnicos = useMemo(() => personal.filter(p => p.rol === 'tecnico' && p.activo), [personal]);

  // Today's orders
  const hoy = new Date();
  const ordenesHoy = useMemo(() => {
    return ordenes
      .filter(o => o.fechaCita && isSameDay(o.fechaCita, hoy))
      .sort((a, b) => {
        if (!a.fechaCita || !b.fechaCita) return 0;
        return a.fechaCita.getTime() - b.fechaCita.getTime();
      });
  }, [ordenes]);

  // Filtered orders
  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const matchBusqueda = !busqueda ||
        o.clienteNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        o.numero?.toLowerCase().includes(busqueda.toLowerCase());
      const matchEstado = !filtroEstado || o.estadoSimple === filtroEstado;
      const matchTecnico = !filtroTecnico || o.tecnicoNombre === filtroTecnico;
      const matchMes = !filtroMes || (o.fechaCita && format(o.fechaCita, 'yyyy-MM') === filtroMes);
      return matchBusqueda && matchEstado && matchTecnico && matchMes;
    });
  }, [ordenes, busqueda, filtroEstado, filtroTecnico, filtroMes]);

  // Client search
  const clientesFiltrados = useMemo(() => {
    if (!clienteBusqueda) return [];
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(clienteBusqueda.toLowerCase()) ||
      c.telefono.includes(clienteBusqueda)
    ).slice(0, 5);
  }, [clientes, clienteBusqueda]);

  const handleSelectCliente = (c: Cliente) => {
    setForm(f => ({
      ...f,
      clienteId: c.id,
      clienteNombre: c.nombre,
      clienteTelefono: c.telefono,
      clienteEmail: c.email || '',
      clienteDireccion: c.direccion || '',
      clienteReferencia: c.referenciaDireccion || '',
      clienteLat: c.lat,
      clienteLng: c.lng,
    }));
    setClienteBusqueda(c.nombre);
    setShowClienteDropdown(false);
    setIsNewCliente(false);
  };

  const handleGetUbicacion = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible en este navegador');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({
          ...f,
          clienteLat: pos.coords.latitude,
          clienteLng: pos.coords.longitude,
        }));
        setGeoLoading(false);
        toast.success('Ubicación obtenida');
      },
      () => {
        setGeoLoading(false);
        toast.error('No se pudo obtener la ubicación');
      }
    );
  };

  const handleEstadoChange = async (orden: OrdenServicio, nuevoEstado: EstadoOrdenSimple) => {
    if (nuevoEstado === orden.estadoSimple) return;
    try {
      const nuevaFase = estadoSimpleToFase(nuevoEstado);
      const ahora = Timestamp.now();
      const ref = doc(db, 'ordenes_servicio', orden.id);
      await updateDoc(ref, {
        estadoSimple: nuevoEstado,
        fase: nuevaFase,
        updatedAt: ahora,
        historialFases: [
          ...orden.historialFases.map(h => ({
            ...h,
            timestamp: Timestamp.fromDate(h.timestamp),
          })),
          {
            fase: nuevaFase,
            timestamp: ahora,
            usuario: userProfile?.nombre || 'Sistema',
          },
        ],
      });
      toast.success(`Orden ${orden.numero} actualizada a ${estadoSimpleLabel(nuevoEstado)}`);
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar el estado');
    }
  };

  const handleSubmitOrden = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre || !form.equipoTipo || !form.descripcionFalla) {
      toast.error('Completa los campos requeridos: cliente, equipo y descripción');
      return;
    }
    setSaving(true);
    try {
      // Get next number atomically (unified with seedData counter)
      const numero = await siguienteNumeroOrden();

      // If new client, create in clientes collection
      let clienteId = form.clienteId;
      if (isNewCliente && form.clienteNombre) {
        const clienteDoc = await addDoc(collection(db, 'clientes'), {
          nombre: form.clienteNombre,
          telefono: form.clienteTelefono,
          email: form.clienteEmail || null,
          direccion: form.clienteDireccion,
          referenciaDireccion: form.clienteReferencia || null,
          lat: form.clienteLat || null,
          lng: form.clienteLng || null,
          createdAt: Timestamp.now(),
        });
        clienteId = clienteDoc.id;
        setClientes(prev => [...prev, {
          id: clienteId,
          nombre: form.clienteNombre,
          telefono: form.clienteTelefono,
          email: form.clienteEmail,
          direccion: form.clienteDireccion,
          referenciaDireccion: form.clienteReferencia,
          lat: form.clienteLat,
          lng: form.clienteLng,
          createdAt: new Date(),
        }]);
      }

      // Build fechaCita
      let fechaCita: Timestamp | null = null;
      if (form.fechaCita && form.horaInicio) {
        fechaCita = Timestamp.fromDate(new Date(`${form.fechaCita}T${form.horaInicio}:00`));
      } else if (form.fechaCita) {
        fechaCita = Timestamp.fromDate(new Date(`${form.fechaCita}T08:00:00`));
      }

      const ahora = Timestamp.now();
      const faseInicial: FaseOrden = 'agendado';
      const estadoInicial: EstadoOrdenSimple = 'pendiente';

      await addDoc(collection(db, 'ordenes_servicio'), {
        numero,
        clienteId,
        clienteNombre: form.clienteNombre,
        clienteTelefono: form.clienteTelefono,
        clienteDireccion: form.clienteDireccion,
        equipoTipo: form.equipoTipo,
        equipoMarca: form.equipoMarca,
        equipoModelo: form.equipoModelo || '',
        descripcionFalla: form.descripcionFalla,
        tecnicoId: form.tecnicoId,
        tecnicoNombre: form.tecnicoNombre,
        responsableId: userProfile?.id || '',
        responsableNombre: userProfile?.nombre || '',
        creadoPor: userProfile?.nombre || 'Sistema',
        fase: faseInicial,
        estadoSimple: estadoInicial,
        estado: 'activo',
        fechaCita,
        duracionMin: form.duracionMin,
        reagendada: false,
        notas: '',
        historialFases: [{
          fase: faseInicial,
          timestamp: ahora,
          usuario: userProfile?.nombre || 'Sistema',
        }],
        createdAt: ahora,
        updatedAt: ahora,
      });
      toast.success(`Orden ${numero} creada exitosamente`);
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al crear la orden');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      clienteId: '', clienteNombre: '', clienteTelefono: '', clienteEmail: '',
      clienteDireccion: '', clienteReferencia: '', clienteLat: undefined, clienteLng: undefined,
      equipoTipo: '', equipoMarca: '', equipoModelo: '', descripcionFalla: '',
      tecnicoId: '', tecnicoNombre: '', duracionMin: 60, fechaCita: '', horaInicio: '',
    });
    setClienteBusqueda('');
    setShowClienteDropdown(false);
    setIsNewCliente(false);
  };

  const fechaHoyTexto = format(hoy, "'Hoy,' EEEE dd 'de' MMMM yyyy", { locale: es });
  const fechaHoyCapitalizada = fechaHoyTexto.charAt(0).toUpperCase() + fechaHoyTexto.slice(1);

  if (loading) return <LoadingSpinner fullPage text="Cargando órdenes..." />;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Órdenes de Servicio</h1>
          <p className="text-gray-500 text-sm">{ordenes.length} órdenes en total</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-[#1a5fa8] hover:bg-[#0f3460] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={18} />
          Crear Orden de Servicio
        </button>
      </div>

      {/* Agenda de Hoy */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-[#0f3460]">Agenda de Hoy</h2>
        </div>
        <p className="text-sm text-gray-500">{fechaHoyCapitalizada}</p>
        {ordenesHoy.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-gray-400 text-sm">
            <Calendar size={28} className="mx-auto mb-2 opacity-30" />
            No hay órdenes agendadas para hoy
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ordenesHoy.map(orden => (
              <div
                key={orden.id}
                onClick={() => setSelectedOrden(orden)}
                className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${estadoSimpleBorder(orden.estadoSimple)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-[#0f3460]">
                    {orden.fechaCita ? formatHora(orden.fechaCita) : '--:--'}
                  </span>
                  <Badge fase={orden.fase} />
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{orden.clienteNombre}</p>
                <p className="text-xs text-gray-500 truncate">
                  {orden.equipoTipo}{orden.equipoMarca ? ` - ${orden.equipoMarca}` : ''}
                </p>
                {orden.tecnicoNombre && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <User size={10} /> {orden.tecnicoNombre}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Mes:</label>
          <input
            type="month"
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
          />
        </div>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Buscar nombre, #OS..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
        </div>
        <select
          value={filtroTecnico}
          onChange={e => setFiltroTecnico(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
        >
          <option value="">Todos los técnicos</option>
          {tecnicos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
        </select>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_proceso">En Proceso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {ordenesFiltradas.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin órdenes para mostrar</p>
          </div>
        ) : (
          ordenesFiltradas.map(orden => (
            <div
              key={orden.id}
              className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${estadoSimpleBorder(orden.estadoSimple)} p-4 hover:shadow-md transition-shadow`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                {/* Main content - clickable */}
                <div
                  className="flex-1 cursor-pointer min-w-0"
                  onClick={() => setSelectedOrden(orden)}
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-bold text-[#0f3460]">
                      {orden.numero || '#--'}
                    </span>
                    {orden.reagendada && (
                      <Badge label="Reagendada" color="bg-amber-100 text-amber-700" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {orden.equipoTipo} - {orden.clienteNombre}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                    {orden.fechaCita && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {formatFecha(orden.fechaCita)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {tiempoTranscurrido(orden.createdAt)}
                    </span>
                    {orden.tecnicoNombre && (
                      <span className="flex items-center gap-1">
                        <Wrench size={11} />
                        {orden.tecnicoNombre}
                      </span>
                    )}
                    {orden.responsableNombre && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {orden.responsableNombre}
                      </span>
                    )}
                  </div>
                </div>

                {/* Estado dropdown */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={orden.estadoSimple || 'pendiente'}
                    onChange={(e) => handleEstadoChange(orden, e.target.value as EstadoOrdenSimple)}
                    onClick={(e) => e.stopPropagation()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] cursor-pointer ${estadoSimpleColor(orden.estadoSimple || 'pendiente')}`}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="en_proceso">En Proceso</option>
                    <option value="completado">Completado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedOrden}
        onClose={() => { setSelectedOrden(null); setShowEditInDetail(false); }}
        title={`Orden ${selectedOrden?.numero || ''}`}
        size="lg"
      >
        {selectedOrden && !showEditInDetail && (
          <div className="space-y-6">
            {/* Client Info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Información del Cliente</h3>
              <div className="space-y-2">
                <p className="text-base font-medium text-gray-900">{selectedOrden.clienteNombre}</p>
                {selectedOrden.clienteTelefono && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 flex items-center gap-1.5">
                      <Phone size={14} className="text-gray-400" />
                      {formatTelefono(selectedOrden.clienteTelefono)}
                    </span>
                    <a
                      href={whatsappLink(selectedOrden.clienteTelefono)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      <MessageCircle size={12} />
                      WhatsApp
                    </a>
                  </div>
                )}
                {selectedOrden.clienteDireccion && (
                  <a
                    href={
                      selectedOrden.clienteDireccion.startsWith('http')
                        ? selectedOrden.clienteDireccion
                        : selectedOrden.clienteLat && selectedOrden.clienteLng
                          ? `https://maps.google.com/?q=${selectedOrden.clienteLat},${selectedOrden.clienteLng}`
                          : `https://maps.google.com/?q=${encodeURIComponent(selectedOrden.clienteDireccion)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#1a5fa8] hover:underline flex items-center gap-1.5"
                  >
                    <MapPin size={14} />
                    {selectedOrden.clienteDireccion.startsWith('http') && selectedOrden.clienteLat && selectedOrden.clienteLng
                      ? `📍 ${selectedOrden.clienteLat.toFixed(6)}, ${selectedOrden.clienteLng.toFixed(6)}`
                      : selectedOrden.clienteDireccion}
                  </a>
                )}
              </div>
            </div>

            {/* Service Info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Información del Servicio</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 block text-xs">Fecha de Cita</span>
                  <span className="text-gray-900">{selectedOrden.fechaCita ? formatFecha(selectedOrden.fechaCita) : 'Sin agendar'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Técnico</span>
                  <span className="text-gray-900">{selectedOrden.tecnicoNombre || 'Sin asignar'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Tipo de Equipo</span>
                  <span className="text-gray-900">{selectedOrden.equipoTipo}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Marca</span>
                  <span className="text-gray-900">{selectedOrden.equipoMarca || '--'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Modelo</span>
                  <span className="text-gray-900">{selectedOrden.equipoModelo || '--'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Estado</span>
                  <Badge label={estadoSimpleLabel(selectedOrden.estadoSimple || 'pendiente')} color={estadoSimpleColor(selectedOrden.estadoSimple || 'pendiente')} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-gray-500 block text-xs mb-1">Descripción de la Falla</span>
                <p className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">{selectedOrden.descripcionFalla}</p>
              </div>
            </div>

            {/* Created By */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Creado por</h3>
              <p className="text-sm text-gray-700">
                {selectedOrden.creadoPor || selectedOrden.responsableNombre || 'Sistema'}
                {' '}
                <span className="text-gray-400">- {tiempoTranscurrido(selectedOrden.createdAt)}</span>
              </p>
            </div>

            {/* Editar Button */}
            <div>
              <button
                onClick={() => setShowEditInDetail(!showEditInDetail)}
                className="flex items-center gap-2 px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Edit2 size={14} />
                Editar
              </button>
            </div>

            {/* Phase History Timeline */}
            {selectedOrden.historialFases.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Historial de Fases</h3>
                <div className="relative pl-6 space-y-4">
                  <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-gray-200" />
                  {selectedOrden.historialFases.map((h, i) => (
                    <div key={i} className="relative">
                      <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white ${i === selectedOrden.historialFases.length - 1 ? 'bg-[#1a5fa8]' : 'bg-gray-300'}`} />
                      <div>
                        <Badge fase={h.fase} />
                        <p className="text-xs text-gray-500 mt-1">
                          {formatFecha(h.timestamp)} - {h.usuario}
                        </p>
                        {h.nota && <p className="text-xs text-gray-600 mt-0.5">{h.nota}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit Form dentro del Detail Modal */}
        {selectedOrden && showEditInDetail && (
          <div className="space-y-5">
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-500 font-medium">✏️ Editando orden {selectedOrden.numero}</p>
              <p className="text-lg font-bold text-gray-900">{selectedOrden.clienteNombre}</p>
              <p className="text-sm text-gray-500">{selectedOrden.equipoTipo}{selectedOrden.equipoMarca ? ` · ${selectedOrden.equipoMarca}` : ''}</p>
            </div>

            {/* Técnico */}
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
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>

            {/* Fecha + Hora */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Cita</label>
                <input
                  type="date"
                  value={editForm.fechaCita}
                  onChange={e => setEditForm(f => ({ ...f, fechaCita: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hora de Inicio</label>
                <div className="grid grid-cols-5 gap-1">
                  {HORARIOS.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, horaInicio: h }))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        editForm.horaInicio === h
                          ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5fa8]'
                      }`}
                    >
                      {HORARIOS_LABEL[h]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Teléfono de Contacto */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono de Contacto</label>
              <input
                type="tel"
                value={editForm.clienteTelefono}
                onChange={e => setEditForm(f => ({ ...f, clienteTelefono: e.target.value }))}
                placeholder="Ej: 8095551234"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <p className="text-[11px] text-gray-400 mt-1">Puede ser diferente al teléfono principal del cliente</p>
            </div>

            {/* Dirección de la Cita (Google Places Autocomplete) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dirección de la Cita</label>
              <div className="flex gap-2">
                <input
                  ref={dirInputRef}
                  type="text"
                  value={editForm.clienteDireccion}
                  onChange={e => handleEditDireccionChange(e.target.value)}
                  placeholder="Escribe o pega dirección, URL de Maps, o coordenadas..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleUsarMiUbicacionEdit}
                  disabled={geoEditLoading}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-60"
                >
                  <MapPin size={12} /> {geoEditLoading ? '...' : 'Usar mi ubicación actual'}
                </button>
              </div>
              {editForm.clienteLat && editForm.clienteLng && (
                <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1">
                  ✅ Coordenadas exactas guardadas ·
                  <a
                    href={`https://maps.google.com/?q=${editForm.clienteLat},${editForm.clienteLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:underline font-medium"
                  >
                    Ver en Maps →
                  </a>
                </p>
              )}
            </div>

            {/* Referencia de dirección */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Referencia de dirección</label>
              <input
                type="text"
                value={editForm.clienteReferencia}
                onChange={e => setEditForm(f => ({ ...f, clienteReferencia: e.target.value }))}
                placeholder="Ej: Frente a Agora Mall, casa esquina, portón azul..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>

            {/* Descripción de la Falla */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Descripción de la Falla</label>
              <textarea
                value={editForm.descripcionFalla}
                onChange={e => setEditForm(f => ({ ...f, descripcionFalla: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>

            {/* Notas */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea
                value={editForm.notas}
                onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowEditInDetail(false)}
                disabled={savingEdit}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarEdicion}
                disabled={savingEdit}
                className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              >
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Order Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm(); }}
        title="Crear Orden de Servicio"
        size="xl"
      >
        <form onSubmit={handleSubmitOrden} className="space-y-6">
          {/* Section: Cliente */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
              <User size={16} />
              Cliente
            </h3>
            <div className="space-y-3">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar cliente existente</label>
                <input
                  type="text"
                  placeholder="Nombre o teléfono del cliente..."
                  value={clienteBusqueda}
                  onChange={e => {
                    setClienteBusqueda(e.target.value);
                    setShowClienteDropdown(true);
                    if (form.clienteId) {
                      setForm(f => ({ ...f, clienteId: '', clienteNombre: e.target.value }));
                    } else {
                      setForm(f => ({ ...f, clienteNombre: e.target.value }));
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
                {showClienteDropdown && clienteBusqueda && clientesFiltrados.length > 0 && (
                  <div className="absolute z-10 w-full border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto bg-white shadow-lg">
                    {clientesFiltrados.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCliente(c)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                      >
                        <span className="font-medium">{c.nombre}</span>
                        <span className="text-gray-500 ml-2">{formatTelefono(c.telefono)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {clienteBusqueda && !form.clienteId && clientesFiltrados.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Cliente no encontrado.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewCliente(true);
                        setForm(f => ({ ...f, clienteNombre: clienteBusqueda }));
                        setShowClienteDropdown(false);
                      }}
                      className="text-[#1a5fa8] font-medium hover:underline"
                    >
                      Crear nuevo cliente
                    </button>
                  </p>
                )}
              </div>

              {/* New client fields */}
              {(isNewCliente || form.clienteId) && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  {isNewCliente && (
                    <p className="text-xs font-medium text-[#1a5fa8] mb-2">Nuevo cliente</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                      <input
                        type="text"
                        value={form.clienteNombre}
                        onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono *</label>
                      <input
                        type="tel"
                        value={form.clienteTelefono}
                        onChange={e => setForm(f => ({ ...f, clienteTelefono: e.target.value }))}
                        placeholder="8091234567"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email (opcional)</label>
                      <input
                        type="email"
                        value={form.clienteEmail}
                        onChange={e => setForm(f => ({ ...f, clienteEmail: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={form.clienteDireccion}
                          onChange={e => handleCreateDireccionChange(e.target.value)}
                          placeholder="Calle, sector, ciudad o URL de Google Maps"
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                        />
                        <button
                          type="button"
                          onClick={handleGetUbicacion}
                          disabled={geoLoading}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
                        >
                          <MapPin size={12} />
                          {geoLoading ? 'Obteniendo...' : 'Mi ubicación'}
                        </button>
                      </div>
                      {form.clienteLat && form.clienteLng && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          ✅ Coordenadas exactas guardadas ·
                          <a
                            href={`https://maps.google.com/?q=${form.clienteLat},${form.clienteLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-700 hover:underline font-medium"
                          >
                            Ver en Maps →
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Referencia de dirección</label>
                    <input
                      type="text"
                      value={form.clienteReferencia}
                      onChange={e => setForm(f => ({ ...f, clienteReferencia: e.target.value }))}
                      placeholder="Al lado del colmado, frente al parque..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section: Servicio */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
              <Wrench size={16} />
              Servicio
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Equipo *</label>
                  <input
                    type="text"
                    list="tipos-equipo-list"
                    value={form.equipoTipo}
                    onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                    placeholder="Ej: Lavadora, Nevera..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                  <datalist id="tipos-equipo-list">
                    {TIPOS_EQUIPO.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
                  <input
                    type="text"
                    value={form.equipoMarca}
                    onChange={e => setForm(f => ({ ...f, equipoMarca: e.target.value }))}
                    placeholder="LG, Samsung, Mabe..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
                  <input
                    type="text"
                    value={form.equipoModelo}
                    onChange={e => setForm(f => ({ ...f, equipoModelo: e.target.value }))}
                    placeholder="Modelo del equipo"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción de la Falla *</label>
                <textarea
                  value={form.descripcionFalla}
                  onChange={e => setForm(f => ({ ...f, descripcionFalla: e.target.value }))}
                  rows={3}
                  placeholder="Describe detalladamente el problema del equipo..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
            </div>
          </div>

          {/* Section: Programación */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 flex items-center gap-2">
              <Calendar size={16} />
              Programación
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asignar Técnico</label>
                <select
                  value={form.tecnicoId}
                  onChange={e => {
                    const t = personal.find(p => p.id === e.target.value);
                    setForm(f => ({ ...f, tecnicoId: e.target.value, tecnicoNombre: t?.nombre || '' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
                >
                  <option value="">Sin asignar</option>
                  {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Duración</label>
                <div className="flex flex-wrap gap-2">
                  {DURACIONES.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, duracionMin: d }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.duracionMin === d
                          ? 'bg-[#1a5fa8] text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Cita</label>
                  <input
                    type="date"
                    value={form.fechaCita}
                    onChange={e => setForm(f => ({ ...f, fechaCita: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora de Inicio</label>
                  <div className="grid grid-cols-5 gap-1">
                    {HORARIOS.map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, horaInicio: h }))}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          form.horaInicio === h
                            ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5fa8]'
                        }`}
                      >
                        {HORARIOS_LABEL[h]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setShowCreateModal(false); resetForm(); }}
              className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#1a5fa8] hover:bg-[#0f3460] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Guardar Orden de Servicio
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
