import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  Calendar,
  Clock,
  MessageCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Wrench,
  User as UserIcon,
  MapPin,
  Download,
  Info,
} from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import Logo from '../../components/Logo';
import FeedbackNPS, { FeedbackYaEnviado } from '../../components/public/FeedbackNPS';
import { useConfigWeb } from '../../hooks/useConfigWeb';
import { faseColor, faseLabel, FASES_ORDENADAS } from '../../utils';
import type { FaseOrden, OrdenServicio } from '../../types';

/**
 * Fallback hardcoded del número de coordinación para el portal del cliente.
 * Se usa cuando `config_web/sitio.numeroCoordinacionWhatsApp` no está set.
 * Decisión del sprint Portal Cliente (Hito 1).
 */
const NUMERO_COORDINACION_FALLBACK = '8092809601';

/** Intervalo de polling al endpoint del portal (ms). */
const POLL_INTERVAL_MS = 30_000;

/**
 * Shape mínimo que devuelve `/api/portal-cliente/[token]`. Se mantiene
 * sincronizado a mano con el endpoint serverless (no compartimos types
 * todavía entre cliente y `/api` para no acoplar bundles).
 */
interface PortalDataShape {
  numero: string;
  estado: string;
  cliente: { nombre: string; telefono: string };
  servicio: {
    equipoTipo: string;
    marca: string;
    modelo: string;
    descripcionFalla: string;
  };
  cita: {
    fecha: string | null;
    hora: string | null;
    tecnicoNombre: string;
    tecnicoFotoUrl: string | null;
  };
  tracking: {
    activo: boolean;
    token: string | null;
    vehiculoId: string | null;
    expiresAt: string | null;
  } | null;
  propuestaReprogramacionPendiente: {
    id: string;
    fechaActualOrden: string | null;
    fechaNuevaPropuesta: string | null;
    motivo: string;
    fechaPropuesta: string | null;
  } | null;
  historial: Array<{ fase: string; timestamp: string | null }>;
  cierre: {
    fechaCierre: string | null;
    garantiaFin: string | null;
    conduceGenerado: boolean;
  } | null;
}

