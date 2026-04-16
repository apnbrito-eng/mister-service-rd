import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, onSnapshot, addDoc, doc, updateDoc,
  Timestamp, getDocs, query, orderBy, arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { siguienteNumeroOrden } from '../services/contadores.service';
import { OrdenServicio, FaseOrden, EstadoOrdenSimple, Cliente, Personal } from '../types';
import {
  faseLabel, faseColor, formatFecha, formatHora, tiempoTranscurrido,
  TIPOS_EQUIPO, DURACIONES, HORARIOS, HORARIOS_LABEL,
  estadoSimpleLabel, estadoSimpleColor, estadoSimpleBorder,
  formatTelefono, whatsappLink, googleMapsLink, parseOrden, formatMoneda,
  crearRegistroAuditoria
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

import OrdenFilters from '../components/ordenes/OrdenFilters';
import OrdenCard from '../components/ordenes/OrdenCard';
import OrdenDetailModal from '../components/ordenes/OrdenDetailModal';
import OrdenEditForm from '../components/ordenes/OrdenEditForm';
import type { EditFormState } from '../components/ordenes/OrdenEditForm';
import OrdenCreateModal from '../components/ordenes/OrdenCreateModal';
import type { CreateFormState } from '../components/ordenes/OrdenCreateModal';

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
  const [form, setForm] = useState<CreateFormState>({
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
  const [editForm, setEditForm] = useState<EditFormState>({
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

  // Aprobacion de precio
  const [precioAprobacion, setPrecioAprobacion] = useState('');
  const [aprobandoPrecio, setAprobandoPrecio] = useState(false);

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

  // Pre-fill approval input when selecting an order with suggested price
  useEffect(() => {
    if (selectedOrden?.precioSugerido !== undefined && selectedOrden.estadoAprobacion !== 'aprobado') {
      setPrecioAprobacion(String(selectedOrden.precioSugerido));
    } else {
      setPrecioAprobacion('');
    }
  }, [selectedOrden?.id, selectedOrden?.precioSugerido, selectedOrden?.estadoAprobacion]);

  const handleAprobarPrecio = async () => {
    if (!selectedOrden) return;
    const precio = Number(precioAprobacion);
    if (isNaN(precio) || precio <= 0) {
      toast.error('Ingresa un precio valido');
      return;
    }
    setAprobandoPrecio(true);
    try {
      const usuario = userProfile?.nombre || 'Admin';
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'precio_sugerido',
        `Aprobo precio: RD$ ${precio.toLocaleString('es-DO')}`,
        'precioFinal',
        selectedOrden.precioSugerido !== undefined ? `RD$ ${selectedOrden.precioSugerido.toLocaleString('es-DO')}` : '',
        `RD$ ${precio.toLocaleString('es-DO')}`
      );
      await updateDoc(doc(db, 'ordenes_servicio', selectedOrden.id), {
        precioAprobado: precio,
        precioFinal: precio,
        estadoAprobacion: 'aprobado',
        aprobadoPor: usuario,
        fechaAprobacion: Timestamp.now(),
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: Timestamp.now(),
      });
      toast.success('\u{2705} Precio aprobado');
    } catch (err) {
      console.error(err);
      toast.error('Error al aprobar el precio');
    } finally {
      setAprobandoPrecio(false);
    }
  };

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

  // Carga Google Places Autocomplete cuando se abre el formulario de edicion
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
      toast.error('Geolocalizacion no disponible en este navegador');
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
          // para evitar texto extra, URLs de Google Maps, o codigos postales largos
          const direccion = raw
            ? raw.split(',').slice(0, 3).join(',').trim()
            : '';
          setEditForm(f => ({
            ...f,
            clienteDireccion: direccion || f.clienteDireccion,
            clienteLat: latitude,
            clienteLng: longitude,
          }));
          toast.success('Ubicacion capturada');
        } catch {
          setEditForm(f => ({ ...f, clienteLat: latitude, clienteLng: longitude }));
          toast.success('Coordenadas capturadas');
        } finally {
          setGeoEditLoading(false);
        }
      },
      (err) => {
        setGeoEditLoading(false);
        toast.error('No se pudo obtener la ubicacion: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  /** Maneja cambios en el campo direccion del form de EDICION, detectando URLs de Maps */
  const handleEditDireccionChange = (texto: string) => {
    const coords = detectarCoordenadasURL(texto);
    if (coords) {
      // Guardar la URL ORIGINAL tal como la pego el usuario + coordenadas exactas
      setEditForm(f => ({
        ...f,
        clienteDireccion: texto,
        clienteLat: coords.lat,
        clienteLng: coords.lng,
      }));
      toast.success('\u{1F4CD} Coordenadas exactas guardadas');
      return;
    }
    setEditForm(f => ({ ...f, clienteDireccion: texto }));
  };

  /** Maneja cambios en el campo direccion del form de CREAR ORDEN, detectando URLs de Maps */
  const handleCreateDireccionChange = (texto: string) => {
    const coords = detectarCoordenadasURL(texto);
    if (coords) {
      // Guardar la URL ORIGINAL tal como la pego el usuario + coordenadas exactas
      setForm(f => ({
        ...f,
        clienteDireccion: texto,
        clienteLat: coords.lat,
        clienteLng: coords.lng,
      }));
      toast.success('\u{1F4CD} Coordenadas exactas guardadas');
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

      // Construir registros de auditoria comparando valores antes/despues
      const usuario = userProfile?.nombre || 'Sistema';
      const registros: Record<string, unknown>[] = [];

      if (editForm.tecnicoNombre !== (selectedOrden.tecnicoNombre || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambio tecnico asignado', 'tecnicoNombre',
          selectedOrden.tecnicoNombre || 'Sin asignar',
          editForm.tecnicoNombre || 'Sin asignar'
        ));
      }
      const fechaAnteriorStr = selectedOrden.fechaCita ? format(selectedOrden.fechaCita, 'yyyy-MM-dd') : '';
      if (editForm.fechaCita !== fechaAnteriorStr) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambio fecha de cita', 'fechaCita',
          selectedOrden.fechaCita ? formatFecha(selectedOrden.fechaCita) : 'Sin fecha',
          editForm.fechaCita
        ));
      }
      const horaAnteriorStr = selectedOrden.fechaCita ? format(selectedOrden.fechaCita, 'HH:00') : '';
      if (editForm.horaInicio && editForm.horaInicio !== horaAnteriorStr) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambio hora de cita', 'horaInicio',
          horaAnteriorStr, editForm.horaInicio
        ));
      }
      if (editForm.descripcionFalla !== (selectedOrden.descripcionFalla || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Modifico descripcion de falla', 'descripcionFalla',
          (selectedOrden.descripcionFalla || '').slice(0, 50),
          editForm.descripcionFalla.slice(0, 50)
        ));
      }
      if (editForm.notas !== (selectedOrden.notas || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Modifico notas internas', 'notas'
        ));
      }
      if (editForm.clienteTelefono !== (selectedOrden.clienteTelefono || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambio telefono del cliente', 'clienteTelefono',
          selectedOrden.clienteTelefono || '',
          editForm.clienteTelefono
        ));
      }
      if (editForm.clienteDireccion !== (selectedOrden.clienteDireccion || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambio direccion del cliente', 'clienteDireccion'
        ));
      }

      const updateData: Record<string, unknown> = {
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
      };

      if (registros.length > 0) {
        updateData.auditoria = arrayUnion(...registros);
      }

      await updateDoc(doc(db, 'ordenes_servicio', selectedOrden.id), updateData);
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

  // Horarios ocupados — formulario de EDICION
  const horariosOcupados = useMemo(() => {
    if (!editForm.tecnicoId || !editForm.fechaCita) return [];
    const fechaSeleccionada = new Date(editForm.fechaCita + 'T00:00:00');
    return ordenes
      .filter(o =>
        o.id !== selectedOrden?.id &&
        (o.tecnicoId === editForm.tecnicoId || o.tecnicoNombre === editForm.tecnicoNombre) &&
        o.fechaCita &&
        isSameDay(o.fechaCita, fechaSeleccionada) &&
        o.estado !== 'cancelado'
      )
      .map(o => o.fechaCita ? format(o.fechaCita, 'HH:00') : '');
  }, [editForm.tecnicoId, editForm.tecnicoNombre, editForm.fechaCita, ordenes, selectedOrden?.id]);

  // Horarios ocupados — formulario de CREAR
  const horariosOcupadosCreate = useMemo(() => {
    if (!form.tecnicoId || !form.fechaCita) return [];
    const fechaSeleccionada = new Date(form.fechaCita + 'T00:00:00');
    return ordenes
      .filter(o =>
        (o.tecnicoId === form.tecnicoId || o.tecnicoNombre === form.tecnicoNombre) &&
        o.fechaCita &&
        isSameDay(o.fechaCita, fechaSeleccionada) &&
        o.estado !== 'cancelado'
      )
      .map(o => o.fechaCita ? format(o.fechaCita, 'HH:00') : '');
  }, [form.tecnicoId, form.tecnicoNombre, form.fechaCita, ordenes]);

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
      toast.error('Geolocalizacion no disponible en este navegador');
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
        toast.success('Ubicacion obtenida');
      },
      () => {
        setGeoLoading(false);
        toast.error('No se pudo obtener la ubicacion');
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
            fase: h.fase,
            timestamp: Timestamp.fromDate(h.timestamp),
            usuario: h.usuario || '',
            ...(h.nota ? { nota: h.nota } : {}),
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
      toast.error('Completa los campos requeridos: cliente, equipo y descripcion');
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

  if (loading) return <LoadingSpinner fullPage text="Cargando ordenes..." />;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Ordenes de Servicio</h1>
          <p className="text-gray-500 text-sm">{ordenes.length} ordenes en total</p>
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
            No hay ordenes agendadas para hoy
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
      <OrdenFilters
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        filtroMes={filtroMes}
        setFiltroMes={setFiltroMes}
        filtroTecnico={filtroTecnico}
        setFiltroTecnico={setFiltroTecnico}
        filtroEstado={filtroEstado}
        setFiltroEstado={setFiltroEstado}
        tecnicos={tecnicos}
        ESTADOS_SIMPLE={ESTADOS_SIMPLE}
      />

      {/* Orders List */}
      <div className="space-y-3">
        {ordenesFiltradas.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin ordenes para mostrar</p>
          </div>
        ) : (
          ordenesFiltradas.map(orden => (
            <OrdenCard
              key={orden.id}
              orden={orden}
              onSelect={setSelectedOrden}
              onChangeEstado={handleEstadoChange}
            />
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
          <OrdenDetailModal
            orden={selectedOrden}
            userProfile={userProfile}
            onEdit={() => setShowEditInDetail(true)}
            onAprobarPrecio={handleAprobarPrecio}
            precioAprobacion={precioAprobacion}
            setPrecioAprobacion={setPrecioAprobacion}
            aprobandoPrecio={aprobandoPrecio}
          />
        )}

        {/* Edit Form dentro del Detail Modal */}
        {selectedOrden && showEditInDetail && (
          <OrdenEditForm
            editForm={editForm}
            setEditForm={setEditForm}
            selectedOrden={selectedOrden}
            tecnicos={tecnicos}
            horariosOcupados={horariosOcupados}
            onSave={handleGuardarEdicion}
            onCancel={() => setShowEditInDetail(false)}
            savingEdit={savingEdit}
            dirInputRef={dirInputRef}
            handleEditDireccionChange={handleEditDireccionChange}
            handleUsarMiUbicacionEdit={handleUsarMiUbicacionEdit}
            geoEditLoading={geoEditLoading}
          />
        )}
      </Modal>

      {/* Create Order Modal */}
      {showCreateModal && (
        <OrdenCreateModal
          form={form}
          setForm={setForm}
          clienteBusqueda={clienteBusqueda}
          setClienteBusqueda={setClienteBusqueda}
          showClienteDropdown={showClienteDropdown}
          setShowClienteDropdown={setShowClienteDropdown}
          isNewCliente={isNewCliente}
          setIsNewCliente={setIsNewCliente}
          saving={saving}
          geoLoading={geoLoading}
          clientes={clientes}
          clientesFiltrados={clientesFiltrados}
          personal={personal}
          tecnicos={tecnicos}
          horariosOcupadosCreate={horariosOcupadosCreate}
          onSubmit={handleSubmitOrden}
          onClose={() => { setShowCreateModal(false); resetForm(); }}
          handleGetUbicacion={handleGetUbicacion}
          handleCreateDireccionChange={handleCreateDireccionChange}
          handleSelectCliente={handleSelectCliente}
        />
      )}
    </div>
  );
}
