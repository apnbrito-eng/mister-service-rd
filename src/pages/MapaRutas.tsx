import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, getDocs, doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { OrdenServicio, Personal, Cliente, FaseOrden, ZONAS_RD } from '../types';
import { getTecnicoColor, formatHora, faseLabel, formatFecha, formatTelefono, parseOrden, crearRegistroAuditoria } from '../utils';
import { zonaDeOrden, zonaColor } from '../utils/zonas';
import { optimizarRuta, distanciaTotalRuta } from '../utils/rutas';
import { whatsappUrl, mensajesWhatsApp } from '../utils/whatsapp';
import { coordsFromLatLng } from '../utils/maps';
import BotonComoLlegar from '../components/shared/BotonComoLlegar';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import OrdenEditForm from '../components/ordenes/OrdenEditForm';
import type { EditFormState } from '../components/ordenes/OrdenEditForm';
import EliminarOrdenButton from '../components/ordenes/EliminarOrdenButton';
import { MapPin, Navigation, Route, Clock, Phone, Satellite, Truck, WifiOff, Edit2, AlertTriangle } from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import { suscribirTodasUbicaciones } from '../services/gps.service';
import { UbicacionVehiculo } from '../types';
import { formatDistanceToNow, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, isSameDay } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import toast from 'react-hot-toast';

/** Detecta coordenadas en URLs de Google Maps o texto pegado (mismo helper que Ordenes.tsx) */
function detectarCoordenadasURL(texto: string): { lat: number; lng: number } | null {
  const match1 = texto.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (match1) return { lat: parseFloat(match1[1]), lng: parseFloat(match1[2]) };
  const match2 = texto.match(/maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (match2) return { lat: parseFloat(match2[1]), lng: parseFloat(match2[2]) };
  const match3 = texto.match(/^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/);
  if (match3) return { lat: parseFloat(match3[1]), lng: parseFloat(match3[2]) };
  return null;
}

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
  zona?: string | null;
  orden: number; // position in optimized route
}