type CargaEstado =
  | { tipo: 'loading' }
  | { tipo: 'ok'; data: PortalDataShape }
  | { tipo: 'no_encontrada' }
  | { tipo: 'cancelada'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

/**
 * Construye el link de WhatsApp con el número de coordinación. RD prepende
 * el `1` antes del número de 10 dígitos.
 */
function whatsappCoordinacionUrl(numero10: string, mensaje: string): string {
  const digits = numero10.replace(/\D/g, '');
  const intl = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Parsea string ISO a Date defensivamente. Devuelve null si no es válido.
 */
function parseIsoSeguro(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formato fecha + hora para mostrar al cliente. Ej: "Lunes 30 de abril, 4:00 PM".
 */
function formatFechaCliente(d: Date | null): string {
  if (!d) return 'Por confirmar';
  const fecha = format(d, "EEEE d 'de' MMMM", { locale: es });
  const hora = format(d, "h:mm a", { locale: es });
  // Capitalizar primer caracter (date-fns devuelve lowercase en es locale)
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  return `${fechaCap}, ${hora}`;
}

/**
 * Capitaliza solo la fecha (sin hora). Para historial.
 */
function formatFechaCortaCliente(d: Date | null): string {
  if (!d) return '';
  const fecha = format(d, "d 'de' MMMM, h:mm a", { locale: es });
  return fecha;
}

/**
 * Tag con color según fase, usando `faseColor()` del módulo central.
 */
function BadgeFase({ fase }: { fase: string }) {
  const faseSegura = (FASES_ORDENADAS as string[]).includes(fase) || fase === 'cancelado'
    ? (fase as FaseOrden)
    : 'nuevo_lead';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${faseColor(faseSegura)}`}
    >
      {faseLabel(faseSegura)}
    </span>
  );
}

/**
 * Stepper horizontal simple (mobile-first, scroll horizontal). Marca como
 * pasada/actual cada fase visible. No incluye `cancelado`.
 */
function StepperFasesPortal({ faseActual }: { faseActual: string }) {
  const idxActual = (FASES_ORDENADAS as string[]).indexOf(faseActual);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Estado del servicio
      </h3>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {FASES_ORDENADAS.map((fase, idx) => {
          const isPast = idxActual >= 0 && idx < idxActual;
          const isCurrent = idx === idxActual;
          const base =
            'inline-flex items-center gap-1 rounded-full border whitespace-nowrap px-2.5 py-1 text-[10.5px] font-medium shrink-0';
          const cls = isCurrent
            ? `${base} bg-[#0f3460] text-white border-[#0f3460]`
            : isPast
              ? `${base} bg-green-50 text-green-800 border-green-200`
              : `${base} bg-gray-50 text-gray-400 border-gray-200`;
          return (
            <span key={fase} className={cls}>
              {isPast && <span aria-hidden>✓ </span>}
              {faseLabel(fase)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function PortalCliente() {
  const { token } = useParams<{ token: string }>();
  const { config: configWeb } = useConfigWeb();
  const [estado, setEstado] = useState<CargaEstado>({ tipo: 'loading' });
  const [descripcionExpandida, setDescripcionExpandida] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const reintentoRef = useRef(0);

  // ─── Fetch loop ───
  useEffect(() => {
    if (!token) {
      setEstado({ tipo: 'error', mensaje: 'Token requerido' });
      return;
    }

    let cancelado = false;

    async function cargar() {
      try {
        const resp = await fetch(`/api/portal-cliente/${token}`);
        if (cancelado) return;

        if (resp.status === 404) {
          setEstado({ tipo: 'no_encontrada' });
          return;
        }
        if (resp.status === 410) {
          let mensaje = 'Esta cita fue cancelada.';
          try {
            const body = (await resp.json()) as { mensaje?: string };
            if (body.mensaje) mensaje = body.mensaje;
          } catch {
            // ignore JSON parse error
          }
          setEstado({ tipo: 'cancelada', mensaje });
          return;
        }
        if (!resp.ok) {
          // Backoff suave: aumenta cada reintento, max 4 reintentos antes
          // de dar mensaje de error claro al usuario.
          reintentoRef.current += 1;
          if (reintentoRef.current >= 4) {
            setEstado({
              tipo: 'error',
              mensaje: 'No pudimos cargar tus datos. Verifica tu conexión.',
            });
          }
          return;
        }
        const data = (await resp.json()) as PortalDataShape;
        reintentoRef.current = 0;
        setEstado({ tipo: 'ok', data });
      } catch {
        if (cancelado) return;
        reintentoRef.current += 1;
        if (reintentoRef.current >= 4) {
          setEstado({
            tipo: 'error',
            mensaje: 'No pudimos cargar tus datos. Verifica tu conexión.',
          });
        }
      }
    }

    // Carga inicial + polling
    cargar();
    intervalRef.current = window.setInterval(cargar, POLL_INTERVAL_MS);

    return () => {
      cancelado = true;
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [token]);

  // ─── Número coordinación + URL helper ───
  const numeroCoord =
    configWeb?.numeroCoordinacionWhatsApp && configWeb.numeroCoordinacionWhatsApp.trim().length > 0
      ? configWeb.numeroCoordinacionWhatsApp.trim()
      : NUMERO_COORDINACION_FALLBACK;

  // ─── Estados de error ───
  if (estado.tipo === 'loading') {
    return <LoadingSpinner fullPage text="Cargando tu orden..." />;
  }

  if (estado.tipo === 'no_encontrada') {
    const url = whatsappCoordinacionUrl(
      numeroCoord,
      'Hola, abrí el link del portal pero no encuentra mi orden.',
    );
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle size={48} className="mx-auto text-red-400" />
          <h2 className="text-xl font-bold text-gray-900">No encontramos esta orden</h2>
          <p className="text-gray-600 text-sm">
            Verifica que el link sea correcto o contáctanos por WhatsApp.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium"
          >
            <MessageCircle size={16} /> Contactar por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (estado.tipo === 'cancelada') {
    const url = whatsappCoordinacionUrl(
      numeroCoord,
      'Hola, tengo una orden cancelada y necesito ayuda.',
    );
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle size={48} className="mx-auto text-amber-400" />
          <h2 className="text-xl font-bold text-gray-900">Cita cancelada</h2>
          <p className="text-gray-600 text-sm">{estado.mensaje}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium"
          >
            <MessageCircle size={16} /> Contactar por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (estado.tipo === 'error') {
    const url = whatsappCoordinacionUrl(
      numeroCoord,
      'Hola, abrí el link del portal y me da error de conexión.',
    );
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle size={48} className="mx-auto text-red-400" />
          <h2 className="text-xl font-bold text-gray-900">No pudimos cargar tus datos</h2>
          <p className="text-gray-600 text-sm">{estado.mensaje}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                reintentoRef.current = 0;
                setEstado({ tipo: 'loading' });
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium"
            >
              Reintentar
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium"
            >
              <MessageCircle size={16} /> Contactar por WhatsApp
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render normal ───
  const { data } = estado;
  const fechaCita = parseIsoSeguro(data.cita.fecha);
  const garantiaFin = parseIsoSeguro(data.cierre?.garantiaFin || null);
  const propuesta = data.propuestaReprogramacionPendiente;

  // Mensaje WhatsApp de contacto coordinación
  const mensajeContactoCoord = `Hola, sobre mi orden ${data.numero}...`;
  const urlContactoCoord = whatsappCoordinacionUrl(numeroCoord, mensajeContactoCoord);

  // Truncado descripción
  const descripcion = data.servicio.descripcionFalla || '';
  const descCorta = descripcion.length > 200 && !descripcionExpandida
    ? descripcion.slice(0, 200) + '…'
    : descripcion;

  // Mostrar botón "Ver técnico en mapa" si fase >= en_diagnostico Y trackingGPS activo
  const fasesQueMuestranMapa = ['en_diagnostico', 'en_cotizacion', 'aprobado', 'trabajo_realizado'];
  const mostrarBotonMapa =
    fasesQueMuestranMapa.includes(data.estado) &&
    data.tracking?.activo === true &&
    typeof data.tracking.token === 'string' &&
    data.tracking.token.length > 0;

  // Hito 1: feedback NPS bajo el cierre cuando fase === 'cerrado'
  const esCerrado = data.estado === 'cerrado';
  // Para FeedbackNPS necesitamos el token GPS legacy (el endpoint POST de
  // feedback acepta tanto trackingGPS.token como tokenPortalCliente — extendido
  // en este mismo sprint). Pasamos el token de la URL directamente.
  const tokenPortal = token || '';
  // El endpoint de feedback NO viene con el feedback ya enviado en el shape
  // del portal (decisión: no exponer feedback existente en GET principal para
  // no duplicar lecturas). El componente FeedbackNPS detecta "ya enviado" vía
  // su propio GET interno.

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 shadow-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Logo size="sm" />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Orden
            </p>
            <p className="text-sm font-bold text-[#0f3460]">{data.numero || 'Sin número'}</p>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 max-w-md mx-auto w-full p-4 space-y-4">
        {/* Badge fase */}
        <div className="flex justify-center">
          <BadgeFase fase={data.estado} />
        </div>

        {/* Banner: propuesta reprogramación pendiente */}
        {propuesta && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
            <Info size={16} className="text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900 flex-1">
              <p className="font-semibold">Tu propuesta de reprogramación está siendo revisada</p>
              <p className="mt-0.5">Te avisaremos cuando la oficina la atienda.</p>
            </div>
          </div>
        )}

        {/* Card: servicio */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Tu servicio
          </h3>
          <div className="flex items-start gap-2">
            <Wrench size={16} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-900">
              {[data.servicio.equipoTipo, data.servicio.marca, data.servicio.modelo]
                .filter(s => s && s.length > 0)
                .join(' · ')}
            </p>
          </div>
          {descripcion && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Lo que reportaste</p>
              <p className="text-sm text-gray-800 whitespace-pre-line">{descCorta}</p>
              {descripcion.length > 200 && (
                <button
                  type="button"
                  onClick={() => setDescripcionExpandida(v => !v)}
                  className="text-xs text-[#1a5fa8] hover:underline mt-1 font-medium"
                >
                  {descripcionExpandida ? 'Ver menos' : 'Ver más'}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Card: cita */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Tu cita
          </h3>
          <div className="flex items-start gap-2">
            <Calendar size={16} className="text-gray-400 mt-0.5 shrink-0" />
            <div className="text-sm text-gray-900">
              <p className="font-medium">{formatFechaCliente(fechaCita)}</p>
            </div>
          </div>
          {data.cita.tecnicoNombre && (
            <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
              {data.cita.tecnicoFotoUrl ? (
                <img
                  src={data.cita.tecnicoFotoUrl}
                  alt={data.cita.tecnicoNombre}
                  className="w-12 h-12 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <UserIcon size={20} className="text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  Técnico asignado
                </p>
                <p className="text-sm font-medium text-gray-900">{data.cita.tecnicoNombre}</p>
              </div>
            </div>
          )}
          {mostrarBotonMapa && data.tracking && (
            <a
              href={`/tracking/${data.tracking.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium py-2.5 transition-colors"
            >
              <MapPin size={14} /> Ver técnico en mapa
            </a>
          )}
        </section>

        {/* Stepper */}
        <StepperFasesPortal faseActual={data.estado} />

        {/* Card: acciones */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            ¿Necesitas algo?
          </h3>
          {/* Botón posponer (deshabilitado en Hito 1) */}
          <div>
            <button
              type="button"
              disabled
              title="Disponible próximamente"
              className="w-full inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium py-2.5 cursor-not-allowed"
            >
              <Calendar size={14} /> Pedir posponer mi cita
            </button>
            <p className="text-[10px] text-gray-500 mt-1 text-center">
              Próximamente
            </p>
          </div>
          {/* Botón WhatsApp coordinación */}
          <a
            href={urlContactoCoord}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium py-2.5 transition-colors"
          >
            <MessageCircle size={14} /> WhatsApp con coordinación
          </a>
        </section>

        {/* Card: historial (colapsable) */}
        {data.historial.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <button
              type="button"
              onClick={() => setHistorialAbierto(v => !v)}
              className="w-full flex items-center justify-between p-4"
            >
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Historial
              </h3>
              {historialAbierto
                ? <ChevronUp size={16} className="text-gray-400" />
                : <ChevronDown size={16} className="text-gray-400" />
              }
            </button>
            {historialAbierto && (
              <ol className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
                {data.historial.map((h, idx) => {
                  const ts = parseIsoSeguro(h.timestamp);
                  return (
                    <li key={idx} className="flex items-start gap-2 text-xs">
                      <Clock size={12} className="text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-gray-900 font-medium">{faseLabel(h.fase as FaseOrden)}</p>
                        {ts && (
                          <p className="text-gray-500 text-[10px]">{formatFechaCortaCliente(ts)}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {/* Cierre — fase === 'cerrado' */}
        {esCerrado && (
          <section className="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl shadow-md p-5 text-white space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={24} />
              <h3 className="text-base font-bold">Servicio completado</h3>
            </div>
            {garantiaFin && (
              <p className="text-sm">
                Tu garantía está activa hasta el{' '}
                <span className="font-semibold">
                  {format(garantiaFin, "d 'de' MMMM, yyyy", { locale: es })}
                </span>
                .
              </p>
            )}
            {data.cierre?.conduceGenerado && tokenPortal && (
              <a
                href={`/garantia/${tokenPortal}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 bg-white text-green-700 hover:bg-green-50 rounded-lg text-sm font-semibold py-2.5"
              >
                <Download size={14} /> Descargar conduce de garantía
              </a>
            )}
          </section>
        )}

        {/* Feedback NPS — sólo cuando cerrado */}
        {esCerrado && tokenPortal && configWeb?.feedbackNPS?.habilitado !== false && (
          <FeedbackNPSWrapper
            token={tokenPortal}
            clienteNombre={data.cliente.nombre}
            ordenNumero={data.numero}
            numeroWhatsAppCoordinador={numeroCoord}
            configFeedback={configWeb?.feedbackNPS}
          />
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-400 py-4">
          Mister Service RD · Gracias por confiar en nosotros
        </p>
      </div>
    </div>
  );
}

/**
 * Wrapper para FeedbackNPS que primero hace GET al endpoint para detectar
 * si el cliente ya envió feedback (en cuyo caso renderizamos `FeedbackYaEnviado`).
 *
 * Esto evita mostrar el form de NPS a clientes que ya respondieron.
 */
function FeedbackNPSWrapper(props: {
  token: string;
  clienteNombre?: string;
  ordenNumero?: string;
  numeroWhatsAppCoordinador?: string;
  configFeedback?: Parameters<typeof FeedbackNPS>[0]['configFeedback'];
}) {
  const { token } = props;
  const [estado, setEstado] = useState<
    | { tipo: 'loading' }
    | { tipo: 'pendiente' }
    | { tipo: 'enviado'; feedback: NonNullable<OrdenServicio['feedback']> }
  >({ tipo: 'loading' });

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/feedback/${token}`)
      .then(r => r.json())
      .then((body: {
        yaEnviado?: boolean;
        feedback?: {
          nps?: number;
          ratingTipo?: string;
          comentario?: string;
          fechaFeedback?: string;
        };
      }) => {
        if (cancelado) return;
        const npsRaw = body.feedback?.nps;
        if (body.yaEnviado && body.feedback && typeof npsRaw === 'number') {
          const f = body.feedback;
          const nps: number = npsRaw;
          const fecha = f.fechaFeedback ? new Date(f.fechaFeedback) : new Date();
          const ratingTipo: 'detractor' | 'pasivo' | 'promotor' =
            f.ratingTipo === 'detractor' || f.ratingTipo === 'pasivo' || f.ratingTipo === 'promotor'
              ? f.ratingTipo
              : nps <= 6 ? 'detractor' : nps <= 8 ? 'pasivo' : 'promotor';
          const feedback: NonNullable<OrdenServicio['feedback']> = {
            nps,
            ratingTipo,
            fechaFeedback: fecha,
          };
          if (f.comentario) feedback.comentario = f.comentario;
          setEstado({ tipo: 'enviado', feedback });
        } else {
          setEstado({ tipo: 'pendiente' });
        }
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({ tipo: 'pendiente' });
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (estado.tipo === 'loading') return null;
  if (estado.tipo === 'enviado') return <FeedbackYaEnviado feedback={estado.feedback} />;
  return <FeedbackNPS {...props} />;
}
