import { FileText, MapPin, Mic, Image as ImageIcon, AlertTriangle, Check, CheckCheck, Clock, ClipboardCopy } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import type {
  WhatsAppMensajeInbox,
  WhatsAppMensajeOutbox,
} from '../../types';

/**
 * Bubble de un mensaje individual en la conversación (SPRINT-INBOX-3,
 * 2026-05-20). Soporta los tipos canónicos del backend:
 *   - text, image, audio, video, document, location.
 *   - Para tipos no implementados (sticker, button, interactive, reaction,
 *     contacts, unsupported), renderiza un placeholder amarillo.
 *
 * Indicadores de estado (solo salientes):
 *   - queued    → reloj gris.
 *   - sent      → check simple gris.
 *   - delivered → doble check gris.
 *   - read      → doble check azul.
 *   - failed    → triángulo rojo + tooltip con código Meta.
 *
 * NO renderiza el campo `raw` (PII completa). Solo el contenido normalizado.
 */

type MensajeRender =
  | (WhatsAppMensajeInbox & { _direccion: 'entrante' })
  | (WhatsAppMensajeOutbox & { _direccion: 'saliente' });

interface Props {
  mensaje: MensajeRender;
  /**
   * SPRINT-INBOX-8b: cuando el form de orden está abierto (drawer del inbox),
   * el caller pasa este callback para copiar el texto del mensaje al campo
   * relevante del form (heurística simple: descripcionFalla). Si callback NO
   * se provee, el ícono no se renderiza — UX limpio cuando no hay form.
   */
  onCopiarAOrden?: (texto: string) => void;
  /**
   * SPRINT-INBOX-8b: cuando el mensaje es ubicación y el form está abierto,
   * pasar este callback para volcar `clienteLat`/`clienteLng` (+ dirección si
   * viene). Solo se llama desde la burbuja `location`.
   */
  onUsarUbicacion?: (loc: { lat: number; lng: number; direccion?: string }) => void;
}

function toDate(t: Timestamp | Date | undefined | null): Date {
  if (!t) return new Date(0);
  if (t instanceof Date) return t;
  return new Date((t as { toMillis?: () => number }).toMillis?.() ?? 0);
}

function formatHora(d: Date): string {
  if (d.getTime() === 0) return '';
  return d.toLocaleTimeString('es-DO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function IconoEstadoSaliente({ estado, errorMeta }: { estado: WhatsAppMensajeOutbox['estado']; errorMeta?: WhatsAppMensajeOutbox['errorMeta'] }) {
  if (estado === 'queued') {
    return <Clock size={12} className="text-gray-300" aria-label="En cola" />;
  }
  if (estado === 'sent') {
    return <Check size={12} className="text-gray-300" aria-label="Enviado" />;
  }
  if (estado === 'delivered') {
    return <CheckCheck size={12} className="text-gray-300" aria-label="Entregado" />;
  }
  if (estado === 'read') {
    return <CheckCheck size={12} className="text-blue-300" aria-label="Leído" />;
  }
  // failed
  return (
    <span
      className="inline-flex items-center gap-1 text-red-300"
      title={errorMeta?.mensaje || errorMeta?.title || `Error Meta ${errorMeta?.code ?? ''}`}
    >
      <AlertTriangle size={12} aria-label="Falló" />
    </span>
  );
}

function RenderContenidoEntrante({
  mensaje,
  onUsarUbicacion,
}: {
  mensaje: WhatsAppMensajeInbox;
  onUsarUbicacion?: (loc: { lat: number; lng: number; direccion?: string }) => void;
}) {
  const { tipo, contenido } = mensaje;

  if (tipo === 'text') {
    return <p className="text-sm whitespace-pre-wrap break-words">{contenido.texto ?? ''}</p>;
  }

  if (tipo === 'image') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ImageIcon size={14} />
          Imagen recibida
        </div>
        {contenido.mediaCaption && (
          <p className="text-sm whitespace-pre-wrap">{contenido.mediaCaption}</p>
        )}
      </div>
    );
  }

  if (tipo === 'audio') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <Mic size={14} className="text-gray-500" />
        Nota de voz {contenido.mediaCaption ? `· ${contenido.mediaCaption}` : ''}
      </div>
    );
  }

  if (tipo === 'video') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ImageIcon size={14} />
          Video recibido
        </div>
        {contenido.mediaCaption && (
          <p className="text-sm whitespace-pre-wrap">{contenido.mediaCaption}</p>
        )}
      </div>
    );
  }

  if (tipo === 'document') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <FileText size={14} className="text-gray-500" />
        Documento: {contenido.mediaFilename ?? 'sin nombre'}
      </div>
    );
  }

  if (tipo === 'location') {
    const loc = contenido.location;
    return (
      <div className="text-sm text-gray-700 space-y-1">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-gray-500" />
          Ubicación compartida
        </div>
        {loc && (
          <p className="text-xs text-gray-500">
            {loc.name ?? loc.address ?? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}
          </p>
        )}
        {loc && onUsarUbicacion && (
          <button
            type="button"
            onClick={() =>
              onUsarUbicacion({
                lat: loc.lat,
                lng: loc.lng,
                direccion: loc.address ?? loc.name ?? undefined,
              })
            }
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors"
            title="Llenar clienteLat/clienteLng en la orden abierta"
          >
            <MapPin size={12} />
            Usar esta ubicación en la orden
          </button>
        )}
      </div>
    );
  }

  // sticker / button / interactive / reaction / contacts / unsupported
  return (
    <div className="text-sm text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
      Tipo {tipo} — no soportado todavía en la UI
    </div>
  );
}

