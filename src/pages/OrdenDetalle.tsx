import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, FaseOrden, MetodoPago, StandbyPieza } from '../types';
import { formatFecha, tiempoTranscurrido, faseBgColor, formatTelefono, whatsappLink, estadoSimpleLabel, estadoSimpleColor, parseOrden, crearRegistroAuditoria, formatMoneda, tieneStandby, obtenerUltimaSugerenciaSoloChequeo, obtenerSugerenciaSoloChequeoPendiente } from '../utils';
import { METODO_PAGO_LABELS } from '../utils/factura';
import ModalSugerirSoloChequeo from '../components/cierre/ModalSugerirSoloChequeo';
import BannerEstadoSugerenciaSoloChequeo from '../components/cierre/BannerEstadoSugerenciaSoloChequeo';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft, Phone, Wrench, User,
  Clock, MessageSquare, MapPin, ExternalLink,
  Satellite, Copy, Power, ClipboardCheck, AlertTriangle, FileText, Package, Check,
  Pause, Play, TrendingUp
} from 'lucide-react';
import ModalEditarPiezasOrden from '../components/cierre/ModalEditarPiezasOrden';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import toast from 'react-hot-toast';
import { puede } from '../utils/permisos';
import CancelarOrdenModal from '../components/ordenes/CancelarOrdenModal';
import FaseStepper from '../components/ordenes/FaseStepper';
import EliminarOrdenButton from '../components/ordenes/EliminarOrdenButton';
import BannerSiguientePaso from '../components/ordenes/BannerSiguientePaso';
import TimelineAcciones from '../components/ordenes/TimelineAcciones';
import ReagendarModal from '../components/ordenes/ReagendarModal';
import RegistrarPagoModal from '../components/ordenes/RegistrarPagoModal';
import EnviarFacturacionButton from '../components/ordenes/EnviarFacturacionButton';
import { XCircle, Banknote, ArrowRightLeft, CreditCard, Plus } from 'lucide-react';
import { generarTrackingToken } from '../services/gps.service';
import { whatsappUrl } from '../utils/whatsapp';
import { coordsFromLatLng, googleMapsViewUrl } from '../utils/maps';
import BotonComoLlegar from '../components/shared/BotonComoLlegar';
import { crearNotificacion } from '../services/notificaciones.service';
import { suscribirConfigEmpresa, CONFIG_EMPRESA_DEFAULT, ConfigEmpresa, PRECIO_CHEQUEO_DEFAULT_FALLBACK } from '../services/configEmpresa.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function OrdenDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useApp();
  const [orden, setOrden] = useState<OrdenServicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsSaving, setGpsSaving] = useState(false);
  const [precioAprobacion, setPrecioAprobacion] = useState('');
  const [aprobandoPrecio, setAprobandoPrecio] = useState(false);
  const [standbyItems, setStandbyItems] = useState<StandbyPieza[]>([]);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [modalPiezasAbierto, setModalPiezasAbierto] = useState(false);
  const [empresaConfig, setEmpresaConfig] = useState<ConfigEmpresa>({ ...CONFIG_EMPRESA_DEFAULT });

  useEffect(() => {
    const unsub = suscribirConfigEmpresa(cfg => setEmpresaConfig(cfg));
    return () => unsub();
  }, []);

  const precioChequeoSugerido =
    empresaConfig.precioChequeoDefault ?? PRECIO_CHEQUEO_DEFAULT_FALLBACK;

  // Pre-fill approval input
  useEffect(() => {
    if (orden?.precioSugerido !== undefined && orden.estadoAprobacion !== 'aprobado') {
      setPrecioAprobacion(String(orden.precioSugerido));
    } else {
      setPrecioAprobacion('');
    }
  }, [orden?.precioSugerido, orden?.estadoAprobacion]);

  const handleAprobarPrecio = async () => {
    if (!id || !orden) return;
    const precio = Number(precioAprobacion);
    if (isNaN(precio) || precio <= 0) {
      toast.error('Ingresa un precio válido');
      return;
    }
    setAprobandoPrecio(true);
    try {
      const usuario = userProfile?.nombre || 'Admin';
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'precio_sugerido',
        `Aprobó precio: RD$ ${precio.toLocaleString('es-DO')}`,
        'precioFinal',
        orden.precioSugerido !== undefined ? `RD$ ${orden.precioSugerido.toLocaleString('es-DO')}` : '',
        `RD$ ${precio.toLocaleString('es-DO')}`
      );
      await updateDoc(doc(db, 'ordenes_servicio', id), {
        precioAprobado: precio,
        precioFinal: precio,
        estadoAprobacion: 'aprobado',
        aprobadoPor: usuario,
        fechaAprobacion: Timestamp.now(),
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: Timestamp.now(),
      });
      // Notificar al técnico para que pueda continuar con el trabajo
      if (orden.tecnicoId) {
        try {
          await crearNotificacion({
            userId: orden.tecnicoId,
            destinatarioNombre: orden.tecnicoNombre,
            tipo: 'precio_aprobado',
            titulo: `Precio aprobado · ${orden.numero || 'orden'}`,
            mensaje: `Precio aprobado: RD$${precio.toLocaleString('es-DO')}. Cliente: ${orden.clienteNombre}. Puedes marcar el trabajo como realizado.`,
            ordenId: orden.id,
            ordenNumero: orden.numero,
          });
        } catch (notifErr) {
          console.error('Error creando notificación de precio aprobado:', notifErr);
        }
      }
      toast.success('✅ Precio aprobado');
    } catch (err) {
      console.error(err);
      toast.error('Error al aprobar el precio');
    } finally {
      setAprobandoPrecio(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'ordenes_servicio', id), (snap) => {
      if (snap.exists()) {
        setOrden(parseOrden(snap.id, snap.data()) as OrdenServicio);
      }
      setLoading(false);
    });
    const unsubStandby = onSnapshot(collection(db, 'standby_piezas'), (snap) => {
      setStandbyItems(snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        fechaInicio: d.data().fechaInicio?.toDate?.() || new Date(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
      } as StandbyPieza)));
    });
    return () => { unsub(); unsubStandby(); };
  }, [id]);

  const ordenTieneStandby = orden ? tieneStandby(orden, standbyItems) : false;
  const tienePiezaPendiente = orden
    ? standbyItems.some(s => s.ordenId === orden.id && s.estado !== 'llego')
    : false;
  const mostrarBannerReagendar = !!orden && orden.fase === 'aprobado' && tienePiezaPendiente && !orden.eliminada;

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReagendarModal, setShowReagendarModal] = useState(false);

  const handleActivarGPS = async () => {
    if (!id || !orden) return;
    setGpsSaving(true);
    try {
      const token = generarTrackingToken();
      const enlace = `${window.location.origin}/tracking/${token}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tracking = {
        habilitado: true,
        token,
        vehiculoId: orden.tecnicoId || 'vehiculo-default',
        tecnicoId: orden.tecnicoId || '',
        activadoPor: userProfile?.nombre || 'Admin',
        activadoEn: Timestamp.now(),
        enlace,
        expiresAt: Timestamp.fromDate(expiresAt),
      };
      await updateDoc(doc(db, 'ordenes_servicio', id), {
        trackingGPS: tracking,
        updatedAt: Timestamp.now(),
      });
      toast.success('GPS Tracking activado');
    } catch (err) {
      console.error(err);
      toast.error('Error al activar GPS');
    } finally {
      setGpsSaving(false);
    }
  };

  const handleDesactivarGPS = async () => {
    if (!id) return;
    if (!confirm('¿Desactivar el seguimiento GPS para esta orden?')) return;
    setGpsSaving(true);
    try {
      await updateDoc(doc(db, 'ordenes_servicio', id), {
        'trackingGPS.habilitado': false,
        updatedAt: Timestamp.now(),
      });
      toast.success('GPS Tracking desactivado');
    } catch {
      toast.error('Error');
    } finally {
      setGpsSaving(false);
    }
  };

  const handleCopiarEnlace = async () => {
    if (!orden?.trackingGPS?.enlace) return;
    try {
      await navigator.clipboard.writeText(orden.trackingGPS.enlace);
      toast.success('Enlace copiado');
    } catch {
      window.prompt('Copia el enlace:', orden.trackingGPS.enlace);
    }
  };

  // Solo chequeo — modal state
  const [showChequeoModal, setShowChequeoModal] = useState(false);
  const [chequeoForm, setChequeoForm] = useState<{
    precio: string;
    metodoPago: MetodoPago | '';
    bancoDestino: string;
    motivo: string;
  }>({ precio: String(precioChequeoSugerido), metodoPago: '', bancoDestino: '', motivo: '' });
  const [savingChequeo, setSavingChequeo] = useState(false);

  const resetChequeoForm = () => {
    setChequeoForm({
      precio: String(precioChequeoSugerido),
      metodoPago: '',
      bancoDestino: '',
      motivo: '',
    });
  };

  // Sprint R4 endurecida: el técnico ya NO marca soloChequeo directo.
  // Si es técnico, abre ModalSugerirSoloChequeo; si es oficina, abre el
  // modal existente de cierre directo. `puedeMarcarChequeo` queda solo
  // para gating de visibilidad del bloque (cualquiera de los dos puede
  // accionar).
  const puedeMarcarChequeo = (): boolean => {
    if (!orden || !userProfile) return false;
    if (orden.soloChequeo) return false;
    if (orden.enStandby) return false;
    if (!['en_diagnostico', 'en_cotizacion', 'aprobado'].includes(orden.fase)) return false;
    if (puede(userProfile, 'cotizacionesAprobarPrecio')) return true;
    // @safe-userprofile-id: gate UI de visibilidad (mostrar/ocultar botón).
    // No es write — la rule final valida en el servidor.
    if (userProfile.rol === 'tecnico' && orden.tecnicoId === userProfile.id) return true;
    return false;
  };

  /** True cuando el usuario actual es el técnico asignado (no oficina). */
  const esTecnicoAsignado = (): boolean => {
    if (!orden || !userProfile) return false;
    // @safe-userprofile-id: gate UI, no es write.
    return userProfile.rol === 'tecnico' && orden.tecnicoId === userProfile.id;
  };

  // Modal "Sugerir solo chequeo" (técnico) — sprint R4 endurecida
  const [showSugerirChequeoModal, setShowSugerirChequeoModal] = useState(false);

  // Stand-by — modal state
  const [showStandbyModal, setShowStandbyModal] = useState(false);
  const [standbyForm, setStandbyForm] = useState<{ motivo: string; hasta: string; notas: string }>({
    motivo: 'Esperando pieza',
    hasta: '',
    notas: '',
  });
  const [savingStandby, setSavingStandby] = useState(false);
  const [reactivando, setReactivando] = useState(false);

  const puedePonerStandby = (): boolean => {
    if (!orden || !userProfile) return false;
    if (orden.enStandby) return false;
    if (orden.eliminada) return false;
    if (['cerrado', 'cancelado'].includes(orden.fase)) return false;
    if (orden.soloChequeo) return false;
    if (puede(userProfile, 'cotizacionesAprobarPrecio')) return true;
    // @safe-userprofile-id: gate UI, no es write.
    if (userProfile.rol === 'tecnico' && orden.tecnicoId === userProfile.id) return true;
    return false;
  };

  const puedeReactivar = (): boolean => {
    if (!orden) return false;
    if (!orden.enStandby) return false;
    // Reactivar: admin/coord/operaria (con cotizacionesAprobarPrecio) — NO técnico desde admin
    return puede(userProfile, 'cotizacionesAprobarPrecio');
  };

  const handleConfirmarStandby = async () => {
    if (!id || !orden) return;
    if (!standbyForm.motivo.trim()) {
      toast.error('Selecciona un motivo');
      return;
    }
    setSavingStandby(true);
    try {
      const ahora = Timestamp.now();
      const usuario = userProfile?.nombre || 'Sistema';
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
      await updateDoc(doc(db, 'ordenes_servicio', id), payload);
      toast.success('Orden marcada pendiente de piezas');
      setShowStandbyModal(false);
      setStandbyForm({ motivo: 'Esperando pieza', hasta: '', notas: '' });
    } catch (err) {
      console.error(err);
      toast.error('Error al marcar pendiente de piezas');
    } finally {
      setSavingStandby(false);
    }
  };

  const handleReactivar = async () => {
    if (!id || !orden) return;
    setReactivando(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'reactivar_orden',
        'Reactivó la orden desde stand-by',
        'enStandby',
        'true',
        'false'
      );
      await updateDoc(doc(db, 'ordenes_servicio', id), {
        enStandby: false,
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: Timestamp.now(),
      });
      toast.success('Orden reactivada');
    } catch (err) {
      console.error(err);
      toast.error('Error al reactivar');
    } finally {
      setReactivando(false);
    }
  };

  const handleConfirmarChequeo = async () => {
    if (!id || !orden) return;
    const precio = Number(chequeoForm.precio);
    if (isNaN(precio) || precio <= 0) {
      toast.error('Ingresa un precio de chequeo válido');
      return;
    }
    if (!chequeoForm.motivo.trim()) {
      toast.error('Escribe el motivo por el que no procedió el servicio');
      return;
    }
    setSavingChequeo(true);
    try {
      const ahora = Timestamp.now();
      const usuario = userProfile?.nombre || 'Sistema';
      const nuevoHistorial = [
        ...orden.historialFases.map(h => ({
          fase: h.fase,
          timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        })),
        {
          fase: 'cerrado' as FaseOrden,
          timestamp: ahora,
          usuario,
          nota: `Solo chequeo — ${chequeoForm.motivo.trim()}`,
        },
      ];
      const registroAuditoria = crearRegistroAuditoria(
        usuario,
        'marcar_chequeo',
        `Marcó orden como solo chequeo (RD$ ${precio.toLocaleString('es-DO')}) — ${chequeoForm.motivo.trim()}`,
        'soloChequeo',
        'false',
        'true'
      );
      const updateData: Record<string, unknown> = {
        soloChequeo: true,
        precioChequeo: precio,
        motivoChequeo: chequeoForm.motivo.trim(),
        fase: 'cerrado',
        estadoSimple: 'completado',
        estado: 'cerrado',
        historialFases: nuevoHistorial,
        auditoria: arrayUnion(registroAuditoria),
        updatedAt: ahora,
      };
      if (chequeoForm.metodoPago) {
        updateData.metodoPagoCierre = chequeoForm.metodoPago;
      }
      if (chequeoForm.metodoPago === 'transferencia' && chequeoForm.bancoDestino.trim()) {
        updateData.bancoDestinoCierre = chequeoForm.bancoDestino.trim();
      }
      await updateDoc(doc(db, 'ordenes_servicio', id), updateData);
      toast.success('Orden marcada como solo chequeo');
      setShowChequeoModal(false);
      resetChequeoForm();
    } catch (err: unknown) {
      console.error(err);
      // Defensa para sesiones de técnico desactualizadas (sprint R4
      // endurecida): este path siempre setea soloChequeo. Un
      // permission-denied indica una sesión vieja chocando con la rule
      // nueva (o un técnico que llegó a este modal por bug).
      const codeRaw = (err as { code?: unknown })?.code;
      const code = typeof codeRaw === 'string' ? codeRaw : '';
      if (code === 'permission-denied') {
        toast.error(
          'Tu app está desactualizada. Recargá con Cmd+Shift+R o cierra y abre el navegador.',
          { duration: 8000 },
        );
      } else {
        toast.error('Error al marcar como solo chequeo');
      }
    } finally {
      setSavingChequeo(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando orden..." />;
  if (!orden) return (
    <div className="p-6 text-center">
      <p className="text-gray-500">Orden no encontrada</p>
      <button onClick={() => navigate('/admin/ordenes')} className="text-[#1a5fa8] mt-2 text-sm">Volver a órdenes</button>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/ordenes')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[#0f3460]">{orden.numero || 'Orden'}</h1>
            <Badge fase={orden.fase} />
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estadoSimpleColor(orden.estadoSimple)}`}>
              {estadoSimpleLabel(orden.estadoSimple)}
            </span>
          </div>
          <p className="text-gray-500 text-sm">Creada {tiempoTranscurrido(orden.createdAt)}</p>
        </div>
      </div>

      {/* Banner cancelada */}
      {orden.fase === 'cancelado' && orden.motivoCancelacion && !orden.eliminada && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Orden cancelada</p>
            <p className="text-xs text-amber-800 mt-1">Motivo: {orden.motivoCancelacion}</p>
            {orden.canceladaPor && (
              <p className="text-xs text-amber-700 mt-0.5">
                Por {orden.canceladaPor}{orden.fechaCancelacion ? ` · ${formatFecha(orden.fechaCancelacion)}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner eliminada */}
      {orden.eliminada && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-900">Orden eliminada</p>
            {orden.motivoEliminacion && <p className="text-xs text-red-800 mt-1">Motivo: {orden.motivoEliminacion}</p>}
            {orden.eliminadaPor && (
              <p className="text-xs text-red-700 mt-0.5">
                Por {orden.eliminadaPor}{orden.fechaEliminacion ? ` · ${formatFecha(orden.fechaEliminacion)}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner pieza pendiente — sugiere reagendar */}
      {mostrarBannerReagendar && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <Package size={20} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">Pieza pendiente de llegada</p>
            <p className="text-sm text-amber-800">
              Esta orden está aprobada pero tiene piezas pendientes. Puedes reagendar el servicio para cuando llegue la pieza.
            </p>
          </div>
          {puede(userProfile, 'ordenesModificar') && (
            <button
              type="button"
              onClick={() => setShowReagendarModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium text-sm shrink-0"
            >
              Reagendar
            </button>
          )}
        </div>
      )}

      {/* Banner de estado de sugerencia "solo chequeo" (sprint R4 endurecida).
          Visible para todos los roles en el detalle — para el técnico es el
          gate de cierre, para oficina es info adicional al panel admin. */}
      {!orden.soloChequeo && (() => {
        const ultimaSug = obtenerUltimaSugerenciaSoloChequeo(orden);
        if (!ultimaSug) return null;
        return <BannerEstadoSugerenciaSoloChequeo sugerencia={ultimaSug} />;
      })()}

      {/* Banner solo chequeo */}
      {orden.soloChequeo && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-yellow-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-900">
              Solo chequeo — cobrado {formatMoneda(orden.precioChequeo || 0)}
            </p>
            {orden.motivoChequeo && (
              <p className="text-xs text-yellow-800 mt-1">Motivo: {orden.motivoChequeo}</p>
            )}
            {orden.metodoPagoCierre && (
              <p className="text-xs text-yellow-800 mt-0.5">
                Pago: {METODO_PAGO_LABELS[orden.metodoPagoCierre]}
                {orden.bancoDestinoCierre ? ` · ${orden.bancoDestinoCierre}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner ROI — orden reactivada por campaña de marketing
          (sprint Mapa Clientes Commit 3). Snapshot inmutable. */}
      {orden.reactivadaPor && (() => {
        const reac = orden.reactivadaPor;
        const fechaCampana = reac.campanaFecha instanceof Date
          ? reac.campanaFecha
          : (reac.campanaFecha && typeof (reac.campanaFecha as { toDate?: () => Date }).toDate === 'function'
            ? (reac.campanaFecha as { toDate: () => Date }).toDate()
            : null);
        return (
          <div className="bg-green-50 border-l-4 border-green-500 rounded-r-2xl p-4 flex items-start gap-3">
            <TrendingUp size={20} className="text-green-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-900">
                Reactivada por campaña de marketing
              </p>
              <p className="text-xs text-green-800 mt-1">
                {reac.campanaPlantillaNombre || 'Plantilla sin nombre'}
                {fechaCampana ? ` · ${format(fechaCampana, 'd MMM yyyy', { locale: es })}` : ''}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Banner stand-by */}
      {orden.enStandby && !orden.eliminada && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 flex items-start gap-3">
          <Pause size={20} className="text-yellow-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-900">
              ⏸ Orden Pendiente de piezas
              {orden.standbyHasta && (() => {
                const fechaHasta = orden.standbyHasta instanceof Date
                  ? orden.standbyHasta
                  : ('toDate' in (orden.standbyHasta as object)
                    ? (orden.standbyHasta as unknown as { toDate: () => Date }).toDate()
                    : null);
                return fechaHasta ? (
                  <span className="ml-1 font-normal">
                    · hasta {format(fechaHasta, 'dd/MM/yyyy', { locale: es })}
                  </span>
                ) : null;
              })()}
            </p>
            {orden.standbyMotivo && (
              <p className="text-xs text-yellow-800 mt-1">Motivo: {orden.standbyMotivo}</p>
            )}
            {orden.standbyNotas && (
              <p className="text-xs text-yellow-800 mt-1 italic">{orden.standbyNotas}</p>
            )}
            {orden.standbyPor && (
              <p className="text-[11px] text-yellow-700 mt-1">
                Marcada pendiente por {orden.standbyPor}
                {orden.standbyDesde && (() => {
                  const fechaDesde = orden.standbyDesde instanceof Date
                    ? orden.standbyDesde
                    : ('toDate' in (orden.standbyDesde as object)
                      ? (orden.standbyDesde as unknown as { toDate: () => Date }).toDate()
                      : null);
                  return fechaDesde ? ` · ${formatFecha(fechaDesde)}` : '';
                })()}
              </p>
            )}
          </div>
          {puedeReactivar() && (
            <button
              type="button"
              onClick={handleReactivar}
              disabled={reactivando}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium shrink-0 inline-flex items-center gap-1 disabled:opacity-60"
            >
              <Play size={14} /> {reactivando ? 'Reactivando...' : '▶ Reactivar'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Cliente */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Cliente</h3>
            <p className="text-lg font-semibold text-gray-900 mb-2">{orden.clienteNombre}</p>
            <div className="space-y-2">
              {orden.clienteTelefono && (
                <div className="flex items-center gap-3">
                  <Phone size={14} className="text-gray-400" />
                  <span className="text-sm">{formatTelefono(orden.clienteTelefono)}</span>
                  <a href={whatsappLink(orden.clienteTelefono, `Hola ${orden.clienteNombre}, le contactamos de Mister Service RD sobre su ${orden.equipoTipo}.`)}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded-lg text-xs transition-colors">
                    <WhatsAppIcon filled={false} className="text-white" size={12} /> WhatsApp
                  </a>
                </div>
              )}
              {orden.clienteDireccion && !orden.clienteDireccion.startsWith('http') && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Dirección escrita</p>
                  <div className="flex items-start gap-2 text-sm text-gray-700">
                    <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                    <span>{orden.clienteDireccion}</span>
                  </div>
                </div>
              )}
              {(() => {
                const coords = coordsFromLatLng(orden.clienteLat, orden.clienteLng);
                if (!coords) {
                  return (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Ubicación GPS</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 italic">Sin coordenadas GPS</span>
                        <BotonComoLlegar ubicacion={null} size="sm" />
                      </div>
                    </div>
                  );
                }
                const verUrl = googleMapsViewUrl(coords);
                return (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Ubicación GPS</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                      </span>
                      <BotonComoLlegar ubicacion={coords} size="sm" />
                      {verUrl && (
                        <a
                          href={verUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:underline"
                        >
                          <ExternalLink size={10} /> Ver en mapa
                        </a>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Equipo */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Servicio</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Tipo</p>
                <p className="text-sm font-medium flex items-center gap-1"><Wrench size={14} /> {orden.equipoTipo}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Marca</p>
                <p className="text-sm font-medium">{orden.equipoMarca || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Modelo</p>
                <p className="text-sm font-medium">{orden.equipoModelo || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Fecha Cita</p>
                <p className="text-sm font-medium">{orden.fechaCita ? formatFecha(orden.fechaCita) : 'Sin agendar'}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500">Falla reportada</p>
              <p className="text-sm text-gray-800 mt-0.5">{orden.descripcionFalla}</p>
            </div>
          </div>

          {/* CIERRE DE SERVICIO (si existe) */}
          {orden.cierreServicio && (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-green-200 overflow-hidden">
              <div className="bg-green-50 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-green-900">SERVICIO CERRADO</h3>
                    <p className="text-xs text-green-700">
                      {orden.cierreServicio.tecnicoNombre} · {formatFecha(orden.cierreServicio.fechaCierre instanceof Date ? orden.cierreServicio.fechaCierre : (orden.cierreServicio.fechaCierre as unknown as { toDate: () => Date }).toDate())}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Foto */}
                {orden.cierreServicio.fotoCierre && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">📸 Foto de confirmación</p>
                    <img src={orden.cierreServicio.fotoCierre.url} alt="Foto de cierre"
                      className="w-full max-w-md rounded-xl border border-gray-200" />
                    <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                      {orden.cierreServicio.fotoCierre.gpsVerificado ? (
                        <p>📍 {orden.cierreServicio.fotoCierre.lat.toFixed(4)}°N, {Math.abs(orden.cierreServicio.fotoCierre.lng).toFixed(4)}°W</p>
                      ) : (
                        <p className="text-orange-600">⚠️ GPS no verificado</p>
                      )}
                      {orden.cierreServicio.fotoCierre.distanciaCliente !== undefined && orden.cierreServicio.fotoCierre.distanciaCliente !== null && (
                        <p className={orden.cierreServicio.fotoCierre.distanciaCliente > 500 ? 'text-orange-600' : 'text-green-600'}>
                          📏 A {orden.cierreServicio.fotoCierre.distanciaCliente} metros del domicilio registrado
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Preguntas de cierre simplificado */}
                {(orden.cierreServicio.equipoFunciona !== undefined ||
                  orden.cierreServicio.clienteSatisfecho !== undefined ||
                  orden.cierreServicio.revisoConexiones !== undefined) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">✅ Verificación de cierre</p>
                    <div className="space-y-2">
                      {orden.cierreServicio.equipoFunciona !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={orden.cierreServicio.equipoFunciona ? 'text-green-500' : 'text-red-500'}>
                            {orden.cierreServicio.equipoFunciona ? '✓' : '✗'}
                          </span>
                          <span>¿El equipo quedó funcionando correctamente?</span>
                        </div>
                      )}
                      {orden.cierreServicio.clienteSatisfecho !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={orden.cierreServicio.clienteSatisfecho ? 'text-green-500' : 'text-red-500'}>
                            {orden.cierreServicio.clienteSatisfecho ? '✓' : '✗'}
                          </span>
                          <span>¿El cliente está satisfecho con el servicio?</span>
                        </div>
                      )}
                      {orden.cierreServicio.revisoConexiones !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={orden.cierreServicio.revisoConexiones ? 'text-green-500' : 'text-red-500'}>
                            {orden.cierreServicio.revisoConexiones ? '✓' : '✗'}
                          </span>
                          <span>¿Revisó mangueras de desagüe, entrada de agua y llave abierta?</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Piezas (legacy) */}
                {((orden.cierreServicio.piezasRetiradas?.length || 0) > 0 || (orden.cierreServicio.piezasInstaladas?.length || 0) > 0) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">🔧 Piezas</p>
                    {(orden.cierreServicio.piezasRetiradas?.length || 0) > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-red-700">Retiradas:</p>
                        <ul className="text-xs text-gray-700 space-y-0.5 pl-4 list-disc">
                          {orden.cierreServicio.piezasRetiradas?.map((p, i) => (
                            <li key={i}>
                              {p.descripcion} · <span className="text-gray-500">{p.motivo} · destino: {p.destino}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(orden.cierreServicio.piezasInstaladas?.length || 0) > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-700">Instaladas:</p>
                        <ul className="text-xs text-gray-700 space-y-0.5 pl-4 list-disc">
                          {orden.cierreServicio.piezasInstaladas?.map((p, i) => (
                            <li key={i}>
                              {p.descripcion}{p.numeroParte && ` (${p.numeroParte})`} · <span className="text-gray-500">{p.procedencia}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Piezas utilizadas (Fase A1/A2) — detalle completo */}
                {orden.cierreServicio.piezasUsadas && orden.cierreServicio.piezasUsadas.length > 0 && (() => {
                  const cs = orden.cierreServicio;
                  if (!cs) return null;
                  const piezas = cs.piezasUsadas!;
                  const costoTotal = piezas.reduce((acc, p) => acc + (Number(p.costoTotal) || 0), 0);
                  const cantidadTotal = piezas.reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0);
                  const validada = cs.piezasValidadasPorAdmin === true;
                  return (
                    <div>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase">📦 Piezas utilizadas</p>
                        <div className="text-[11px] flex items-center gap-2 flex-wrap">
                          <span className="text-gray-600">
                            {piezas.length} pieza{piezas.length === 1 ? '' : 's'} · {cantidadTotal} unidad{cantidadTotal === 1 ? '' : 'es'} · Costo {formatMoneda(costoTotal)}
                          </span>
                          {validada ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                              <Check size={10} /> Validadas
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                              Pendientes de validar
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {piezas.map(p => {
                          const origenLabel = p.origen === 'inventario_taller' ? '🏭 Taller' : p.origen === 'inventario_vehiculo' ? '🚗 Vehículo' : '🛒 Externa';
                          const condicionLabel = p.condicion === 'nueva' ? '✨ Nueva' : '♻️ Usada';
                          const registrada = p.registradaEn instanceof Date ? p.registradaEn : ('toDate' in (p.registradaEn as object) ? (p.registradaEn as unknown as { toDate: () => Date }).toDate() : null);
                          const editada = p.editadaEn ? (p.editadaEn instanceof Date ? p.editadaEn : ('toDate' in (p.editadaEn as object) ? (p.editadaEn as unknown as { toDate: () => Date }).toDate() : null)) : null;
                          return (
                            <div key={p.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                              <div className="font-semibold text-sm text-gray-900">📦 {p.nombre}</div>
                              <div className="text-xs text-gray-700 mt-0.5">
                                {p.marca && <>Marca: {p.marca} · </>}
                                {p.modelo && <>Modelo: {p.modelo} · </>}
                                Condición: {condicionLabel}
                              </div>
                              <div className="text-xs text-gray-700">
                                Origen: {origenLabel}
                                {p.proveedor && <> · Proveedor: {p.proveedor}</>}
                              </div>
                              <div className="text-xs text-gray-700">
                                Cantidad: {p.cantidad} × {formatMoneda(p.costoUnitario)} = <span className="font-semibold">{formatMoneda(p.costoTotal)}</span>
                              </div>
                              <div className="text-[11px] text-gray-500 mt-1">
                                Registrada por {p.registradaPorNombre || 'técnico'}
                                {registrada && <> · {formatFecha(registrada)}</>}
                                {editada && p.editadaPor && (
                                  <> · <span className="text-amber-700">Editada por admin {formatFecha(editada)}</span></>
                                )}
                                {p.aprobadaPorAdmin && (
                                  <span className="ml-2 text-green-700">✓ Aprobada</span>
                                )}
                              </div>
                              {p.fotoUrl && (
                                <a
                                  href={p.fotoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block mt-1 text-xs text-[#1a5fa8] hover:underline"
                                >
                                  Ver foto
                                </a>
                              )}
                              {p.notas && (
                                <p className="text-xs italic text-gray-600 mt-1">Notas: {p.notas}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {userProfile?.rol === 'administrador' && !validada && (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setModalPiezasAbierto(true)}
                            className="text-xs font-semibold text-[#1a5fa8] hover:underline"
                          >
                            Validar ahora →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Checklist (legacy) */}
                {(orden.cierreServicio.checklist?.length || 0) > 0 && orden.cierreServicio.checklist && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      ✅ Checklist ({orden.cierreServicio.checklist.filter(c => c.respuesta === 'si').length}/{orden.cierreServicio.checklist.length} OK)
                    </p>
                    <ul className="space-y-1">
                      {orden.cierreServicio.checklist.map((c, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <span className={c.respuesta === 'si' ? 'text-green-500' : 'text-red-500'}>
                            {c.respuesta === 'si' ? '✓' : '✗'}
                          </span>
                          <div className="flex-1">
                            <p className="text-gray-700">{c.pregunta}</p>
                            {c.respuesta === 'no' && c.explicacion && (
                              <p className="text-orange-600 italic text-[10px] mt-0.5">— {c.explicacion}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Trabajo realizado (legacy) */}
                {orden.cierreServicio.descripcionTrabajo && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">📝 Trabajo realizado</p>
                    <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3">"{orden.cierreServicio.descripcionTrabajo}"</p>
                    {orden.cierreServicio.trabajoPendiente && (
                      <div className="mt-2 bg-yellow-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-yellow-800">Pendiente / recomendaciones:</p>
                        <p className="text-xs text-yellow-700">{orden.cierreServicio.trabajoPendiente}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Satisfacción (legacy) */}
                {orden.cierreServicio.satisfaccionCliente !== undefined && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Satisfacción del cliente</p>
                    <div className="text-lg">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < (orden.cierreServicio?.satisfaccionCliente || 0) ? 'text-yellow-400' : 'text-gray-300'}>★</span>
                      ))}
                      <span className="text-xs text-gray-500 ml-2">({orden.cierreServicio.satisfaccionCliente}/5)</span>
                    </div>
                  </div>
                )}

                {/* Método de pago del cierre (si registrado) */}
                {orden.metodoPagoCierre && !orden.soloChequeo && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Método de pago</p>
                    <p className="text-sm text-gray-800">
                      {METODO_PAGO_LABELS[orden.metodoPagoCierre]}
                      {orden.bancoDestinoCierre ? ` · ${orden.bancoDestinoCierre}` : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Creado por */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
            <User size={16} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Creado por</p>
              <p className="text-sm font-medium">{orden.creadoPor || '—'} · {formatFecha(orden.createdAt)}</p>
            </div>
          </div>

          {orden.notas && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Notas</h3>
              <p className="text-sm text-gray-700">{orden.notas}</p>
            </div>
          )}

          {orden.notasTecnico && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">🔧 Notas del Técnico</h3>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-sm text-blue-800 whitespace-pre-line">{orden.notasTecnico}</p>
              </div>
            </div>
          )}

          {orden.precioSugerido !== undefined && orden.precioSugerido !== null && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">💰 Precio Sugerido por el Técnico</h3>
              <p className="text-2xl font-bold text-green-700">
                RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}

          {/* Aprobación de precio (solo quien tenga el permiso cotizacionesAprobarPrecio) */}
          {orden.precioSugerido !== undefined &&
           orden.estadoAprobacion !== 'aprobado' &&
           puede(userProfile, 'cotizacionesAprobarPrecio') && (
            <div className="bg-yellow-50 rounded-2xl shadow-sm border-2 border-yellow-200 p-6">
              <h3 className="text-sm font-semibold text-yellow-800 uppercase mb-3 flex items-center gap-1">
                ⏳ Aprobar Precio
              </h3>
              <p className="text-xs text-yellow-700 mb-3">
                El técnico sugirió <strong>RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>.
                Puedes modificar el precio antes de aprobar.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-yellow-800 mb-1">Precio final (RD$)</label>
                  <input
                    type="number"
                    value={precioAprobacion}
                    onChange={e => setPrecioAprobacion(e.target.value)}
                    className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAprobarPrecio}
                    disabled={aprobandoPrecio}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-60 whitespace-nowrap"
                  >
                    {aprobandoPrecio ? 'Aprobando...' : '✅ Aprobar Precio'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Precio aprobado (cuando ya fue aprobado) */}
          {orden.estadoAprobacion === 'aprobado' && orden.precioFinal !== undefined && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">✅ Precio Aprobado</h3>
              <div className="bg-green-50 rounded-lg p-3 border-2 border-green-300">
                <p className="text-2xl font-bold text-green-700">
                  RD$ {Number(orden.precioFinal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                {orden.aprobadoPor && (
                  <p className="text-xs text-green-700 mt-1">
                    Aprobado por <strong>{orden.aprobadoPor}</strong>
                    {orden.fechaAprobacion && ` · ${formatFecha(orden.fechaAprobacion)}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Banner de inicio de chequeo */}
          {orden.inicioChequeo && !orden.eliminada && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="bg-green-50 border border-green-300 rounded-xl p-3 flex items-start gap-3">
                {orden.inicioChequeo.fotoUrl && (
                  <a href={orden.inicioChequeo.fotoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img
                      src={orden.inicioChequeo.fotoUrl}
                      alt="Inicio chequeo"
                      className="w-16 h-16 rounded-lg object-cover border border-green-200"
                    />
                  </a>
                )}
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-green-900">
                    📸 Chequeo iniciado por {orden.inicioChequeo.tecnicoNombre}
                  </p>
                  <p className="text-xs text-green-800 mt-0.5">
                    {formatFecha(orden.inicioChequeo.fechaInicio)}
                    {typeof orden.inicioChequeo.distanciaClienteMetros === 'number' && (
                      <span className={`ml-2 ${orden.inicioChequeo.gpsVerificado ? 'text-green-700' : 'text-amber-700'}`}>
                        · GPS a {orden.inicioChequeo.distanciaClienteMetros}m{' '}
                        {orden.inicioChequeo.gpsVerificado ? 'OK' : '(alejado)'}
                      </span>
                    )}
                  </p>
                  {typeof orden.inicioChequeo.lat === 'number' && typeof orden.inicioChequeo.lng === 'number' && (
                    <a
                      href={`https://maps.google.com/?q=${orden.inicioChequeo.lat},${orden.inicioChequeo.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-green-700 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                    >
                      Ver ubicación en Maps
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pagos y facturación */}
          {(puede(userProfile, 'pagosRegistrar') || puede(userProfile, 'ordenesEnviarAFacturacion') || (orden.pagos && orden.pagos.length > 0)) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase">💵 Pagos y Conduce de Garantía</h3>
                <div className="flex items-center gap-2">
                  {puede(userProfile, 'ordenesEnviarAFacturacion') && (
                    <EnviarFacturacionButton orden={orden} userProfile={userProfile} />
                  )}
                  {puede(userProfile, 'pagosRegistrar') && !orden.facturada && (
                    <button
                      type="button"
                      onClick={() => setShowPagoModal(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      <Plus size={12} /> Registrar pago
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const total = Number(orden.precioFinal || orden.precioAprobado || orden.precioSugerido || 0);
                const pagado = Number(orden.montoPagado || 0);
                const pendiente = Math.max(0, total - pagado);
                const estado = orden.estadoPago || (pagado === 0 ? 'pendiente' : pagado >= total && total > 0 ? 'completo' : 'parcial');
                const colorEstado =
                  estado === 'completo'
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : estado === 'parcial'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200';
                return (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 grid grid-cols-4 gap-3 text-sm mb-3">
                    <div>
                      <div className="text-[11px] text-blue-700 uppercase tracking-wide">Total</div>
                      <div className="text-base font-semibold text-[#0f3460]">{formatMoneda(total)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-700 uppercase tracking-wide">Pagado</div>
                      <div className="text-base font-semibold text-green-600">{formatMoneda(pagado)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-700 uppercase tracking-wide">Pendiente</div>
                      <div className="text-base font-semibold text-orange-600">{formatMoneda(pendiente)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-700 uppercase tracking-wide">Estado</div>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${colorEstado}`}>
                        {estado}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {orden.pagos && orden.pagos.length > 0 && (
                <div className="space-y-1.5">
                  {orden.pagos.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        {p.metodo === 'efectivo' && <Banknote size={14} className="text-green-600" />}
                        {p.metodo === 'transferencia' && <ArrowRightLeft size={14} className="text-blue-600" />}
                        {p.metodo === 'tarjeta' && <CreditCard size={14} className="text-purple-600" />}
                        <div>
                          <span className="font-medium text-gray-900">
                            {formatMoneda(Number(p.monto))}
                          </span>
                          <span className="text-gray-500 ml-2 capitalize">{p.metodo}</span>
                          {p.metodo === 'efectivo' && p.recibidoPorNombre && (
                            <span className="text-gray-500"> · {p.recibidoPorNombre}</span>
                          )}
                          {(p.metodo === 'transferencia' || p.metodo === 'tarjeta') && p.bancoNombre && (
                            <span className="text-gray-500"> → {p.bancoNombre}</span>
                          )}
                          {p.referencia && <span className="text-gray-500"> · Ref {p.referencia}</span>}
                        </div>
                      </div>
                      <span className="text-gray-400 text-[11px]">{formatFecha(p.fecha)}</span>
                    </div>
                  ))}
                </div>
              )}

              {orden.enviadaAFacturacion && !orden.facturada && (
                <div className="mt-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2">
                  Enviada por <strong>{orden.enviadaAFacturacionPorNombre || '—'}</strong>
                  {orden.enviadaAFacturacionAt && ` · ${formatFecha(orden.enviadaAFacturacionAt)}`}
                  . Pendiente de procesar por admin / coordinadora.
                </div>
              )}
              {orden.facturada && (
                <div className="mt-2 text-[11px] text-green-700 bg-green-50 border border-green-100 rounded-lg p-2">
                  Conduce de Garantía emitido {orden.facturaNumero ? `(${orden.facturaNumero})` : ''}
                  {orden.facturadaPorNombre && ` por ${orden.facturadaPorNombre}`}
                  {orden.facturadaAt && ` · ${formatFecha(orden.facturadaAt)}`}
                </div>
              )}
            </div>
          )}

          {/* Modal de registrar pago */}
          <RegistrarPagoModal
            isOpen={showPagoModal}
            onClose={() => setShowPagoModal(false)}
            orden={orden}
            userProfile={userProfile}
          />

          {/* Modal de validar / editar piezas (solo admin) */}
          <ModalEditarPiezasOrden
            orden={modalPiezasAbierto ? orden : null}
            onClose={() => setModalPiezasAbierto(false)}
          />


          {/* Registro de Auditoría */}
          {orden.auditoria && orden.auditoria.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">📝 Registro de Cambios</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {orden.auditoria.slice().reverse().map((reg, i) => (
                  <div key={i} className="text-xs bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700">{reg.usuario}</span>
                      <span className="text-gray-400">{formatFecha(reg.fecha)}</span>
                    </div>
                    <p className="text-gray-600 mt-0.5">{reg.detalle}</p>
                    {reg.valorAnterior && reg.valorNuevo && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{reg.campo}: "{reg.valorAnterior}" → "{reg.valorNuevo}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial de precios (cambios sobre precio_sugerido) */}
          {orden.auditoria && orden.auditoria.some(a => a.accion === 'precio_sugerido') && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">Historial de precios</h3>
              <div className="space-y-3">
                {orden.auditoria
                  .filter(a => a.accion === 'precio_sugerido')
                  .slice()
                  .reverse()
                  .map((reg, i, arr) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
                        {i < arr.length - 1 && <div className="w-0.5 h-10 bg-gray-200 mt-1" />}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{reg.usuario}</span>
                          <span className="text-xs text-gray-400" title={reg.fecha.toISOString()}>{tiempoTranscurrido(reg.fecha)} · {formatFecha(reg.fecha)}</span>
                        </div>
                        {reg.valorAnterior && reg.valorNuevo && (
                          <p className="text-xs text-gray-700 mt-1">
                            {reg.valorAnterior ? <span className="text-gray-500">{reg.valorAnterior}</span> : <span className="text-gray-400 italic">sin precio</span>}
                            <span className="mx-2 text-gray-400">→</span>
                            <span className="font-semibold text-emerald-700">{reg.valorNuevo}</span>
                          </p>
                        )}
                        {reg.detalle && (
                          <p className="text-xs text-gray-500 italic mt-0.5">{reg.detalle}</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Historial */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">Historial de Fases</h3>
            <div className="space-y-3">
              {orden.historialFases.length === 0 ? (
                <p className="text-sm text-gray-400">Sin historial</p>
              ) : (
                orden.historialFases.map((h, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: faseBgColor(h.fase) }} />
                      {i < orden.historialFases.length - 1 && <div className="w-0.5 h-8 bg-gray-200 mt-1" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge fase={h.fase} />
                        <span className="text-xs text-gray-500">{formatFecha(h.timestamp)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5"><User size={10} className="inline mr-1" />{h.usuario}</p>
                      {h.nota && <p className="text-xs text-gray-600 mt-1 italic"><MessageSquare size={10} className="inline mr-1" />{h.nota}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Detalles</h3>
            <div>
              <p className="text-xs text-gray-500">Técnico asignado</p>
              <p className="text-sm font-medium">{orden.tecnicoNombre || 'Sin asignar'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Responsable</p>
              <p className="text-sm font-medium">{orden.responsableNombre || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Duración estimada</p>
              <p className="text-sm font-medium">{orden.duracionMin ? `${orden.duracionMin} min` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Última actualización</p>
              <p className="text-sm text-gray-600 flex items-center gap-1"><Clock size={12} />{tiempoTranscurrido(orden.updatedAt)}</p>
            </div>
            {orden.reagendada && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Reagendada</span>
            )}
          </div>

          {/* Generar cotización desde la orden */}
          {(['en_cotizacion', 'aprobado'].includes(orden.fase)) &&
            puede(userProfile, 'cotizacionesCrear') &&
            !orden.cotizacionId && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Cotización</h3>
              <p className="text-xs text-gray-500 mb-3">
                Generar cotización con servicios filtrados por equipo y marca de esta orden.
              </p>
              <button
                type="button"
                onClick={() => {
                  navigate('/admin/cotizaciones', {
                    state: {
                      fromOrden: {
                        id: orden.id,
                        numero: orden.numero,
                        clienteId: orden.clienteId,
                        clienteNombre: orden.clienteNombre,
                        equipoMarca: orden.equipoMarca,
                        equipoTipo: orden.equipoTipo,
                        tecnicoNombre: orden.tecnicoNombre,
                      },
                    },
                  });
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <FileText size={14} /> Generar cotización
              </button>
            </div>
          )}
          {orden.cotizacionId && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs text-emerald-800 flex items-center gap-2">
              <FileText size={12} />
              <span>Cotización vinculada a esta orden.</span>
              <button
                type="button"
                onClick={() => navigate('/admin/cotizaciones')}
                className="ml-auto underline font-medium"
              >Abrir</button>
            </div>
          )}

          {/* Marcar / sugerir solo chequeo. Sprint R4 endurecida:
              - Técnico → abre ModalSugerirSoloChequeo (oficina aprueba después).
              - Oficina (admin/coord/operaria con cotizacionesAprobarPrecio) →
                abre el modal existente que cobra y cierra directo.
              Si ya hay sugerencia pendiente del técnico, el botón se oculta
              y mostramos el banner de estado más arriba. */}
          {puedeMarcarChequeo() && !obtenerSugerenciaSoloChequeoPendiente(orden) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Cliente no procede</h3>
              {esTecnicoAsignado() ? (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Si el cliente decidió no reparar, sugerí cerrar como solo
                    chequeo. La oficina aprobará y luego podrás cerrar la orden.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSugerirChequeoModal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <ClipboardCheck size={14} /> Sugerir solo chequeo
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Si el cliente decidió no reparar, registra solo el costo del chequeo y cierra la orden.
                  </p>
                  <button
                    type="button"
                    onClick={() => { resetChequeoForm(); setShowChequeoModal(true); }}
                    className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <ClipboardCheck size={14} /> Marcar solo chequeo
                  </button>
                </>
              )}
            </div>
          )}

          {/* Poner en stand-by */}
          {puedePonerStandby() && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Pendiente de piezas</h3>
              <p className="text-xs text-gray-500 mb-3">
                Congela la orden cuando hay que esperar piezas o coordinar con el cliente. La fase no cambia.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStandbyForm({ motivo: 'Esperando pieza', hasta: '', notas: '' });
                  setShowStandbyModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Pause size={14} /> ⏸ Marcar pendiente de piezas
              </button>
            </div>
          )}

          {/* Stepper de fases + acciones (cancelar / eliminar) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase">Flujo de la orden</h3>
            <FaseStepper orden={orden} size="md" tienestandby={ordenTieneStandby} />
            {/* Banner siguiente paso contextual al rol + fase (SPRINT-113a).
                Se renderiza dentro del bloque de flujo para que el operador
                vea inmediatamente "qué tiene que hacer ahora" alineado con
                el stepper. Devuelve null para órdenes cerradas/canceladas/
                eliminadas o roles sin contexto operativo. */}
            <BannerSiguientePaso orden={orden} rol={userProfile?.rol} size="md" />
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              {puede(userProfile, 'ordenesModificar') && !orden.eliminada && orden.fase !== 'cancelado' && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
                >
                  <XCircle size={13} /> Cancelar
                </button>
              )}
              <EliminarOrdenButton orden={orden} variant="button" />
            </div>
          </div>

          {/* Timeline de últimas acciones (SPRINT-113c).
              Lectura pura de historialFases + auditoria; auto-oculta cuando
              hay <2 acciones registradas (orden recién creada). */}
          <TimelineAcciones orden={orden} max={5} />

          {/* GPS Tracking */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Satellite size={16} className="text-[#1a5fa8]" />
              <h3 className="text-sm font-semibold text-gray-700">Tracking GPS del técnico</h3>
            </div>
            {orden.trackingGPS?.habilitado ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                    ✅ GPS Tracking activado
                  </p>
                  <p className="text-xs text-green-700 mt-1">Activado por {orden.trackingGPS.activadoPor}</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Enlace para el cliente:</label>
                  <div className="bg-gray-50 rounded-lg p-2 text-xs font-mono text-gray-700 break-all">
                    {orden.trackingGPS.enlace}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopiarEnlace}
                    className="flex-1 flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-2 rounded-lg text-xs font-medium">
                    <Copy size={12} /> Copiar
                  </button>
                  {orden.clienteTelefono && (
                    <a href={whatsappUrl(orden.clienteTelefono, `Hola ${orden.clienteNombre} 👋\nSu técnico ${orden.tecnicoNombre || ''} está en camino.\nPuede seguir su ubicación en tiempo real aquí:\n📍 ${orden.trackingGPS.enlace}\n- Mister Service RD`)}
                      target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 bg-green-500 hover:bg-green-600 text-white px-2 py-2 rounded-lg text-xs font-medium">
                      <WhatsAppIcon filled={false} className="text-white" size={12} /> WhatsApp
                    </a>
                  )}
                </div>
                <button onClick={handleDesactivarGPS} disabled={gpsSaving}
                  className="w-full flex items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg text-xs font-medium disabled:opacity-60">
                  <Power size={12} /> Desactivar acceso
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-600">
                  ¿Permitir al cliente ver la ubicación del técnico en camino?
                </p>
                <p className="text-xs text-gray-400 italic">
                  Al activar, el cliente podrá ver en tiempo real dónde está el técnico SOLO cuando está en camino.
                </p>
                <button onClick={handleActivarGPS} disabled={gpsSaving}
                  className="w-full flex items-center justify-center gap-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white py-2 rounded-lg text-xs font-medium disabled:opacity-60">
                  <Satellite size={12} /> {gpsSaving ? 'Activando...' : 'Activar GPS Tracking'}
                </button>
              </div>
            )}
          </div>

          {orden.clienteTelefono && (
            <a href={whatsappLink(orden.clienteTelefono, `Hola ${orden.clienteNombre}, le contactamos de Mister Service RD sobre su ${orden.equipoTipo}.`)}
              target="_blank" rel="noreferrer"
              className="block w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium text-center transition-colors">
              Contactar por WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Modal solo chequeo */}
      <Modal
        isOpen={showChequeoModal}
        onClose={() => { setShowChequeoModal(false); resetChequeoForm(); }}
        title="Marcar como solo chequeo"
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            El cliente no procedió con la reparación. Registra el costo del chequeo y cómo se cobró; la orden se cerrará.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio del chequeo (RD$) *</label>
            <input
              type="number"
              min={0}
              step={50}
              value={chequeoForm.precio}
              onChange={e => setChequeoForm(f => ({ ...f, precio: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
              <select
                value={chequeoForm.metodoPago}
                onChange={e => setChequeoForm(f => ({ ...f, metodoPago: e.target.value as MetodoPago | '' }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                <option value="">Sin especificar</option>
                {(Object.keys(METODO_PAGO_LABELS) as MetodoPago[]).map(m => (
                  <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>
                ))}
              </select>
            </div>
            {chequeoForm.metodoPago === 'transferencia' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banco destino</label>
                <input
                  type="text"
                  value={chequeoForm.bancoDestino}
                  onChange={e => setChequeoForm(f => ({ ...f, bancoDestino: e.target.value }))}
                  placeholder="Ej: Banreservas, BHD..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
            <textarea
              rows={3}
              value={chequeoForm.motivo}
              onChange={e => setChequeoForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="Ej: El cliente consideró muy costosa la reparación..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowChequeoModal(false); resetChequeoForm(); }}
              disabled={savingChequeo}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarChequeo}
              disabled={savingChequeo}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {savingChequeo ? 'Guardando...' : 'Confirmar chequeo'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal "Sugerir solo chequeo" (técnico) — sprint R4 endurecida */}
      {orden && (
        <ModalSugerirSoloChequeo
          isOpen={showSugerirChequeoModal}
          onClose={() => setShowSugerirChequeoModal(false)}
          orden={orden}
        />
      )}

      {/* Modal stand-by */}
      <Modal
        isOpen={showStandbyModal}
        onClose={() => { setShowStandbyModal(false); }}
        title="Marcar orden como pendiente de piezas"
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-900">
            La orden se congela: no aparecerá en alertas SLA hasta que se reactive. Útil cuando hay que esperar piezas o coordinar con el cliente.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
            <select
              value={standbyForm.motivo}
              onChange={e => setStandbyForm(f => ({ ...f, motivo: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
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
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[11px] text-gray-400 mt-1">Opcional. Útil para recordar cuándo retomar.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              rows={3}
              value={standbyForm.notas}
              onChange={e => setStandbyForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Detalle del motivo, pieza esperada, contacto..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowStandbyModal(false)}
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
              {savingStandby ? 'Guardando...' : '⏸ Marcar pendiente'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal cancelar con motivo obligatorio */}
      <CancelarOrdenModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        orden={orden}
        userProfile={userProfile}
      />

      {/* Modal reagendar por pieza pendiente */}
      {orden && (
        <ReagendarModal
          isOpen={showReagendarModal}
          onClose={() => setShowReagendarModal(false)}
          orden={orden}
        />
      )}
    </div>
  );
}