export default function MapaRutas() {
  // SPRINT-149: `currentUser` necesario para comparar contra `operariaId` que
  // post-SPRINT-105 persiste auth.uid. `userProfile.id` puede ser docId en
  // cascada `personal/` (path B de AppContext).
  const { userProfile, currentUser } = useApp();
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
  const [filtroZona, setFiltroZona] = useState('');
  const [rutaOptimizada, setRutaOptimizada] = useState(true);
  const [tab, setTab] = useState<'rutas' | 'gps_vivo'>('rutas');
  const [ubicacionesLive, setUbicacionesLive] = useState<UbicacionVehiculo[]>([]);

  const puedeReasignar = puede(userProfile, 'ordenesModificar');

  // Drag & drop de pines para reasignar técnico
  const [draggingOrdenId, setDraggingOrdenId] = useState<string | null>(null);
  const [confirmacionReasignar, setConfirmacionReasignar] = useState<{
    orden: OrdenServicio;
    tecnicoDestinoId: string;
  } | null>(null);
  const [motivoReasignar, setMotivoReasignar] = useState('');
  const [savingReasignar, setSavingReasignar] = useState(false);

  // Edición desde pin (reusa OrdenEditForm)
  const [editingOrden, setEditingOrden] = useState<OrdenServicio | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    clienteNombre: '', clienteEmail: '',
    clienteTelefono: '', clienteDireccion: '', clienteReferencia: '',
    clienteLat: undefined, clienteLng: undefined,
    equipoTipo: '', equipoMarca: '', equipoModelo: '',
    equipoModeloFabricante: '',
    descripcionFalla: '', fotoEquipoUrl: '',
    tecnicoId: '', tecnicoNombre: '',
    duracionMin: 60,
    fechaCita: '', horaInicio: '',
    notas: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [geoEditLoading, setGeoEditLoading] = useState(false);
  const [editFotoFile, setEditFotoFile] = useState<File | null>(null);

  const dirInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

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
      // SPRINT-187 Bug A — excluir soft-deleted (mergeados por dedup
      // SPRINT-185) del cruce con órdenes en el mapa de rutas.
      setClientes(
        snap.docs
          .filter(d => d.data().eliminado !== true)
          .map(d => ({ id: d.id, ...d.data() } as Cliente)),
      );
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

  const clienteMap = useMemo(() => {
    const m: Record<string, Cliente> = {};
    clientes.forEach(c => { m[c.id] = c; });
    return m;
  }, [clientes]);

  // Filtro robusto: rango de fechas, fase activa, técnico (por id o nombre case-insensitive), zona
  const ordenesFiltradas = useMemo(() => {
    const inicio = fechaInicio ? startOfDay(new Date(fechaInicio + 'T00:00:00')) : null;
    const fin = fechaFin ? endOfDay(new Date(fechaFin + 'T00:00:00')) : null;
    const nombreFiltro = filtroTecnico
      ? (personal.find(p => p.id === filtroTecnico)?.nombre?.toLowerCase().trim() || '')
      : '';

    return ordenes.filter(o => {
      // Excluir eliminadas y cerrado/cancelado
      if (o.eliminada) return false;
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
      if (filtroZona) {
        const zona = zonaDeOrden(o, clienteMap[o.clienteId]);
        if (zona !== filtroZona) return false;
      }
      return true;
    });
  }, [ordenes, fechaInicio, fechaFin, filtroTecnico, filtroZona, personal, clienteMap]);

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
          zona: zonaDeOrden(o, clienteMap[o.clienteId]),
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

  // Conteo por zona — aplica sobre ordenesFiltradas pero ignorando el propio filtroZona
  // para que la leyenda muestre siempre todas las zonas del rango/técnico activos.
  const cantidadPorZona = useMemo(() => {
    const inicio = fechaInicio ? startOfDay(new Date(fechaInicio + 'T00:00:00')) : null;
    const fin = fechaFin ? endOfDay(new Date(fechaFin + 'T00:00:00')) : null;
    const nombreFiltro = filtroTecnico
      ? (personal.find(p => p.id === filtroTecnico)?.nombre?.toLowerCase().trim() || '')
      : '';
    const conteo: Record<string, number> = {};
    ordenes.forEach(o => {
      if (o.eliminada) return;
      if (['cerrado', 'cancelado'].includes(o.fase)) return;
      if (!o.fechaCita) return;
      if (inicio && o.fechaCita < inicio) return;
      if (fin && o.fechaCita > fin) return;
      if (filtroTecnico) {
        const matchId = o.tecnicoId === filtroTecnico;
        const nombreOrden = o.tecnicoNombre?.toLowerCase().trim() || '';
        const matchNombre = nombreFiltro !== '' && nombreOrden === nombreFiltro;
        if (!matchId && !matchNombre) return;
      }
      const zona = zonaDeOrden(o, clienteMap[o.clienteId]) || 'Sin zona';
      conteo[zona] = (conteo[zona] || 0) + 1;
    });
    return conteo;
  }, [ordenes, fechaInicio, fechaFin, filtroTecnico, personal, clienteMap]);

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
    const fotoUrl = o.fotoEquipoUrl;
    setEditForm({
      clienteNombre: o.clienteNombre || '',
      clienteEmail: o.clienteEmail || '',
      clienteTelefono: o.clienteTelefono || '',
      clienteDireccion: o.clienteDireccion || '',
      clienteReferencia: o.clienteReferencia || '',
      clienteLat: o.clienteLat,
      clienteLng: o.clienteLng,
      equipoTipo: o.equipoTipo || '',
      equipoMarca: o.equipoMarca || '',
      equipoModelo: o.equipoModelo || '',
      equipoModeloFabricante: o.equipoModeloFabricante || '',
      descripcionFalla: o.descripcionFalla || '',
      fotoEquipoUrl: fotoUrl || '',
      tecnicoId: o.tecnicoId || '',
      tecnicoNombre: o.tecnicoNombre || '',
      duracionMin: o.duracionMin || 60,
      fechaCita: o.fechaCita ? format(o.fechaCita, 'yyyy-MM-dd') : '',
      horaInicio: o.fechaCita ? format(o.fechaCita, 'HH:00') : '',
      notas: o.notas || '',
    });
    setEditFotoFile(null);
  };

  const cerrarEdit = () => {
    setEditingOrden(null);
    setEditForm({
      clienteNombre: '', clienteEmail: '',
      clienteTelefono: '', clienteDireccion: '', clienteReferencia: '',
      clienteLat: undefined, clienteLng: undefined,
      equipoTipo: '', equipoMarca: '', equipoModelo: '',
      equipoModeloFabricante: '',
      descripcionFalla: '', fotoEquipoUrl: '',
      tecnicoId: '', tecnicoNombre: '',
      duracionMin: 60,
      fechaCita: '', horaInicio: '',
      notas: '',
    });
    setEditFotoFile(null);
    setSavingEdit(false);
  };

  // Carga Google Places Autocomplete cuando se abre el modal de edición
  useEffect(() => {
    if (!editingOrden) return;

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
      const interval = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(interval); initAC(); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [editingOrden]);

  const handleEditDireccionChange = (texto: string) => {
    const coords = detectarCoordenadasURL(texto);
    if (coords) {
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
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=es`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await res.json();
          const raw = (data?.display_name || '').toString();
          const direccion = raw ? raw.split(',').slice(0, 3).join(',').trim() : '';
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

  const handlePinDragStart = (ordenId: string) => {
    if (!puedeReasignar) return;
    setDraggingOrdenId(ordenId);
    document.body.classList.add('cursor-grabbing');
  };

  const handlePinDragEnd = (orden: OrdenServicio, origLat: number, origLng: number) => (e: L.LeafletEvent) => {
    document.body.classList.remove('cursor-grabbing');
    const dragEvent = e as L.DragEndEvent & { target: L.Marker };
    const originalEvent = (dragEvent as unknown as { originalEvent?: MouseEvent }).originalEvent;
    // Snap back visualmente a la coord original (el pin no se mueve geográficamente)
    dragEvent.target.setLatLng([origLat, origLng]);

    if (!puedeReasignar) {
      setDraggingOrdenId(null);
      return;
    }

    let tecnicoIdDestino: string | null = null;
    if (originalEvent) {
      const el = document.elementFromPoint(originalEvent.clientX, originalEvent.clientY);
      const tecnicoCard = el?.closest<HTMLElement>('[data-tecnico-id]');
      tecnicoIdDestino = tecnicoCard?.getAttribute('data-tecnico-id') || null;
    }

    setDraggingOrdenId(null);

    if (!tecnicoIdDestino) return;
    if (tecnicoIdDestino === orden.tecnicoId) return;

    setMotivoReasignar('');
    setConfirmacionReasignar({ orden, tecnicoDestinoId: tecnicoIdDestino });
  };

  const detectarConflictoHorario = (tecnicoId: string, orden: OrdenServicio): OrdenServicio | null => {
    if (!orden.fechaCita) return null;
    return ordenes.find(o =>
      o.id !== orden.id &&
      !o.eliminada &&
      o.tecnicoId === tecnicoId &&
      o.fechaCita &&
      o.fechaCita.getTime() === orden.fechaCita!.getTime() &&
      !['cerrado', 'cancelado'].includes(o.fase)
    ) || null;
  };

  const handleConfirmarReasignar = async () => {
    if (!confirmacionReasignar) return;
    const { orden, tecnicoDestinoId } = confirmacionReasignar;
    // SPRINT-132: comparar contra (p.uid || p.id). tecnicoDestinoId viene del data-tecnico-id
    // del DOM, que ahora también es (t.uid || t.id) para escribir auth.uid post-c4be345.
    const destino = personal.find(p => (p.uid || p.id) === tecnicoDestinoId);
    if (!destino) {
      toast.error('Técnico destino no encontrado');
      return;
    }
    setSavingReasignar(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const ahora = Timestamp.now();
      const registro = crearRegistroAuditoria(
        usuario, 'editar',
        motivoReasignar.trim()
          ? `Reasignación desde mapa — ${motivoReasignar.trim()}`
          : 'Reasignación desde mapa',
        'tecnico',
        orden.tecnicoNombre || '',
        destino.nombre,
      );
      const payload: Record<string, unknown> = {
        // SPRINT-132 + P-006: persistir auth.uid (no doc id de personal/) para que las rules
        // técnico-gateadas (tecnicoId == request.auth.uid) acepten writes del nuevo dueño.
        tecnicoId: destino.uid || destino.id,
        tecnicoNombre: destino.nombre,
        auditoria: arrayUnion(registro),
        updatedAt: ahora,
      };
      if (destino.operariaId) {
        payload.operariaId = destino.operariaId;
        payload.operariaNombre = destino.operariaNombre || null;
      } else {
        payload.operariaId = null;
        payload.operariaNombre = null;
      }
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), payload);
      toast.success(`Orden reasignada a ${destino.nombre}`);
      setConfirmacionReasignar(null);
      setMotivoReasignar('');
    } catch (err) {
      console.error(err);
      toast.error('Error al reasignar la orden');
    } finally {
      setSavingReasignar(false);
    }
  };

  const handleGuardarEditDesdeMapa = async () => {
    if (!editingOrden) return;
    // Aviso cuando una operaria modifica orden fuera de su grupo
    // SPRINT-149 (P-006 variante operariaId): `editingOrden.operariaId`
    // post-SPRINT-105 persiste auth.uid. Comparar contra `currentUser?.uid` con
    // fallback a `userProfile.id` para operarias pre-onboarding sin doc espejo.
    if (
      userProfile?.rol === 'operaria' &&
      editingOrden.operariaId &&
      editingOrden.operariaId !== (currentUser?.uid || userProfile.id)
    ) {
      const otra = editingOrden.operariaNombre || 'otra operaria';
      const ok = window.confirm(`Esta orden pertenece al grupo de ${otra}. ¿Confirmar el cambio?`);
      if (!ok) return;
    }
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
      // Re-derivar operaria si cambió el técnico.
      // SPRINT-132: comparar contra (p.uid || p.id) para soportar órdenes pre-c4be345
      // (tecnicoId == personal.id) y post-c4be345 (tecnicoId == auth.uid).
      const tecnicoElegido = personal.find(p => (p.uid || p.id) === editForm.tecnicoId);
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
      if (editForm.clienteTelefono !== (editingOrden.clienteTelefono || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambió teléfono del cliente desde mapa', 'clienteTelefono',
          editingOrden.clienteTelefono || '', editForm.clienteTelefono
        ));
      }
      if (editForm.clienteDireccion !== (editingOrden.clienteDireccion || '')) {
        registros.push(crearRegistroAuditoria(usuario, 'editar', 'Cambió dirección del cliente desde mapa', 'clienteDireccion'));
      }
      if (editForm.descripcionFalla !== (editingOrden.descripcionFalla || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Modificó descripción de falla desde mapa', 'descripcionFalla',
          (editingOrden.descripcionFalla || '').slice(0, 50),
          editForm.descripcionFalla.slice(0, 50)
        ));
      }
      if ((editForm.notas || '') !== (editingOrden.notas || '')) {
        registros.push(crearRegistroAuditoria(usuario, 'editar', 'Modificó notas desde mapa', 'notas'));
      }

      // Subir foto nueva si existe
      const fotoPrevUrl = editingOrden.fotoEquipoUrl;
      let fotoUrlFinal: string | null = editForm.fotoEquipoUrl || null;
      if (editFotoFile) {
        try {
          const ts = Date.now();
          const path = `fotos-equipo/${editingOrden.id}/${ts}.jpg`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, editFotoFile);
          fotoUrlFinal = await getDownloadURL(ref);
        } catch (err) {
          console.error('Error subiendo foto del equipo:', err);
          fotoUrlFinal = fotoPrevUrl || null;
        }
      }
      if (fotoUrlFinal !== (fotoPrevUrl || null)) {
        registros.push(crearRegistroAuditoria(usuario, 'editar', 'Cambió foto del equipo desde mapa', 'fotoEquipoUrl'));
      }
      if (editForm.clienteNombre !== (editingOrden.clienteNombre || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambió nombre del cliente desde mapa', 'clienteNombre',
          editingOrden.clienteNombre || '', editForm.clienteNombre
        ));
      }
      if (editForm.equipoTipo !== (editingOrden.equipoTipo || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambió tipo de equipo desde mapa', 'equipoTipo',
          editingOrden.equipoTipo || '', editForm.equipoTipo
        ));
      }
      if (editForm.equipoMarca !== (editingOrden.equipoMarca || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambió marca del equipo desde mapa', 'equipoMarca',
          editingOrden.equipoMarca || '', editForm.equipoMarca
        ));
      }
      if (editForm.equipoModelo !== (editingOrden.equipoModelo || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambió configuración del equipo desde mapa', 'equipoModelo',
          editingOrden.equipoModelo || '', editForm.equipoModelo
        ));
      }
      // SPRINT-186: persistir modelo del fabricante separadamente
      if (editForm.equipoModeloFabricante !== (editingOrden.equipoModeloFabricante || '')) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambió modelo del fabricante desde mapa', 'equipoModeloFabricante',
          editingOrden.equipoModeloFabricante || '', editForm.equipoModeloFabricante
        ));
      }
      if (editForm.duracionMin !== (editingOrden.duracionMin || 60)) {
        registros.push(crearRegistroAuditoria(
          usuario, 'editar', 'Cambió duración estimada desde mapa', 'duracionMin',
          String(editingOrden.duracionMin || 60), String(editForm.duracionMin)
        ));
      }

      const updateData: Record<string, unknown> = {
        clienteNombre: editForm.clienteNombre,
        clienteTelefono: editForm.clienteTelefono,
        clienteDireccion: editForm.clienteDireccion,
        clienteReferencia: editForm.clienteReferencia,
        clienteLat: editForm.clienteLat ?? null,
        clienteLng: editForm.clienteLng ?? null,
        equipoTipo: editForm.equipoTipo,
        equipoMarca: editForm.equipoMarca,
        equipoModelo: editForm.equipoModelo,
        // SPRINT-186: persistir modelo del fabricante (texto libre)
        equipoModeloFabricante: editForm.equipoModeloFabricante.trim() || '',
        descripcionFalla: editForm.descripcionFalla,
        fotoEquipoUrl: fotoUrlFinal,
        tecnicoId: editForm.tecnicoId,
        tecnicoNombre: editForm.tecnicoNombre,
        operariaId: tecnicoElegido?.operariaId || null,
        operariaNombre: tecnicoElegido?.operariaNombre || null,
        duracionMin: editForm.duracionMin,
        fechaCita: fechaCitaTs,
        notas: editForm.notas || '',
        updatedAt: Timestamp.now(),
      };
      if (editForm.clienteEmail) updateData.clienteEmail = editForm.clienteEmail;
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
            {/* P-006: filtra por uid (auth.uid) para alinear con ordenes_servicio.tecnicoId */}
            {tecnicos.filter(t => t.uid).map(t => (
              <option key={t.id} value={t.uid}>{t.nombre}</option>
            ))}
          </select>
          <select value={filtroZona} onChange={e => setFiltroZona(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            <option value="">Todas las zonas</option>
            {ZONAS_RD.map(z => <option key={z} value={z}>{z}</option>)}
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
              // SPRINT-132: (p.uid || p.id) === m.tecnicoId — m.tecnicoId puede ser auth.uid post-c4be345.
              const color = personal.find(p => (p.uid || p.id) === m.tecnicoId)?.color || getTecnicoColor(m.tecnicoNombre);
              const fechaTexto = m.fechaCita ? format(m.fechaCita, 'yyyy-MM-dd') : '';
              const ordenCompleta = ordenes.find(o => o.id === m.id);
              const draggableMarker =
                puedeReasignar &&
                typeof window !== 'undefined' &&
                window.innerWidth >= 768 &&
                !!ordenCompleta;
              const eventHandlers = draggableMarker && ordenCompleta ? {
                dragstart: () => handlePinDragStart(m.id),
                dragend: handlePinDragEnd(ordenCompleta, m.lat, m.lng),
              } : undefined;
              return (
                <Marker
                  key={m.id}
                  position={[m.lat, m.lng]}
                  icon={crearPinSVG(color, m.orden)}
                  draggable={draggableMarker}
                  eventHandlers={eventHandlers}
                  opacity={draggingOrdenId && draggingOrdenId !== m.id ? 0.4 : 1}
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
                      <p className={`text-xs ${zonaColor(m.zona)}`}>
                        Zona: {m.zona || 'No definida'}
                      </p>
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
                            <WhatsAppIcon filled={true} size={12} /> WhatsApp
                          </a>
                        </div>
                      )}
                      <div className="mt-2">
                        <BotonComoLlegar ubicacion={coordsFromLatLng(m.lat, m.lng)} size="sm" />
                      </div>
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => abrirEditarDesdePin(m.id)}
                          className="mt-3 w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-[#1a5fa8] hover:bg-[#0f3460] text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <Edit2 size={11} /> Editar orden
                        </button>
                      )}
                      {(() => {
                        const ordenCompleta = ordenes.find(o => o.id === m.id);
                        return ordenCompleta ? (
                          <div className="mt-2 text-right">
                            <EliminarOrdenButton orden={ordenCompleta} variant="text" />
                          </div>
                        ) : null;
                      })()}
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
              // SPRINT-132: (p.uid || p.id) === m.tecnicoId — m.tecnicoId puede ser auth.uid post-c4be345.
              const color = personal.find(p => (p.uid || p.id) === m.tecnicoId)?.color || getTecnicoColor(m.tecnicoNombre);
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

          {/* Legend con conteo por técnico en el rango (drop zones para reasignar) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Técnicos</p>
              {draggingOrdenId && (
                <span className="text-[10px] font-medium text-[#1a5fa8] animate-pulse">
                  Suelta sobre un técnico
                </span>
              )}
            </div>
            <div className="space-y-1">
              {tecnicos.map(t => {
                const count = cantidadPorTecnico[t.nombre] || 0;
                const ordenArrastrada = draggingOrdenId
                  ? ordenes.find(o => o.id === draggingOrdenId)
                  : null;
                // SPRINT-132 + P-006: el data-tecnico-id que se persistirá en la orden debe ser
                // auth.uid (no el doc id de personal/) para que las rules acepten al nuevo técnico.
                const tecnicoIdParaWrite = t.uid || t.id;
                const esDestinoValido = !!draggingOrdenId && ordenArrastrada?.tecnicoId !== tecnicoIdParaWrite;
                return (
                  <div
                    key={t.id}
                    data-tecnico-id={tecnicoIdParaWrite}
                    className={`flex items-center justify-between gap-2 text-xs text-gray-600 rounded-lg px-2 py-1 transition-all ${
                      esDestinoValido
                        ? 'ring-2 ring-blue-400 bg-blue-50/50 hover:ring-4 hover:ring-blue-600'
                        : ''
                    }`}
                  >
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

          {/* Legend con conteo por zona */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Zonas</p>
              {filtroZona && (
                <button
                  type="button"
                  onClick={() => setFiltroZona('')}
                  className="text-[10px] text-[#1a5fa8] hover:underline"
                >
                  Limpiar filtro
                </button>
              )}
            </div>
            <div className="space-y-1">
              {ZONAS_RD.map(z => {
                const count = cantidadPorZona[z] || 0;
                const activa = filtroZona === z;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setFiltroZona(activa ? '' : z)}
                    className={`w-full flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-lg transition-colors ${
                      activa ? 'bg-[#1a5fa8]/10 text-[#1a5fa8]' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`truncate ${activa ? 'font-semibold' : zonaColor(z)}`}>{z}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${count > 0 ? 'bg-[#1a5fa8]/10 text-[#1a5fa8]' : 'bg-gray-100 text-gray-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
              {cantidadPorZona['Sin zona'] ? (
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500 px-2 py-1">
                  <span className="italic">Sin zona</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 shrink-0">
                    {cantidadPorZona['Sin zona']}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Modal edición desde pin — reusa OrdenEditForm */}
      <Modal
        isOpen={!!editingOrden}
        onClose={cerrarEdit}
        title={editingOrden ? `Editar ${editingOrden.numero || 'orden'}` : 'Editar orden'}
        size="lg"
      >
        {editingOrden && (
          <OrdenEditForm
            editForm={editForm}
            setEditForm={setEditForm}
            selectedOrden={editingOrden}
            tecnicos={tecnicos}
            horariosOcupados={horariosOcupadosEdit}
            onSave={handleGuardarEditDesdeMapa}
            onCancel={cerrarEdit}
            savingEdit={savingEdit}
            dirInputRef={dirInputRef}
            handleEditDireccionChange={handleEditDireccionChange}
            handleUsarMiUbicacionEdit={handleUsarMiUbicacionEdit}
            geoEditLoading={geoEditLoading}
            fotoFile={editFotoFile}
            onPickFoto={(file) => setEditFotoFile(file)}
            onQuitarFoto={() => { setEditFotoFile(null); setEditForm(f => ({ ...f, fotoEquipoUrl: '' })); }}
            userProfile={userProfile}
          />
        )}
      </Modal>

      {/* Modal confirmación de reasignación por drag */}
      <Modal
        isOpen={!!confirmacionReasignar}
        onClose={() => { setConfirmacionReasignar(null); setMotivoReasignar(''); }}
        title={confirmacionReasignar ? `Reasignar orden ${confirmacionReasignar.orden.numero || ''}` : 'Reasignar orden'}
      >
        {confirmacionReasignar && (() => {
          // SPRINT-132: lookup contra (p.uid || p.id) — tecnicoDestinoId puede ser auth.uid post-c4be345.
          const destino = personal.find(p => (p.uid || p.id) === confirmacionReasignar.tecnicoDestinoId);
          const conflicto = destino ? detectarConflictoHorario(destino.uid || destino.id, confirmacionReasignar.orden) : null;
          return (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
                <p><span className="font-semibold">Cliente:</span> {confirmacionReasignar.orden.clienteNombre}</p>
                <p>
                  <span className="font-semibold">Técnico actual:</span>{' '}
                  {confirmacionReasignar.orden.tecnicoNombre || 'Sin asignar'}
                </p>
                <p>
                  <span className="font-semibold">Técnico destino:</span>{' '}
                  {destino?.nombre || '—'}
                </p>
                {confirmacionReasignar.orden.fechaCita && (
                  <p className="text-xs text-gray-500">
                    Cita: {formatFecha(confirmacionReasignar.orden.fechaCita)}
                  </p>
                )}
              </div>

              {conflicto && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-900 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Conflicto de horario</p>
                    <p className="text-xs mt-0.5">
                      {destino?.nombre} ya tiene {conflicto.numero} ({conflicto.clienteNombre})
                      {conflicto.fechaCita ? ` el ${formatFecha(conflicto.fechaCita)}` : ''}. ¿Continuar igual?
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo del cambio (opcional)</label>
                <textarea
                  rows={2}
                  value={motivoReasignar}
                  onChange={e => setMotivoReasignar(e.target.value)}
                  placeholder="Ej: balanceo de carga, zona del nuevo técnico, etc."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setConfirmacionReasignar(null); setMotivoReasignar(''); }}
                  disabled={savingReasignar}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarReasignar}
                  disabled={savingReasignar}
                  className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  {savingReasignar ? 'Guardando...' : 'Confirmar reasignación'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Overlay informativo mientras se arrastra */}
      {draggingOrdenId && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] bg-[#0f3460] text-white px-4 py-2 rounded-full shadow-lg text-xs font-medium pointer-events-none">
          Arrastra el pin sobre un técnico para reasignar
        </div>
      )}
    </div>
  );
}