function RenderContenidoSaliente({ mensaje }: { mensaje: WhatsAppMensajeOutbox }) {
  if (mensaje.tipo === 'texto_libre') {
    return <p className="text-sm whitespace-pre-wrap break-words">{mensaje.texto ?? ''}</p>;
  }

  if (mensaje.tipo === 'plantilla' && mensaje.plantilla) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-emerald-100/80 italic">
          Plantilla · {mensaje.plantilla.nombre}
        </p>
        {mensaje.plantilla.variables.length > 0 && (
          <p className="text-sm whitespace-pre-wrap">
            {mensaje.plantilla.variables.join(' / ')}
          </p>
        )}
      </div>
    );
  }

  if (mensaje.tipo === 'media' && mensaje.media) {
    const mime = mensaje.media.mimeType || '';
    let icon: React.ReactNode = <FileText size={14} />;
    let label = 'Documento enviado';
    if (mime.startsWith('image/')) {
      icon = <ImageIcon size={14} />;
      label = 'Imagen enviada';
    } else if (mime.startsWith('audio/')) {
      icon = <Mic size={14} />;
      label = 'Audio enviado';
    } else if (mime.startsWith('video/')) {
      icon = <ImageIcon size={14} />;
      label = 'Video enviado';
    }
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-emerald-100/80">
          {icon}
          {label}
        </div>
        {mensaje.media.caption && (
          <p className="text-sm whitespace-pre-wrap">{mensaje.media.caption}</p>
        )}
      </div>
    );
  }

  return <p className="text-sm italic text-emerald-100/70">Mensaje saliente</p>;
}

/**
 * SPRINT-INBOX-8b: extrae el texto plano del mensaje (entrante o saliente)
 * para la acción "copiar a orden". Para mensajes con caption sobre media,
 * devuelve el caption. Para text/texto_libre, el contenido. Para tipos sin
 * texto utilizable (audio sin caption, location, sticker), retorna null —
 * el ícono no aparece.
 */
function extraerTextoCopiable(mensaje: MensajeRender): string | null {
  if (mensaje._direccion === 'entrante') {
    if (mensaje.tipo === 'text') return mensaje.contenido.texto ?? null;
    const cap = mensaje.contenido.mediaCaption;
    if (cap && cap.trim()) return cap;
    return null;
  }
  if (mensaje.tipo === 'texto_libre') return mensaje.texto ?? null;
  if (mensaje.tipo === 'media' && mensaje.media?.caption?.trim()) return mensaje.media.caption;
  return null;
}

export default function MensajeBubble({ mensaje, onCopiarAOrden, onUsarUbicacion }: Props) {
  const esSaliente = mensaje._direccion === 'saliente';
  const fecha =
    mensaje._direccion === 'entrante'
      ? toDate(mensaje.timestampMeta)
      : toDate(mensaje.createdAt);

  const textoCopiable = onCopiarAOrden ? extraerTextoCopiable(mensaje) : null;

  return (
    <div className={`group flex items-end gap-1 ${esSaliente ? 'justify-end' : 'justify-start'}`}>
      {/* SPRINT-INBOX-8b: botón "copiar a orden" (solo entrante, solo si form abierto y hay texto) */}
      {!esSaliente && textoCopiable && onCopiarAOrden && (
        <button
          type="button"
          onClick={() => onCopiarAOrden(textoCopiable)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-full focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          title="Copiar este mensaje al form de orden abierto"
          aria-label="Copiar este mensaje a la orden"
        >
          <ClipboardCopy size={14} />
        </button>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
          esSaliente
            ? 'bg-emerald-600 text-white rounded-br-sm'
            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
        }`}
      >
        {esSaliente ? (
          <RenderContenidoSaliente mensaje={mensaje} />
        ) : (
          <RenderContenidoEntrante mensaje={mensaje} onUsarUbicacion={onUsarUbicacion} />
        )}
        <div
          className={`flex items-center gap-1.5 mt-1 text-[10px] ${
            esSaliente ? 'text-emerald-100/80 justify-end' : 'text-gray-400 justify-start'
          }`}
        >
          <span>{formatHora(fecha)}</span>
          {esSaliente && (
            <IconoEstadoSaliente estado={mensaje.estado} errorMeta={mensaje.errorMeta} />
          )}
        </div>
      </div>
    </div>
  );
}
