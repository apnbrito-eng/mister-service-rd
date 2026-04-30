import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle, ArrowRight, Calendar, CalendarClock, CheckCircle2, Clock,
  MessageSquare, RefreshCw, User as UserIcon, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import { useApp } from '../context/AppContext';
import {
  resolverPropuestaReprogramacionConNotif,
  suscribirOrdenesConPropuestaReprogramacionPendiente,
} from '../services/ordenes.service';
import {
  formatearEquipoLabel,
  obtenerPropuestaReprogramacionPendiente,
  parseFirestoreDate,
  tiempoTranscurrido,
  whatsappLink,
} from '../utils';
import { SLOTS_HORARIOS, MAX_DIAS_FUTURO } from '../utils/agenda';
import type { OrdenServicio, PropuestaReprogramacion } from '../types';

const MIN_NOTA_RECHAZO = 10;

interface ItemPropuesta {
  orden: OrdenServicio;
  propuesta: PropuestaReprogramacion;
}

function toDateSafe(value: unknown): Date | null {
  return parseFirestoreDate(value);
}

function formatFechaDiaCompleto(d: Date | null): string {
  if (!d) return 'Sin fecha';
  const txt = format(d, "EEEE d 'de' MMMM, h:mm a", { locale: es });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function formatFechaCorta(d: Date | null): string {
  if (!d) return 'Sin fecha';
  const txt = format(d, "EEEE d 'de' MMMM", { locale: es });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Construye el link de WhatsApp al cliente con mensaje pre-llenado según
 * la acción que tomó el admin.
 */
function whatsappClienteUrl(
  telefono: string | undefined,
  mensaje: string,
): string | null {
  if (!telefono || telefono.length === 0) return null;
  return whatsappLink(telefono, mensaje);
}

export default function Reprogramaciones() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  // Modales
  const [confirmandoAprobar, setConfirmandoAprobar] = useState<ItemPropuesta | null>(null);
  const [rechazandoItem, setRechazandoItem] = useState<ItemPropuesta | null>(null);
  const [notaRechazo, setNotaRechazo] = useState('');
  const [contraproponiendoItem, setContraproponiendoItem] = useState<ItemPropuesta | null>(null);
  const [contraFecha, setContraFecha] = useState<string>('');
  const [contraHoraIdx, setContraHoraIdx] = useState<number | null>(null);
  const [contraNota, setContraNota] = useState('');

  useEffect(() => {
    const unsub = suscribirOrdenesConPropuestaReprogramacionPendiente((lista) => {
      setOrdenes(lista);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const items = useMemo<ItemPropuesta[]>(() => {
    const out: ItemPropuesta[] = [];
    for (const orden of ordenes) {
      // `obtenerPropuestaReprogramacionPendiente` ya filtra por
      // `propuestaPor === 'cliente'` — las contrapropuestas del propio
      // admin no aparecen acá (quedan trazadas en `auditoria` y se
      // confirman manualmente vía WhatsApp).
      const propuesta = obtenerPropuestaReprogramacionPendiente(orden);
      if (propuesta) out.push({ orden, propuesta });
    }
    out.sort((a, b) => {
      const at = toDateSafe(a.propuesta.fechaPropuesta)?.getTime() ?? 0;
      const bt = toDateSafe(b.propuesta.fechaPropuesta)?.getTime() ?? 0;
      return bt - at;
    });
    return out;
  }, [ordenes]);

  // ─── Aprobar ───
  const abrirAprobar = (item: ItemPropuesta) => setConfirmandoAprobar(item);
  const cerrarAprobar = () => setConfirmandoAprobar(null);

  const handleConfirmarAprobar = async () => {
    if (!confirmandoAprobar || !userProfile?.id) return;
    setTrabajando(confirmandoAprobar.propuesta.id);
    try {
      await resolverPropuestaReprogramacionConNotif(
        confirmandoAprobar.orden,
        confirmandoAprobar.propuesta,
        'aprobar',
        {
          resueltaPor: userProfile.id,
          resueltaPorNombre: userProfile.nombre || 'Oficina',
        },
      );

      // Abrir WhatsApp al cliente con confirmación
      const fechaNueva = toDateSafe(confirmandoAprobar.propuesta.fechaNuevaPropuesta);
      const fechaTxt = formatFechaDiaCompleto(fechaNueva);
      const mensaje =
        `Hola ${confirmandoAprobar.orden.clienteNombre}, confirmado, ` +
        `te esperamos el ${fechaTxt}. - Mister Service RD`;
      const wUrl = whatsappClienteUrl(confirmandoAprobar.orden.clienteTelefono, mensaje);
      if (wUrl) {
        window.open(wUrl, '_blank', 'noopener,noreferrer');
      }

      toast.success('Propuesta aprobada — fecha de la cita actualizada');
      cerrarAprobar();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo aprobar: ' + msg);
    } finally {
      setTrabajando(null);
    }
  };

  // ─── Rechazar ───
  const abrirRechazo = (item: ItemPropuesta) => {
    setRechazandoItem(item);
    setNotaRechazo('');
  };
  const cerrarRechazo = () => {
    setRechazandoItem(null);
    setNotaRechazo('');
  };

  const handleConfirmarRechazo = async () => {
    if (!rechazandoItem || !userProfile?.id) return;
    if (notaRechazo.trim().length < MIN_NOTA_RECHAZO) {
      toast.error(`El motivo debe tener al menos ${MIN_NOTA_RECHAZO} caracteres`);
      return;
    }
    setTrabajando(rechazandoItem.propuesta.id);
    try {
      await resolverPropuestaReprogramacionConNotif(
        rechazandoItem.orden,
        rechazandoItem.propuesta,
        'rechazar',
        {
          resueltaPor: userProfile.id,
          resueltaPorNombre: userProfile.nombre || 'Oficina',
          notaResolucion: notaRechazo.trim(),
        },
      );

      // WhatsApp al cliente con motivo
      const mensaje =
        `Hola ${rechazandoItem.orden.clienteNombre}, no podemos reagendar para esa fecha. ` +
        `Motivo: ${notaRechazo.trim()}. ¿Te sirve otra fecha? ` +
        `Avísanos por aquí. - Mister Service RD`;
      const wUrl = whatsappClienteUrl(rechazandoItem.orden.clienteTelefono, mensaje);
      if (wUrl) {
        window.open(wUrl, '_blank', 'noopener,noreferrer');
      }

      toast.success('Propuesta rechazada — el cliente fue contactado');
      cerrarRechazo();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo rechazar: ' + msg);
    } finally {
      setTrabajando(null);
    }
  };

  // ─── Contraproponer ───
  const abrirContrapropuesta = (item: ItemPropuesta) => {
    setContraproponiendoItem(item);
    setContraFecha('');
    setContraHoraIdx(null);
    setContraNota('');
  };
  const cerrarContrapropuesta = () => {
    setContraproponiendoItem(null);
    setContraFecha('');
    setContraHoraIdx(null);
    setContraNota('');
  };

  const contraFechaSeleccionadaEsDomingo = useMemo(() => {
    if (!contraFecha) return false;
    const [y, m, d] = contraFecha.split('-').map(n => parseInt(n, 10));
    if (!y || !m || !d) return false;
    return new Date(y, m - 1, d, 12, 0, 0).getDay() === 0;
  }, [contraFecha]);

  const contraFormularioListo =
    !!contraFecha && contraHoraIdx !== null && !contraFechaSeleccionadaEsDomingo;

  const handleConfirmarContrapropuesta = async () => {
    if (!contraproponiendoItem || !userProfile?.id || !contraFormularioListo || contraHoraIdx === null) return;
    setTrabajando(contraproponiendoItem.propuesta.id);
    try {
      const [y, m, d] = contraFecha.split('-').map(n => parseInt(n, 10));
      const slot = SLOTS_HORARIOS[contraHoraIdx];
      const fechaInstante = new Date(y, m - 1, d, slot.hour, 0, 0, 0);

      await resolverPropuestaReprogramacionConNotif(
        contraproponiendoItem.orden,
        contraproponiendoItem.propuesta,
        'contraproponer',
        {
          resueltaPor: userProfile.id,
          resueltaPorNombre: userProfile.nombre || 'Oficina',
          contrapropuestaFecha: fechaInstante,
          notaResolucion: contraNota.trim() || undefined,
        },
      );

      const fechaTxt = formatFechaDiaCompleto(fechaInstante);
      // Link al portal del cliente para confirmar
      const tokenPortal = contraproponiendoItem.orden.tokenPortalCliente;
      const baseUrl = window.location.origin;
      const linkPortal = tokenPortal
        ? `${baseUrl}/cliente/${tokenPortal}`
        : baseUrl;
      const mensaje =
        `Hola ${contraproponiendoItem.orden.clienteNombre}, no podemos en la fecha que pediste. ` +
        `Te proponemos ${fechaTxt}. Confirmá por aquí o desde el portal: ${linkPortal}. ` +
        `- Mister Service RD`;
      const wUrl = whatsappClienteUrl(contraproponiendoItem.orden.clienteTelefono, mensaje);
      if (wUrl) {
        window.open(wUrl, '_blank', 'noopener,noreferrer');
      }

      toast.success('Contrapropuesta enviada — esperando respuesta del cliente');
      cerrarContrapropuesta();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo contraproponer: ' + msg);
    } finally {
      setTrabajando(null);
    }
  };

  // ─── Render ───
  if (loading) return <LoadingSpinner fullPage text="Cargando reprogramaciones..." />;

  const hoy = new Date();
  const minDate = new Date(hoy);
  minDate.setDate(minDate.getDate() + 1);
  const maxDate = new Date(hoy);
  maxDate.setDate(maxDate.getDate() + MAX_DIAS_FUTURO);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <RefreshCw size={22} /> Reprogramaciones de citas
          </h1>
          <p className="text-gray-500 text-sm">
            {items.length === 0
              ? 'No hay propuestas pendientes de revisión.'
              : `${items.length} propuesta${items.length === 1 ? '' : 's'} pendiente${items.length === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          <CalendarClock size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay propuestas pendientes.</p>
          <p className="text-xs mt-1">
            Cuando un cliente pida posponer su cita desde el portal, aparecerá acá para revisar.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const fechaPropuesta = toDateSafe(item.propuesta.fechaPropuesta);
            const fechaActual = toDateSafe(item.propuesta.fechaActualOrden);
            const fechaNueva = toDateSafe(item.propuesta.fechaNuevaPropuesta);
            const enProgreso = trabajando === item.propuesta.id;
            const wUrl = whatsappClienteUrl(
              item.orden.clienteTelefono,
              `Hola ${item.orden.clienteNombre}, sobre tu pedido de reprogramación de la orden ${item.orden.numero || item.orden.id}:`,
            );

            return (
              <div
                key={item.propuesta.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3"
              >
                {/* Header con número + cliente */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-mono text-xs text-[#0f3460] font-semibold">
                      {item.orden.numero || item.orden.id}
                    </p>
                    <p className="text-base font-semibold text-gray-900 mt-0.5">
                      {item.orden.clienteNombre}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatearEquipoLabel(item.orden)}
                    </p>
                    {item.orden.tecnicoNombre && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <UserIcon size={10} /> Técnico: {item.orden.tecnicoNombre}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                      <Clock size={10} /> {tiempoTranscurrido(fechaPropuesta)}
                    </p>
                  </div>
                </div>

                {/* Cambio propuesto */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    Cambio propuesto
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {fechaActual ? (
                      <span className="text-gray-600 line-through">
                        {formatFechaCorta(fechaActual)}
                      </span>
                    ) : (
                      <span className="text-gray-500 italic">Sin agendar previamente</span>
                    )}
                    <ArrowRight size={12} className="text-gray-400" />
                    <span className="font-semibold text-[#0f3460]">
                      {fechaNueva ? formatFechaDiaCompleto(fechaNueva) : 'Sin fecha'}
                    </span>
                  </div>
                </div>

                {/* Motivo del cliente */}
                {item.propuesta.motivo && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare size={12} className="text-amber-700" />
                      <p className="font-semibold text-amber-900">
                        Motivo del cliente
                      </p>
                    </div>
                    <p className="text-amber-800 italic">"{item.propuesta.motivo}"</p>
                  </div>
                )}

                {/* Acciones */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => abrirAprobar(item)}
                    disabled={enProgreso}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                  >
                    <CheckCircle2 size={14} /> Aceptar
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirContrapropuesta(item)}
                    disabled={enProgreso}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                  >
                    <Calendar size={14} /> Contraproponer
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirRechazo(item)}
                    disabled={enProgreso}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                  >
                    <XCircle size={14} /> Rechazar
                  </button>
                  {wUrl ? (
                    <a
                      href={wUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
                      title="WhatsApp directo al cliente"
                    >
                      <WhatsAppIcon filled={false} className="text-gray-700" size={14} />
                    </a>
                  ) : (
                    <span
                      className="flex items-center justify-center gap-1.5 bg-gray-50 text-gray-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
                      title="El cliente no tiene teléfono registrado"
                    >
                      <WhatsAppIcon filled={false} className="text-gray-400" size={14} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: confirmar aprobar */}
      <Modal
        isOpen={!!confirmandoAprobar}
        onClose={trabajando ? () => {} : cerrarAprobar}
        title="Aprobar propuesta"
      >
        <div className="space-y-4">
          {confirmandoAprobar && (
            <>
              <div className="bg-gray-50 rounded-lg p-3 text-xs">
                <p className="font-semibold">{confirmandoAprobar.orden.clienteNombre}</p>
                <p className="text-gray-600">
                  {confirmandoAprobar.orden.numero} · {formatearEquipoLabel(confirmandoAprobar.orden)}
                </p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-900 flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">La cita pasará a:</p>
                  <p className="mt-1">
                    {formatFechaDiaCompleto(toDateSafe(confirmandoAprobar.propuesta.fechaNuevaPropuesta))}
                  </p>
                  <p className="mt-2 text-[11px] opacity-80">
                    Al aceptar, te abriremos WhatsApp con un mensaje de confirmación
                    pre-armado para enviarle al cliente.
                  </p>
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarAprobar}
              disabled={!!trabajando}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarAprobar}
              disabled={!!trabajando}
              className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {trabajando ? 'Procesando...' : 'Confirmar y enviar WhatsApp'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: rechazar */}
      <Modal
        isOpen={!!rechazandoItem}
        onClose={trabajando ? () => {} : cerrarRechazo}
        title="Rechazar propuesta"
      >
        <div className="space-y-4">
          {rechazandoItem && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <p className="font-semibold">{rechazandoItem.orden.clienteNombre}</p>
              <p className="text-gray-600">
                {rechazandoItem.orden.numero} · {formatearEquipoLabel(rechazandoItem.orden)}
              </p>
            </div>
          )}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">El motivo se enviará al cliente por WhatsApp.</p>
              <p className="mt-1">
                La cita queda con la fecha original. El cliente puede proponer otra fecha
                si lo necesita.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo del rechazo *
            </label>
            <textarea
              rows={3}
              value={notaRechazo}
              onChange={(e) => setNotaRechazo(e.target.value)}
              disabled={!!trabajando}
              placeholder="Ej: El técnico no está disponible ese día."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Mínimo {MIN_NOTA_RECHAZO} caracteres.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarRechazo}
              disabled={!!trabajando}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarRechazo}
              disabled={!!trabajando || notaRechazo.trim().length < MIN_NOTA_RECHAZO}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {trabajando ? 'Procesando...' : 'Confirmar rechazo'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: contraproponer */}
      <Modal
        isOpen={!!contraproponiendoItem}
        onClose={trabajando ? () => {} : cerrarContrapropuesta}
        title="Contraproponer fecha"
      >
        <div className="space-y-4">
          {contraproponiendoItem && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <p className="font-semibold">{contraproponiendoItem.orden.clienteNombre}</p>
              <p className="text-gray-600">
                {contraproponiendoItem.orden.numero} · {formatearEquipoLabel(contraproponiendoItem.orden)}
              </p>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">La fecha propuesta NO se aplica automáticamente.</p>
              <p className="mt-1">
                Esperamos confirmación del cliente vía WhatsApp o desde el portal antes de
                actualizar la cita.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nueva fecha *
            </label>
            <input
              type="date"
              value={contraFecha}
              min={toIsoDateLocal(minDate)}
              max={toIsoDateLocal(maxDate)}
              onChange={(e) => setContraFecha(e.target.value)}
              disabled={!!trabajando}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Mínimo mañana, máximo 60 días. No domingos.
            </p>
            {contraFechaSeleccionadaEsDomingo && (
              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> No atendemos domingos. Elegí otro día.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Horario *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SLOTS_HORARIOS.map((slot, idx) => {
                const seleccionado = contraHoraIdx === idx;
                return (
                  <button
                    key={slot.label}
                    type="button"
                    disabled={!!trabajando}
                    onClick={() => setContraHoraIdx(idx)}
                    className={
                      'px-3 py-2 rounded-lg text-sm font-medium border transition-colors ' +
                      (seleccionado
                        ? 'bg-[#0f3460] text-white border-[#0f3460]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400')
                    }
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nota al cliente (opcional)
            </label>
            <textarea
              rows={2}
              value={contraNota}
              maxLength={500}
              onChange={(e) => setContraNota(e.target.value)}
              disabled={!!trabajando}
              placeholder="Ej: El técnico está disponible este día."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={cerrarContrapropuesta}
              disabled={!!trabajando}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmarContrapropuesta}
              disabled={!!trabajando || !contraFormularioListo}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {trabajando ? 'Procesando...' : 'Enviar contrapropuesta'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

