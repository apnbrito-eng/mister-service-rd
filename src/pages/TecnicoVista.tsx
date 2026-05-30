import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, updateDoc, doc, Timestamp, getDocs, query, where, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Cliente, Personal, FaseOrden, TecnicoPermisos, PERMISOS_DEFAULT_TECNICO, StandbyPieza } from '../types';
import { faseLabel, formatHora, formatFecha, formatTelefono, parseOrden, googleMapsLink, estadoSimpleColor, estadoSimpleLabel, crearRegistroAuditoria, formatMoneda, tieneStandby, formatearEquipoLabel, obtenerUltimaSugerenciaSoloChequeo, obtenerSugerenciaSoloChequeoPendiente } from '../utils';
import ModalSugerirSoloChequeo from '../components/cierre/ModalSugerirSoloChequeo';
import BannerEstadoSugerenciaSoloChequeo from '../components/cierre/BannerEstadoSugerenciaSoloChequeo';
import FotoEquipoDisplay from '../components/shared/FotoEquipoDisplay';
import { suscribirConfigEmpresa, CONFIG_EMPRESA_DEFAULT, ConfigEmpresa, PRECIO_CHEQUEO_DEFAULT_FALLBACK } from '../services/configEmpresa.service';
import { crearNotificacion } from '../services/notificaciones.service';
import { marcarVisitaFallida } from '../services/ordenes.service';
import { calcularQuincenaActual, rangoQuincena } from '../utils/comisiones';
import { ComisionRegistro } from '../types';
import { whatsappUrl, mensajesWhatsApp } from '../utils/whatsapp';
import BotonComoLlegar from '../components/shared/BotonComoLlegar';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import Logo from '../components/Logo';
import CierreServicioWizard from '../components/CierreServicioWizard';
import FaseStepper from '../components/ordenes/FaseStepper';
import IniciarChequeoButton from '../components/ordenes/IniciarChequeoButton';
import BannerSiguientePaso from '../components/ordenes/BannerSiguientePaso';
import NotificacionesPanel from '../components/NotificacionesPanel';
import { guardarUbicacionVehiculo } from '../services/gps.service';
import {
  MapPin, Clock, Phone, CheckCircle, LogOut, Navigation,
  User, Bell, StickyNote, Eye, History,
  ClipboardCheck, Pause, Play, Calendar, Wrench, DollarSign
} from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { optimizarRuta } from '../utils/rutas';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function RecenterMap({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [lat, lng, zoom, map]);
  return null;
}

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
  const { userProfile, currentUser } = useApp();
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
  const [comisionesQuincena, setComisionesQuincena] = useState<ComisionRegistro[]>([]);
  const [mostrarDetalleGanancias, setMostrarDetalleGanancias] = useState(false);
  const [standbyItems, setStandbyItems] = useState<StandbyPieza[]>([]);
  const [empresaConfig, setEmpresaConfig] = useState<ConfigEmpresa>({ ...CONFIG_EMPRESA_DEFAULT });

  // Sugerencia de "solo chequeo" desde técnico (sprint R4 endurecida).
  // Antes el técnico podía marcar `soloChequeo: true` directo. Ahora abre
  // ModalSugerirSoloChequeo y queda pendiente de aprobación de oficina.
  const [showSugerirChequeoModal, setShowSugerirChequeoModal] = useState(false);
  const [ordenSugerirChequeo, setOrdenSugerirChequeo] = useState<OrdenServicio | null>(null);

  // Stand-by desde técnico
  const [showStandbyModal, setShowStandbyModal] = useState(false);
  const [ordenStandby, setOrdenStandby] = useState<OrdenServicio | null>(null);
  const [standbyForm, setStandbyForm] = useState<{ motivo: string; hasta: string; notas: string }>({
    motivo: 'Esperando pieza',
    hasta: '',
    notas: '',
  });
  const [savingStandby, setSavingStandby] = useState(false);
  const [reactivandoId, setReactivandoId] = useState<string | null>(null);

  // SPRINT-177: "Avisar a oficina" — el técnico marca visita fallida (no abrió,
  // dirección incorrecta, cliente pidió otra fecha, etc.) y la oficina recibe
  // notif para gestionar (reagendar / llamar / cancelar). NO cambia fase: la
  // orden sigue en `agendado` para permitir reagendar sin retroceder.
  const [ordenAvisar, setOrdenAvisar] = useState<OrdenServicio | null>(null);
  const [detalleVisita, setDetalleVisita] = useState('');
  const [guardandoAviso, setGuardandoAviso] = useState(false);

  const precioChequeoSugerido =
    empresaConfig.precioChequeoDefault ?? PRECIO_CHEQUEO_DEFAULT_FALLBACK;

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
      // SPRINT-187 Bug A — excluir soft-deleted (mergeados por dedup
      // SPRINT-185). El técnico solo debe ver clientes canónicos.
      setClientes(
        snap.docs
          .filter(d => d.data().eliminado !== true)
          .map(d => ({ id: d.id, ...d.data() } as Cliente)),
      );
    });

    const unsubStandby = onSnapshot(collection(db, 'standby_piezas'), (snap) => {
      setStandbyItems(snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        fechaInicio: d.data().fechaInicio?.toDate?.() || new Date(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
      } as StandbyPieza)));
    });

    // Comisiones de la quincena actual (Fase 5)
    let unsubComisiones = () => {};
    // SPRINT-179 (2026-05-18): la query SIN where rompía con permission-denied
    // en la consola al cargar /tecnico. La rule de `comisiones` exige
    // `esTecnico() && resource.data.tecnicoId == request.auth.uid` — Firestore
    // rechaza queries que no garanticen ese matcheo. Agregar
    // `where('tecnicoId', '==', currentUser.uid)` lo arregla. Filtro
    // client-side restante: solo `quincenaAsignada === quincena` (la
    // comparación legacy `c.tecnicoId === userProfile.id` ya no aplica
    // porque la query filtra por auth.uid directamente).
    if (currentUser?.uid) {
      const quincena = calcularQuincenaActual(new Date());
      const qComisiones = query(
        collection(db, 'comisiones'),
        where('tecnicoId', '==', currentUser.uid),
      );
      unsubComisiones = onSnapshot(qComisiones, (snap) => {
        const items = snap.docs
          .map(d => {
            const raw = d.data();
            const desc = raw.descuentoPorGarantia as Record<string, unknown> | undefined;
            const comision: ComisionRegistro = {
              id: d.id,
              tecnicoId: (raw.tecnicoId as string) || '',
              tecnicoNombre: (raw.tecnicoNombre as string) || '',
              ordenId: (raw.ordenId as string) || '',
              ordenNumero: (raw.ordenNumero as string) || '',
              clienteNombre: (raw.clienteNombre as string) || '',
              fechaCobro: raw.fechaCobro?.toDate?.() || new Date(),
              precioFinal: (raw.precioFinal as number) || 0,
              costoPiezas: (raw.costoPiezas as number) || 0,
              basePendienteComision: (raw.basePendienteComision as number) || 0,
              comisionPorcentaje: (raw.comisionPorcentaje as number) || 0,
              comisionMonto: (raw.comisionMonto as number) || 0,
              estadoLiquidacion: (raw.estadoLiquidacion as 'pendiente' | 'liquidada') || 'pendiente',
              quincenaAsignada: raw.quincenaAsignada as string | undefined,
              createdAt: raw.createdAt?.toDate?.() || new Date(),
            };
            if (desc && typeof desc === 'object') {
              comision.descuentoPorGarantia = {
                monto: (desc.monto as number) || 0,
                facturaIdReasignada: (desc.facturaIdReasignada as string) || '',
                conduceNumero: (desc.conduceNumero as string) || '',
                ordenIdReasignada: (desc.ordenIdReasignada as string) || '',
                motivo: (desc.motivo as string) || '',
                notas: (desc.notas as string) || undefined,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                aplicadoEn: (desc.aplicadoEn as any)?.toDate?.() || new Date(),
                aplicadoPor: (desc.aplicadoPor as string) || '',
                aplicadoPorNombre: (desc.aplicadoPorNombre as string) || '',
              };
            }
            return comision;
          })
          // SPRINT-179: query ya filtra por tecnicoId == auth.uid. Solo
          // mantenemos el filtro client-side de quincena.
          .filter(c => c.quincenaAsignada === quincena);
        setComisionesQuincena(items);
      });
    }

    const unsubEmpresa = suscribirConfigEmpresa(cfg => setEmpresaConfig(cfg));

    return () => { unsub(); unsubComisiones(); unsubStandby(); unsubEmpresa(); };
    // SPRINT-179: dep array depende de currentUser.uid (lo que el query
    // filtra). Si cambia el user logueado, el listener se re-suscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  // Auto-compartir ubicación cuando hay órdenes con tracking GPS activo
  useEffect(() => {
    // @safe-userprofile-id: guard de existencia, no es write.
    if (!userProfile?.id) return;

    // Verificar si hay alguna orden asignada al técnico con tracking habilitado
    // @safe-userprofile-id: filtro UI local de "ordenes mías", no escribe a Firestore.
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

    // @safe-userprofile-id: ubicaciones_vehiculos.tecnicoId es descriptor
    // (matchea con personal.{id} para joins UI), no gateado por rule auth.uid.
    // La rule de la colección solo valida esStaff().
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
            // @safe-userprofile-id: ver comentario arriba (vehiculoId).
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
    // @safe-userprofile-id: deps array de useEffect, no es write.
  }, [ordenes, userProfile?.id, userProfile?.nombre]);

  const esOrdenMia = (orden: OrdenServicio): boolean => {
    if (!userProfile) return false;
    // @safe-userprofile-id: check UI local de "es orden mía", no escribe a
    // Firestore. orden.tecnicoId puede ser personalDocId (legacy) o auth.uid
    // (nuevo); el matching por id exacto cubre el primer caso, los matchings
    // por nombre cubren el segundo.
    if (orden.tecnicoId && orden.tecnicoId === userProfile.id) return true;
    // Matching por nombre completo (case-insensitive + trim)
    const nombreOrden = orden.tecnicoNombre?.toLowerCase().trim();
    const nombreProfile = userProfile.nombre?.toLowerCase().trim();
    if (nombreOrden && nombreProfile && nombreOrden === nombreProfile) return true;
    // Matching fuzzy por primer nombre (tolera "Jorge" vs "Jorge Brito")
    const primerNombre = nombreProfile?.split(' ')[0];
    if (primerNombre && nombreOrden && nombreOrden.includes(primerNombre)) return true;
    return false;
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
        if (o.eliminada) return false;
        if (permisos.soloPropiasCitas && !esOrdenMia(o)) return false;
        // Excluir explícitamente cerrado/cancelado tanto por estado como por fase
        if (o.estado === 'cancelado' || o.estado === 'cerrado') return false;
        if (o.fase === 'cancelado' || o.fase === 'cerrado') return false;
        if (!o.fechaCita) return false;
        return o.fechaCita >= start && o.fechaCita <= end;
      })
      .sort((a, b) => (a.fechaCita?.getTime() || 0) - (b.fechaCita?.getTime() || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, vista, permisos.soloPropiasCitas, userProfile?.id, userProfile?.nombre, rangoAplicado]);

  const getClienteUbicacion = (orden: OrdenServicio) => {
    // 1) Preferir coordenadas guardadas en la propia orden (más frescas/precisas)
    if (
      typeof orden.clienteLat === 'number' &&
      typeof orden.clienteLng === 'number' &&
      !isNaN(orden.clienteLat) &&
      !isNaN(orden.clienteLng) &&
      orden.clienteLat !== 0 &&
      orden.clienteLng !== 0
    ) {
      return {
        lat: orden.clienteLat,
        lng: orden.clienteLng,
        direccion: orden.clienteDireccion || '',
      };
    }
    // 2) Fallback: coordenadas del registro del cliente
    const c = clientes.find(cl => cl.id === orden.clienteId);
    if (
      c &&
      typeof c.lat === 'number' &&
      typeof c.lng === 'number' &&
      !isNaN(c.lat) &&
      !isNaN(c.lng) &&
      c.lat !== 0 &&
      c.lng !== 0
    ) {
      return {
        lat: c.lat,
        lng: c.lng,
        direccion: c.direccion || orden.clienteDireccion || '',
      };
    }
    return null;
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
      const ahora = Timestamp.now();
      const registros: Record<string, unknown>[] = [];
      registros.push(crearRegistroAuditoria(
        usuario, 'nota_tecnico', `Agregó nota técnica: "${notaNueva.slice(0, 60)}${notaNueva.length > 60 ? '...' : ''}"`
      ));

      const updateData: Record<string, unknown> = {
        notasTecnico: notasActualizadas,
        updatedAt: ahora,
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

        // SPRINT-158c bug 2: avanzar fase a 'en_cotizacion' cuando el técnico
        // sugiere precio. Antes, la fase quedaba stuck en 'en_diagnostico'
        // hasta que la operaria aprobaba (entonces saltaba a 'aprobado',
        // omitiendo 'en_cotizacion'). Sub-regla CLAUDE.md "registros
        // sincronizados": fase + estadoSimple + estado + historialFases
        // alineados en el mismo updateDoc.
        //
        // Guard de retroceso: SOLO avanzar si la orden está en
        // 'en_diagnostico'. Si ya está en 'en_cotizacion', 'aprobado',
        // 'agendado' o más adelante, mantener la fase actual (sugerir
        // precio puede pasar como ajuste de cotización sin retroceder).
        // Patrón canónico de SPRINT-173 (d8f376b) en AgendaDia.tsx.
        if (selectedOrden.fase === 'en_diagnostico') {
          const nuevoHistorialFases = [
            ...(selectedOrden.historialFases || []).map((h) => ({
              fase: h.fase,
              timestamp: h.timestamp instanceof Date ? Timestamp.fromDate(h.timestamp) : h.timestamp,
              usuario: h.usuario || '',
              ...(h.nota ? { nota: h.nota } : {}),
            })),
            {
              fase: 'en_cotizacion' as FaseOrden,
              timestamp: ahora,
              usuario,
              nota: `Precio sugerido: RD$ ${Number(precioSugerido).toLocaleString('es-DO')}`,
            },
          ];
          updateData.fase = 'en_cotizacion';
          updateData.estadoSimple = 'en_proceso';
          updateData.estado = 'activo';
          updateData.historialFases = nuevoHistorialFases;
        }
      }

      updateData.auditoria = arrayUnion(...registros);

      await updateDoc(doc(db, 'ordenes_servicio', selectedOrden.id), updateData);

      // SPRINT-174: si el técnico sugirió un precio (precioSugerido seteado),
      // emitir notif `cotizacion_lista` a la operaria del técnico +
      // admins/coords. Autoexclusión del propio técnico (es quien sugirió).
      // Patrón canónico SPRINT-169 (`5823955`): try/catch independiente por
      // destinatario, `p.uid` siempre (P-007), no bloquea el flujo si falla.
      const sugirioPrecio = precioSugerido && !isNaN(Number(precioSugerido));
      if (sugirioPrecio) {
        const precioNum = Number(precioSugerido);
        const ordenSnapshot = selectedOrden;
        try {
          // Operaria asociada al técnico (operariaId persiste `auth.uid`
          // post-SPRINT-149). Si la orden no tiene operariaId, también
          // notificamos a operarias activas vía el sweep de staff abajo.
          if (
            ordenSnapshot.operariaId &&
            ordenSnapshot.operariaId !== currentUser?.uid
          ) {
            try {
              await crearNotificacion({
                userId: ordenSnapshot.operariaId,
                destinatarioNombre: ordenSnapshot.operariaNombre,
                tipo: 'cotizacion_lista',
                titulo: `Cotización lista · ${ordenSnapshot.numero || 'orden'}`,
                mensaje: `Técnico sugirió RD$${precioNum.toLocaleString('es-DO')} para ${ordenSnapshot.clienteNombre}. Revisá y aprobá el precio.`,
                ordenId: ordenSnapshot.id,
                ordenNumero: ordenSnapshot.numero,
              });
            } catch (notifErr) {
              console.error('[SPRINT-174] cotizacion_lista a operaria falló:', notifErr);
            }
          }
          // Admins + coordinadoras activos.
          try {
            const qStaff = query(
              collection(db, 'personal'),
              where('activo', '==', true),
              where('rol', 'in', ['administrador', 'coordinadora']),
            );
            const snapStaff = await getDocs(qStaff);
            const destinatariosStaff = snapStaff.docs
              .map(d => ({ id: d.id, ...d.data() } as Personal))
              .filter(
                p =>
                  !!p.uid &&
                  p.uid !== currentUser?.uid &&
                  p.uid !== ordenSnapshot.operariaId,
              );
            for (const destino of destinatariosStaff) {
              try {
                await crearNotificacion({
                  userId: destino.uid!,
                  destinatarioNombre: destino.nombre,
                  tipo: 'cotizacion_lista',
                  titulo: `Cotización lista · ${ordenSnapshot.numero || 'orden'}`,
                  mensaje: `Técnico ${ordenSnapshot.tecnicoNombre || ''} sugirió RD$${precioNum.toLocaleString('es-DO')} para ${ordenSnapshot.clienteNombre}.`,
                  ordenId: ordenSnapshot.id,
                  ordenNumero: ordenSnapshot.numero,
                });
              } catch (err) {
                console.error('[SPRINT-174] cotizacion_lista a staff falló para', destino.uid, err);
              }
            }
          } catch (errStaff) {
            console.error('[SPRINT-174] cotizacion_lista fallo enumerando staff:', errStaff);
          }
        } catch (errNotif) {
          console.error('[SPRINT-174] cotizacion_lista bloque externo:', errNotif);
        }
      }

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

  // SPRINT-177: confirmar "Avisar a oficina" desde el modal. Persiste
  // `visitaFallida` en la orden + audit log + notifs a operarias/coords/admins.
  // currentUser.uid es OBLIGATORIO (la rule de ordenes_servicio gatea por
  // tecnicoId == auth.uid; userProfile.id puede ser personalDocId vía fallback
  // — ver gotcha CLAUDE.md). P-001 cazador.
  const handleConfirmarAviso = async () => {
    if (!ordenAvisar) return;
    if (!currentUser?.uid) {
      toast.error('Sesión inválida — recargá la página');
      return;
    }
    const detalleTrim = detalleVisita.trim();
    if (detalleTrim.length < 10) {
      toast.error('Escribí al menos 10 caracteres explicando qué pasó');
      return;
    }
    setGuardandoAviso(true);
    try {
      await marcarVisitaFallida(ordenAvisar.id, {
        detalleCliente: detalleTrim,
        tecnicoUid: currentUser.uid,
        tecnicoNombre: userProfile?.nombre || 'Técnico',
      });
      toast.success('Aviso enviado a oficina');
      setOrdenAvisar(null);
      setDetalleVisita('');
    } catch (err) {
      console.error('[TecnicoVista] marcarVisitaFallida:', err);
      toast.error('No se pudo enviar el aviso. Reintentá.');
    } finally {
      setGuardandoAviso(false);
    }
  };

  const cerrarAvisoModal = () => {
    if (guardandoAviso) return;
    setOrdenAvisar(null);
    setDetalleVisita('');
  };

  // Sprint R4 endurecida: el técnico ya NO cierra como solo chequeo
  // unilateralmente. Solo abre el modal de sugerencia → oficina aprueba.
  const abrirSugerirChequeo = (orden: OrdenServicio) => {
    setOrdenSugerirChequeo(orden);
    setShowSugerirChequeoModal(true);
  };

  const cerrarSugerirChequeoModal = () => {
    setShowSugerirChequeoModal(false);
    setOrdenSugerirChequeo(null);
  };

  const abrirStandby = (orden: OrdenServicio) => {
    setOrdenStandby(orden);
    setStandbyForm({ motivo: 'Esperando pieza', hasta: '', notas: '' });
    setShowStandbyModal(true);
  };

  const cerrarStandbyModal = () => {
    setShowStandbyModal(false);
    setOrdenStandby(null);
    setStandbyForm({ motivo: 'Esperando pieza', hasta: '', notas: '' });
  };

  const handleConfirmarStandby = async () => {
    if (!ordenStandby) return;
    if (!standbyForm.motivo.trim()) {
      toast.error('Selecciona un motivo');
      return;
    }
    setSavingStandby(true);
    try {
      const ahora = Timestamp.now();
      const usuario = userProfile?.nombre || 'Técnico';
      const detalleHasta = standbyForm.hasta
        ? ` · estimada reactivación ${standbyForm.hasta}`
        : '';
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'poner_standby',
        `Puso la orden en stand-by — ${standbyForm.motivo.trim()}${detalleHasta}`,
        'enStandby',
        'false',
        'true'
      );
      const payload: Record<string, unknown> = {
        enStandby: true,
        standbyMotivo: standbyForm.motivo.trim(),
        standbyDesde: ahora,
        standbyPor: usuario,
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: ahora,
      };
      if (standbyForm.hasta) {
        const dt = new Date(`${standbyForm.hasta}T00:00:00`);
        if (!isNaN(dt.getTime())) payload.standbyHasta = Timestamp.fromDate(dt);
      }
      if (standbyForm.notas.trim()) payload.standbyNotas = standbyForm.notas.trim();
      await updateDoc(doc(db, 'ordenes_servicio', ordenStandby.id), payload);
      toast.success('Orden marcada pendiente de piezas');
      cerrarStandbyModal();
    } catch (err) {
      console.error(err);
      toast.error('Error al marcar pendiente de piezas');
    } finally {
      setSavingStandby(false);
    }
  };

  const handleReactivarOrden = async (orden: OrdenServicio) => {
    setReactivandoId(orden.id);
    try {
      const usuario = userProfile?.nombre || 'Técnico';
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'reactivar_orden',
        'Reactivó la orden desde stand-by',
        'enStandby',
        'true',
        'false'
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        enStandby: false,
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: Timestamp.now(),
      });
      toast.success('Orden reactivada');
    } catch (err) {
      console.error(err);
      toast.error('Error al reactivar orden');
    } finally {
      setReactivandoId(null);
    }
  };

  const [capturandoGpsOrdenId, setCapturandoGpsOrdenId] = useState<string | null>(null);

  const handleCapturarGpsOrden = (orden: OrdenServicio) => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no disponible en este dispositivo');
      return;
    }
    setCapturandoGpsOrdenId(orden.id);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const usuario = userProfile?.nombre || 'Técnico';
          const registro = crearRegistroAuditoria(
            usuario,
            'editar',
            'Capturó ubicación GPS desde el dispositivo del técnico',
            'clienteLat/Lng',
            '',
            `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          );
          await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
            clienteLat: latitude,
            clienteLng: longitude,
            updatedAt: Timestamp.now(),
            auditoria: arrayUnion(registro),
          });
          toast.success('Ubicación guardada');
        } catch (err) {
          console.error(err);
          toast.error('Error al guardar la ubicación');
        } finally {
          setCapturandoGpsOrdenId(null);
        }
      },
      (err) => {
        setCapturandoGpsOrdenId(null);
        toast.error('No se pudo obtener la ubicación: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
      <div className="bg-primary px-4 py-3 sticky top-0 z-20 shadow-md">
        <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
          {/* SPRINT-DISENO-TECNICO-FASE-1 (2026-05-30): saludo compactado en
              el header en una sola línea junto al logo. Antes vivía como
              greeting grande arriba del listado. La fecha + botón "Ver Ruta
              del Día" quedan abajo (greeting reducido). */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Logo size="sm" white />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">
                {nombreCorto}
              </p>
              <p className="text-[10px] text-white/70 leading-tight">
                {citasFiltradas.length} cita{citasFiltradas.length !== 1 ? 's' : ''} hoy
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {compartiendoGPS && (
              <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full" title="Compartiendo ubicación">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                <span className="text-[10px] text-green-200 hidden sm:inline">🛰️ Ubicación activa</span>
              </div>
            )}
            {nuevaCitaBadge && permisos.recibeNotificacionNuevaCita && (
              <button onClick={() => setNuevaCitaBadge(false)} className="relative p-2 text-white" title="Nueva cita asignada">
                <Bell size={18} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              </button>
            )}
            <NotificacionesPanel theme="dark" />
            {permisos.verUbicacionGPS && (
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
        {/* SPRINT-DISENO-TECNICO-FASE-1 (2026-05-30): la card de ganancias
            quincenales se movió ABAJO del listado de citas. Lo primero que
            ve el técnico al abrir es el saludo + lista de citas. */}

        {/* Greeting reducido (SPRINT-DISENO-TECNICO-FASE-1 2026-05-30):
            "Buenos días, {nombre}" se movió al header. Acá quedan solo la
            fecha y el botón "Ver Ruta del Día". */}
        <div className="text-center">
          <p className="text-xs text-gray-500 capitalize inline-flex items-center gap-1.5">
            <Calendar size={12} /> {format(hoy, "EEEE, dd 'de' MMMM yyyy", { locale: es })}
          </p>
          {permisos.verUbicacionGPS && (
            <button
              onClick={() => setShowMap(!showMap)}
              className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-primary hover:bg-primary-medium text-white rounded-xl text-xs font-medium transition-colors"
            >
              <Navigation size={14} />
              {showMap ? 'Ocultar mapa' : (marcadoresMapa.length > 0 ? 'Ver Ruta del Día' : 'Ver Mapa')}
              {marcadoresMapa.length > 0 && (
                <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">{marcadoresMapa.length}</span>
              )}
            </button>
          )}
        </div>

        {/* Mapa de Ruta del Día */}
        {showMap && permisos.verUbicacionGPS && (() => {
          const hayMarcadores = marcadoresMapa.length > 0;
          const mapLat = hayMarcadores ? marcadoresMapa[0].lat : 18.48;
          const mapLng = hayMarcadores ? marcadoresMapa[0].lng : -69.93;
          const mapZoom = hayMarcadores ? 13 : 12;
          return (
            <div className="space-y-2">
              <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100" style={{ height: '320px' }}>
                <MapContainer
                  center={[mapLat, mapLng]}
                  zoom={mapZoom}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <RecenterMap lat={mapLat} lng={mapLng} zoom={mapZoom} />
                  {marcadoresMapa.map(m => (
                    <Marker key={m.id} position={[m.lat, m.lng]} icon={crearPinNumerado(m.orden)}>
                      <Popup>
                        <div className="text-sm min-w-[180px]">
                          <p className="font-semibold text-primary">{m.orden}. {m.clienteNombre}</p>
                          <p className="mt-0.5 inline-flex items-center gap-1"><Clock size={11} /> {formatHora(m.fechaCita)}</p>
                          <p className="text-xs text-gray-700 mt-0.5 inline-flex items-center gap-1">
                            <Wrench size={11} /> {m.equipoTipo}{m.equipoMarca ? ` · ${m.equipoMarca}` : ''}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5 inline-flex items-center gap-1"><MapPin size={11} /> {m.direccion}</p>
                          <div className="flex gap-1 mt-2">
                            <button
                              type="button"
                              onClick={() => setSelectedOrden(m)}
                              className="flex-1 px-2 py-1 bg-primary hover:bg-primary-medium text-white rounded text-xs font-medium"
                            >
                              Ver detalle
                            </button>
                            <a
                              href={googleMapsLink(m.lat, m.lng)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium inline-flex items-center"
                            >
                              Ir
                            </a>
                          </div>
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
                {!hayMarcadores && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-md text-xs text-gray-600 flex items-center gap-2">
                    <MapPin size={12} />
                    Sin citas programadas con ubicación GPS en este período
                  </div>
                )}
              </div>

              {/* Panel inferior compacto con paradas en orden (solo si hay marcadores) */}
              {hayMarcadores && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                    <Navigation size={12} /> Ruta optimizada · {marcadoresMapa.length} paradas
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {marcadoresMapa.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <div className="w-6 h-6 rounded-full bg-primary-medium text-white flex items-center justify-center font-bold flex-shrink-0">
                          {m.orden}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{m.clienteNombre}</p>
                          <p className="text-[10px] text-gray-500">{formatHora(m.fechaCita)} · {m.equipoTipo}</p>
                        </div>
                      </div>
                    ))}
                  </div>
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
              )}
            </div>
          );
        })()}

        {/* Lista citas */}
        {citasFiltradas.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Clock size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400">Sin citas en este período</p>
          </div>
        ) : (
          <div className="space-y-3">
            {citasFiltradas.map((orden, idx) => {
              const ubi = getClienteUbicacion(orden);
              const completado = orden.fase === 'trabajo_realizado' || orden.fase === 'cerrado';
              // SPRINT-DISENO-TECNICO-FASE-1 (2026-05-30): etiqueta "PRÓXIMA
              // CITA" sólo sobre la primera cita NO completada del listado.
              // Buscamos el primer índice no completado para evitar etiquetar
              // una orden ya cerrada cuando la primera del listado lo está.
              const idxProxima = citasFiltradas.findIndex(
                o => o.fase !== 'trabajo_realizado' && o.fase !== 'cerrado'
              );
              const esProxima = idx === idxProxima;
              return (
                <div key={orden.id}>
                {esProxima && (
                  <p className="text-[10px] uppercase tracking-wide font-bold text-primary mb-1 px-1">
                    Próxima cita
                  </p>
                )}
                <div
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
                    <div className="mb-3">
                      <FaseStepper orden={orden} size="sm" readonly={true} tienestandby={tieneStandby(orden, standbyItems)} />
                    </div>

                    {/* Siguiente paso contextual al rol técnico (SPRINT-113a) */}
                    {!completado && (
                      <div className="mb-3">
                        <BannerSiguientePaso orden={orden} rol={userProfile?.rol} size="sm" />
                      </div>
                    )}

                    {/* Equipo */}
                    <div className="flex items-start gap-3">
                      {orden.fotoEquipoUrl && (
                        <FotoEquipoDisplay url={orden.fotoEquipoUrl} size="sm" />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-gray-900">
                          {formatearEquipoLabel(orden)}
                        </h3>
                        {orden.descripcionFalla && (
                          <p className="text-xs text-gray-600 mt-1"><strong>Falla:</strong> {orden.descripcionFalla}</p>
                        )}
                      </div>
                    </div>

                    {/* Dirección (siempre visible) */}
                    {(orden.clienteDireccion || ubi) && (
                      <div className="mt-3 flex items-start gap-2">
                        <MapPin size={14} className="text-primary-medium mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-700 flex-1">{orden.clienteDireccion || ubi?.direccion}</p>
                      </div>
                    )}

                    {/* Cómo llegar — acción principal del técnico, prominente */}
                    {!completado && (
                      <div className="mt-3">
                        <BotonComoLlegar
                          ubicacion={ubi ? { lat: ubi.lat, lng: ubi.lng } : null}
                          size="lg"
                          variant="block"
                        />
                      </div>
                    )}

                    {/* Cliente */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <User size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-800">{orden.clienteNombre}</span>
                      {permisos.puedeContactarCliente && orden.clienteTelefono && (
                        <a
                          href={whatsappUrl(
                            orden.clienteTelefono,
                            `Hola ${orden.clienteNombre.trim().split(/\s+/)[0] || ''}, te escribimos de Mister Service RD.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="ml-auto inline-flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold min-h-[40px]"
                          title={`Enviar WhatsApp a ${orden.clienteNombre}`}
                        >
                          <WhatsAppIcon filled={false} className="text-white" size={14} /> WhatsApp
                        </a>
                      )}
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
                        <span className="font-medium inline-flex items-center gap-1"><Wrench size={11} /> Mis notas:</span>
                        <span className="ml-1 whitespace-pre-line">
                          {orden.notasTecnico.length > 100 ? orden.notasTecnico.substring(0, 100) + '...' : orden.notasTecnico}
                        </span>
                      </div>
                    )}
                    {orden.precioSugerido !== undefined && orden.precioSugerido !== null && (
                      <div className="mt-1 bg-green-50 rounded-lg p-2 text-xs text-green-800 border border-green-100">
                        <span className="font-medium inline-flex items-center gap-1"><DollarSign size={11} /> Mi precio:</span>
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

                    {/* Banner stand-by — reemplaza acciones normales */}
                    {!completado && orden.enStandby && (
                      <div className="mt-4 space-y-2">
                        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-3 flex items-start gap-2">
                          <Pause size={16} className="text-yellow-700 mt-0.5 shrink-0" />
                          <div className="flex-1 text-xs text-yellow-900">
                            <p className="font-semibold inline-flex items-center gap-1">
                              <Pause size={12} /> Pendiente de piezas
                              {orden.standbyHasta && (
                                <span className="ml-1 font-normal">
                                  · hasta {format(orden.standbyHasta instanceof Date ? orden.standbyHasta : new Date(), 'dd/MM/yyyy', { locale: es })}
                                </span>
                              )}
                            </p>
                            {orden.standbyMotivo && (
                              <p className="mt-0.5">Motivo: {orden.standbyMotivo}</p>
                            )}
                            {orden.standbyNotas && (
                              <p className="mt-0.5 italic">{orden.standbyNotas}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleReactivarOrden(orden)}
                            disabled={reactivandoId === orden.id}
                            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                          >
                            <Play size={12} /> {reactivandoId === orden.id ? 'Reactivando...' : '▶ Reactivar'}
                          </button>
                          <button onClick={() => setSelectedOrden(orden)}
                            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium ml-auto">
                            <Eye size={12} /> Ver detalle
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Banner de estado de sugerencia "solo chequeo" (sprint R4 endurecida) */}
                    {!completado && !orden.enStandby && (() => {
                      const ultimaSug = obtenerUltimaSugerenciaSoloChequeo(orden);
                      // Si está aprobada y la orden ya tiene soloChequeo:true, no mostramos
                      // (el cierre normal seguirá su flujo). Si rechazada o pendiente, sí.
                      if (!ultimaSug) return null;
                      if (ultimaSug.estado === 'aprobada' && orden.soloChequeo === true && orden.fase === 'cerrado') {
                        return null;
                      }
                      return (
                        <div className="mt-3">
                          <BannerEstadoSugerenciaSoloChequeo sugerencia={ultimaSug} />
                        </div>
                      );
                    })()}

                    {/* Actions (orden activa, no en stand-by) */}
                    {!completado && !orden.enStandby && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {/* Iniciar chequeo (foto + GPS, solo el día de la cita) */}
                        <IniciarChequeoButton orden={orden} userProfile={userProfile} size="sm" />
                        {permisos.puedeMarcarCompletado && (() => {
                          const sugerenciaPendiente = obtenerSugerenciaSoloChequeoPendiente(orden);
                          const necesitaAprobacion =
                            orden.precioSugerido !== undefined &&
                            orden.estadoAprobacion !== 'aprobado';
                          if (sugerenciaPendiente) {
                            return (
                              <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 flex items-center gap-1">
                                ⏳ Solo chequeo enviado a oficina — esperando aprobación
                              </div>
                            );
                          }
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
                        {/* Sugerir solo chequeo (cliente no procede) — sprint R4 endurecida.
                            El técnico envía sugerencia, oficina aprueba. */}
                        {permisos.puedeMarcarCompletado &&
                          !orden.soloChequeo &&
                          !obtenerSugerenciaSoloChequeoPendiente(orden) &&
                          ['en_diagnostico', 'en_cotizacion', 'aprobado'].includes(orden.fase) && (
                          <button
                            onClick={() => abrirSugerirChequeo(orden)}
                            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-medium"
                            title={`Sugerir solo chequeo (default RD$${precioChequeoSugerido.toLocaleString('es-DO')}) — requiere aprobación de oficina`}
                          >
                            <ClipboardCheck size={12} /> Sugerir solo chequeo
                          </button>
                        )}
                        {/* Poner en stand-by */}
                        {permisos.puedeMarcarCompletado &&
                          !orden.soloChequeo &&
                          ['en_diagnostico', 'en_cotizacion', 'aprobado'].includes(orden.fase) && (
                          <button
                            onClick={() => abrirStandby(orden)}
                            className="flex items-center gap-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-2 rounded-lg text-xs font-medium"
                            title="Marcar pendiente de piezas"
                          >
                            <Pause size={12} /> Pendiente de piezas
                          </button>
                        )}
                        {/* SPRINT-177: "Avisar a oficina" — el técnico llega
                            pero la visita no se concreta. Disponible mientras
                            la orden esté agendada o en diagnóstico inicial y
                            no haya un aviso activo (banner amarillo). */}
                        {['agendado', 'en_diagnostico'].includes(orden.fase) && !orden.visitaFallida && (
                          <button
                            type="button"
                            onClick={() => setOrdenAvisar(orden)}
                            className="flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs font-medium border border-amber-300"
                            title="No pude completar la visita — avisar a oficina"
                            data-testid="btn-avisar-oficina"
                          >
                            <Bell size={12} /> Avisar a oficina
                          </button>
                        )}
                        {/* Indicador: aviso ya enviado (oficina debe gestionar) */}
                        {orden.visitaFallida && (
                          <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 flex items-center gap-1">
                            <Bell size={12} /> Aviso enviado a oficina — esperando coordinación
                          </div>
                        )}
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
                        {permisos.verUbicacionGPS && !orden.clienteLat && (
                          <button
                            onClick={() => handleCapturarGpsOrden(orden)}
                            disabled={capturandoGpsOrdenId === orden.id}
                            className="flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-60"
                          >
                            <MapPin size={12} />
                            {capturandoGpsOrdenId === orden.id ? 'Capturando...' : 'Capturar GPS'}
                          </button>
                        )}
                        {permisos.puedeContactarCliente && orden.clienteTelefono && (
                          <a href={whatsappUrl(orden.clienteTelefono, mensajesWhatsApp.recordatorioCita(orden.clienteNombre, format(orden.fechaCita || new Date(), "dd/MM/yyyy"), formatHora(orden.fechaCita)))}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium">
                            <WhatsAppIcon filled={false} className="text-white" size={12} /> WhatsApp
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
                </div>
              );
            })}
          </div>
        )}

        {/* SPRINT-DISENO-TECNICO-FASE-1 (2026-05-30): card de ganancias
            quincenales movida ABAJO del listado de citas. Lo principal es la
            próxima cita; las ganancias quedan accesibles pero no compitiendo
            por la atención al abrir. Lógica idéntica a la original — solo
            cambió la posición visual. */}
        {(() => {
          const totalBruto = comisionesQuincena.reduce((s, c) => s + c.comisionMonto, 0);
          const totalDescuentos = comisionesQuincena.reduce(
            (s, c) => s + (c.descuentoPorGarantia?.monto ?? 0),
            0,
          );
          const total = totalBruto + totalDescuentos;
          const comisionesConDescuento = comisionesQuincena.filter(c => c.descuentoPorGarantia);
          const quincena = calcularQuincenaActual(new Date());
          const { inicio, fin } = rangoQuincena(quincena);
          const esQ1 = quincena.endsWith('Q1');
          const diaPago = esQ1 ? 15 : 30;
          const rangoTxt = `${format(inicio, "d 'de' MMMM", { locale: es })} — ${format(fin, "d 'de' MMMM", { locale: es })}`;
          const nOrdenes = comisionesQuincena.length;
          return (
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl shadow-sm overflow-hidden text-white">
              <button
                type="button"
                onClick={() => setMostrarDetalleGanancias(v => !v)}
                className="w-full p-4 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide opacity-90 inline-flex items-center gap-1">
                      <DollarSign size={11} /> Mis ganancias · Quincena actual
                    </p>
                    <p className="text-2xl font-bold mt-1">{formatMoneda(total)}</p>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      {rangoTxt}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="bg-white/20 rounded-lg px-2 py-1 font-semibold">
                      Pago día {diaPago}
                    </div>
                    <div className="mt-1 opacity-90">
                      {nOrdenes} orden{nOrdenes !== 1 ? 'es' : ''}
                    </div>
                  </div>
                </div>
                {nOrdenes > 0 && (
                  <div className="flex items-center justify-center gap-1 mt-2 text-[11px] opacity-75">
                    <span>{mostrarDetalleGanancias ? 'Ocultar detalle' : 'Ver detalle por orden'}</span>
                    <span className={`transition-transform ${mostrarDetalleGanancias ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                )}
              </button>
              {mostrarDetalleGanancias && nOrdenes > 0 && (
                <div className="bg-emerald-700/40 border-t border-white/10 max-h-64 overflow-y-auto">
                  {comisionesQuincena
                    .slice()
                    .sort((a, b) => b.fechaCobro.getTime() - a.fechaCobro.getTime())
                    .map(c => (
                      <div key={c.id} className="px-4 py-2 border-b border-white/10 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {c.ordenNumero} · {c.clienteNombre}
                            </div>
                            <div className="opacity-75 text-[10px]">
                              {format(c.fechaCobro, "dd MMM", { locale: es })}
                            </div>
                          </div>
                          <div className="font-bold text-right">
                            {formatMoneda(c.comisionMonto)}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {nOrdenes === 0 && (
                <div className="px-4 pb-4 text-[11px] opacity-75">
                  Aún no tienes comisiones en esta quincena. Cada vez que una orden tuya pase a facturada, acumulas ganancia aquí.
                </div>
              )}

              {/* Descuentos por garantía */}
              {comisionesConDescuento.length > 0 && (
                <div className="bg-red-900/30 border-t-2 border-red-300/40 px-4 py-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold mb-2 text-red-100">
                    <span>⚠️</span>
                    <span>Comisiones descontadas por garantía</span>
                  </div>
                  <div className="space-y-2">
                    {comisionesConDescuento.map(c => {
                      const d = c.descuentoPorGarantia!;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const fechaApl = d.aplicadoEn instanceof Date ? d.aplicadoEn : (d.aplicadoEn as any)?.toDate?.() || new Date();
                      return (
                        <div key={`desc-${c.id}`} className="bg-red-900/40 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-red-50 truncate">
                                Conduce {d.conduceNumero || '—'} · Orden {c.ordenNumero}
                              </div>
                              <div className="opacity-80 text-[10px] text-red-100">
                                {format(fechaApl, "dd MMM yyyy", { locale: es })}
                              </div>
                              <div className="text-[10px] text-red-100/90 mt-0.5">
                                Motivo: {d.motivo || '—'}
                              </div>
                            </div>
                            <div className="font-bold text-right text-red-100">
                              {formatMoneda(d.monto)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-2 border-t border-red-300/30 flex items-center justify-between text-red-100">
                    <span className="font-semibold">Total descontado en este período:</span>
                    <span className="font-bold">{formatMoneda(totalDescuentos)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* SPRINT-DISENO-TECNICO-FASE-1 (2026-05-30): filtro de período
            (Hoy/Semana/Mes/Rango) movido AL FINAL como filtro auxiliar. El
            default sigue siendo "Hoy" para que la pantalla abra mostrando
            la agenda del día. */}
        {permisos.vistaAgenda !== 'dia' && (
          <div className="space-y-3">
            <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100 max-w-md mx-auto">
              <button onClick={() => setVista('hoy')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${vista === 'hoy' ? 'bg-primary text-white' : 'text-gray-600'}`}>
                Hoy
              </button>
              {(permisos.vistaAgenda === 'semana' || permisos.vistaAgenda === 'mes') && (
                <button onClick={() => setVista('semana')}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${vista === 'semana' ? 'bg-primary text-white' : 'text-gray-600'}`}>
                  Esta Semana
                </button>
              )}
              {permisos.vistaAgenda === 'mes' && (
                <button onClick={() => setVista('mes')}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${vista === 'mes' ? 'bg-primary text-white' : 'text-gray-600'}`}>
                  Este Mes
                </button>
              )}
              <button onClick={() => setVista('rango')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1 ${vista === 'rango' ? 'bg-primary text-white' : 'text-gray-600'}`}>
                <Calendar size={11} /> Rango
              </button>
            </div>

            {vista === 'rango' && (
              <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 max-w-md mx-auto space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Desde</label>
                    <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Hasta</label>
                    <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-medium" />
                  </div>
                </div>
                <button onClick={handleAplicarRango}
                  className="w-full py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-xs font-medium transition-colors">
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
      </div>

      {/* Wizard de cierre de servicio */}
      {selectedOrden && showWizardCierre && (
        <CierreServicioWizard
          isOpen={showWizardCierre}
          onClose={() => { setShowWizardCierre(false); }}
          orden={selectedOrden}
          // @safe-userprofile-id: cierreServicio.tecnicoId es descriptor
          // de quién cerró; la rule de ordenes_servicio valida tecnicoId
          // raíz de la orden (no del cierre nested) contra auth.uid.
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
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio sugerido (RD$)</label>
            <input
              type="number"
              value={precioSugerido}
              onChange={e => setPrecioSugerido(e.target.value)}
              placeholder="Ej: 3500"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
            <p className="text-[11px] text-gray-400 mt-1">Precio que sugieres para este trabajo (opcional)</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowNotaModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={handleAgregarNota} disabled={saving}
              className="px-5 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60">
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
              {selectedOrden.equipoTipoMotor ? (
                <p className="text-xs text-gray-600">
                  Configuración: {selectedOrden.equipoTipoMotor === 'torre' ? 'Torre' : 'Individual'}
                </p>
              ) : (
                selectedOrden.equipoModelo && <p className="text-xs text-gray-600">Modelo: {selectedOrden.equipoModelo}</p>
              )}
              {selectedOrden.fotoEquipoUrl && (
                <div className="mt-2">
                  <FotoEquipoDisplay url={selectedOrden.fotoEquipoUrl} size="md" />
                </div>
              )}
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
                    className="inline-flex items-center gap-1 text-xs text-primary-medium mt-1">
                    <Navigation size={10} /> Abrir en Google Maps
                  </a>
                )}
              </div>
            )}

            {selectedOrden.notasTecnico && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                  <Wrench size={11} /> Mis Notas
                </p>
                <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                  <p className="text-xs text-blue-800 whitespace-pre-line">{selectedOrden.notasTecnico}</p>
                </div>
              </div>
            )}

            {selectedOrden.precioSugerido !== undefined && selectedOrden.precioSugerido !== null && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1 inline-flex items-center gap-1"><DollarSign size={11} /> Mi Precio Sugerido</p>
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

      {/* Modal "Sugerir solo chequeo" (técnico) — sprint R4 endurecida.
          El técnico envía sugerencia, oficina aprueba/rechaza. */}
      {ordenSugerirChequeo && (
        <ModalSugerirSoloChequeo
          isOpen={showSugerirChequeoModal}
          onClose={cerrarSugerirChequeoModal}
          orden={ordenSugerirChequeo}
        />
      )}

      {/* Modal stand-by (técnico) */}
      <Modal
        isOpen={showStandbyModal}
        onClose={cerrarStandbyModal}
        title="Poner orden en stand-by"
      >
        <div className="space-y-4">
          {ordenStandby && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <p className="font-semibold">{ordenStandby.clienteNombre}</p>
              <p>{ordenStandby.equipoTipo}{ordenStandby.equipoMarca ? ` · ${ordenStandby.equipoMarca}` : ''}</p>
              <p className="text-gray-500 mt-0.5">{ordenStandby.numero || ''}</p>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-900">
            La orden se congela: no aparecerá en alertas SLA hasta que la reactives. Útil cuando hay que esperar piezas o coordinar con el cliente.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
            <select
              value={standbyForm.motivo}
              onChange={e => setStandbyForm(f => ({ ...f, motivo: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              <option value="Esperando pieza">Esperando pieza</option>
              <option value="Cliente no disponible">Cliente no disponible</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha estimada de reactivación
            </label>
            <input
              type="date"
              value={standbyForm.hasta}
              onChange={e => setStandbyForm(f => ({ ...f, hasta: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
            <p className="text-[11px] text-gray-400 mt-1">Opcional. Útil para recordar cuándo retomar la orden.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              rows={3}
              value={standbyForm.notas}
              onChange={e => setStandbyForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Detalle del motivo, pieza esperada, contacto..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarStandbyModal}
              disabled={savingStandby}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarStandby}
              disabled={savingStandby}
              className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {savingStandby ? 'Guardando...' : 'Poner en stand-by'}
            </button>
          </div>
        </div>
      </Modal>

      {/* SPRINT-177: Modal "Avisar a oficina" — el técnico describe qué pasó
          en la visita y la oficina recibe notif para gestionar (reagendar /
          llamar / cancelar). Mínimo 10 chars, máximo 500 chars. */}
      <Modal
        isOpen={!!ordenAvisar}
        onClose={cerrarAvisoModal}
        title="¿Qué pasó con esta visita?"
      >
        <div className="space-y-4">
          {ordenAvisar && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <p className="font-semibold">{ordenAvisar.clienteNombre}</p>
              <p>{ordenAvisar.equipoTipo}{ordenAvisar.equipoMarca ? ` · ${ordenAvisar.equipoMarca}` : ''}</p>
              <p className="text-gray-500 mt-0.5">{ordenAvisar.numero || ''}</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
            Escribí lo que el cliente te dijo o lo que pasó. La oficina recibirá un aviso para coordinar (reagendar, llamar, cancelar).
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qué pasó *</label>
            <textarea
              value={detalleVisita}
              onChange={(e) => setDetalleVisita(e.target.value)}
              placeholder="Por ejemplo: 'No abrió, llamé y no contestó' / 'Cliente pidió que volvamos el sábado' / 'No encontré la dirección'"
              rows={5}
              maxLength={500}
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {detalleVisita.length}/500 — mínimo 10 caracteres
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarAvisoModal}
              disabled={guardandoAviso}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarAviso}
              disabled={guardandoAviso || detalleVisita.trim().length < 10}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {guardandoAviso ? 'Enviando...' : 'Enviar a oficina'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
