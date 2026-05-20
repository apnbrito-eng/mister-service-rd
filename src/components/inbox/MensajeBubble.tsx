import { FileText, MapPin, Mic, Image as ImageIcon, AlertTriangle, Check, CheckCheck, Clock } from 'lucide-react';
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

function RenderContenidoEntrante({ mensaje }: { mensaje: WhatsAppMensajeInbox }) {
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

export default function MensajeBubble({ mensaje }: Props) {
  const esSaliente = mensaje._direccion === 'saliente';
  const fecha =
    mensaje._direccion === 'entrante'
      ? toDate(mensaje.timestampMeta)
      : toDate(mensaje.createdAt);

  return (
    <div className={`flex ${esSaliente ? 'justify-end' : 'justify-start'}`}>
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
          <RenderContenidoEntrante mensaje={mensaje} />
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
