import TextoMensaje from './TextoMensaje';
import ArchivoMensaje from './ArchivoMensaje';
import { equipoApi } from '../../services/equipoApi';
import { useState, useRef, useId } from 'react';
import MenuMensaje from './MenuMensaje';
import toast from 'react-hot-toast';
import { FileText, MapPin, Mic, Image as ImageIcon, AlertTriangle, Check, CheckCheck, Clock, ClipboardCopy, Paperclip, Loader2, Copy } from 'lucide-react';
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
  onGestionCrm?: (mensaje: WhatsAppMensajeInbox, accion: 'nota' | 'pago' | 'expediente') => void;
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
  /**
   * SPRINT-INBOX-9: cuando el mensaje es imagen entrante y el form está
   * abierto, pasar este callback para descargar la imagen de Meta + subir
   * a Firebase Storage + adjuntarla al campo `fotoEquipoUrl` de la orden.
   * Recibe el wamid del mensaje (la lookup completa la hace el endpoint
   * server-side `api/whatsapp/media-proxy.ts`). Si callback NO se provee,
   * el botón no se renderiza.
   */
  onAdjuntarAOrden?: (wamid: string) => Promise<void>;
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
    return <Clock size={12} className="text-slate-600" aria-label="En cola" />;
  }
  if (estado === 'sent') {
    return <Check size={12} className="text-slate-600" aria-label="Enviado" />;
  }
  if (estado === 'delivered') {
    return <CheckCheck size={12} className="text-slate-600" aria-label="Entregado" />;
  }
  if (estado === 'read') {
    return <CheckCheck size={12} className="text-blue-700" aria-label="Leído" />;
  }
  // failed
  return (
    <span
      className="inline-flex items-center gap-1 text-red-700"
      title={errorMeta?.mensaje || errorMeta?.title || `Error Meta ${errorMeta?.code ?? ''}`}
    >
      <AlertTriangle size={12} aria-label="Falló" />
    </span>
  );
}

function RenderContenidoEntrante({
  mensaje,
  onUsarUbicacion,
  onAdjuntarAOrden,
}: {
  mensaje: WhatsAppMensajeInbox;
  onUsarUbicacion?: (loc: { lat: number; lng: number; direccion?: string }) => void;
  onAdjuntarAOrden?: (wamid: string) => Promise<void>;
}) {
  const { tipo, contenido } = mensaje;
  const [adjuntando, setAdjuntando] = useState(false);

  if (tipo === 'text') {
    return <TextoMensaje texto={contenido.texto ?? ''} />;
  }

  if (tipo === 'image') {
    const handleAdjuntar = async () => {
      if (!onAdjuntarAOrden || !mensaje.wamid) return;
      setAdjuntando(true);
      try {
        await onAdjuntarAOrden(mensaje.wamid);
      } finally {
        setAdjuntando(false);
      }
    };
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ImageIcon size={14} />
          Imagen recibida
        </div>
        <ArchivoMensaje mensaje={mensaje} />
        {contenido.mediaCaption && (
          <p className="text-sm whitespace-pre-wrap">{contenido.mediaCaption}</p>
        )}
        {onAdjuntarAOrden && contenido.mediaId && (
          <button
            type="button"
            onClick={handleAdjuntar}
            disabled={adjuntando}
            className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors disabled:opacity-60 disabled:cursor-wait"
            title="Bajar la imagen y adjuntarla a la orden abierta"
          >
            {adjuntando ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
            {adjuntando ? 'Adjuntando…' : 'Adjuntar a la orden'}
          </button>
        )}
      </div>
    );
  }

  if (tipo === 'audio') return <AudioRecibido mensaje={mensaje} />;

  if (['video', 'document', 'sticker'].includes(tipo)) return <ArchivoMensaje mensaje={mensaje} />;

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
<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loc.lat},${loc.lng}`)}`} target="_blank" rel="noopener noreferrer" className="underline">{loc.name ?? loc.address ?? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`} · Abrir mapa</a>
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

  if (tipo === 'button') return <TextoMensaje texto={contenido.buttonText || 'Respuesta de botón'} />;
  if (tipo === 'reaction') return <p className="text-sm">Reacción: {contenido.reactionEmoji || 'retirada'}</p>;
  if (tipo === 'interactive') {
    const payload = contenido.interactivePayload as Record<string, unknown> | undefined;
    const reply = (payload?.button_reply || payload?.list_reply) as { title?: string; description?: string } | undefined;
    return <TextoMensaje texto={reply?.title || reply?.description || 'Respuesta interactiva recibida'} />;
  }
  if (tipo === 'contacts') {
    const contacts = (contenido.contactsPayload as { contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string }> }> } | undefined)?.contacts;
    return <div className="space-y-2">{contacts?.map((c, i) => <div key={i}><strong>{c.name?.formatted_name || 'Contacto compartido'}</strong>{c.phones?.map((p, j) => <p key={j}>{p.phone}</p>)}</div>) || 'Contacto compartido'}</div>;
  }

  // sticker / button / interactive / reaction / contacts / unsupported
  return (
    <div className="text-sm text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
      WhatsApp no proporcionó un contenido que podamos mostrar para este mensaje. Pide al cliente reenviarlo como archivo o texto.
    </div>
  );
}

function AudioRecibido({ mensaje }: { mensaje: WhatsAppMensajeInbox }) {
  const [url, setUrl] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  return <div className="max-w-full">
    {url ? <audio controls preload="metadata" src={url} className="w-full max-w-[260px]" onError={() => { setUrl(''); setError('No se pudo reproducir. Vuelve a cargar el audio.'); }} /> :
      <button type="button" disabled={cargando} className="min-h-11 flex items-center gap-2 text-sm" onClick={async () => {
        setCargando(true); setError('');
        try { const r = await equipoApi<{ urlImagen: string }>('/api/whatsapp/media-proxy', { wamid: mensaje.wamid, wa_id: mensaje.wa_id }); setUrl(r.urlImagen); }
        catch { setError('No se pudo cargar el audio. Intenta de nuevo.'); }
        finally { setCargando(false); }
      }}><Mic size={18} />{cargando ? 'Cargando audio…' : 'Escuchar nota de voz'}</button>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

function RenderContenidoSaliente({ mensaje }: { mensaje: WhatsAppMensajeOutbox }) {
  if (mensaje.tipo === 'texto_libre') {
    return <TextoMensaje texto={mensaje.texto ?? ''} />;
  }

  if (mensaje.tipo === 'plantilla' && mensaje.plantilla) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-emerald-900/80 italic">
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
      return <audio controls preload="none" src={mensaje.media.storageUrl} className="w-full max-w-[260px]" />;
    } else if (mime.startsWith('video/')) {
      icon = <ImageIcon size={14} />;
      label = 'Video enviado';
    }
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-emerald-900/80">
          {icon}
          {label}
        </div>
        {mensaje.media.caption && (
          <p className="text-sm whitespace-pre-wrap">{mensaje.media.caption}</p>
        )}
      </div>
    );
  }

  return <p className="text-sm italic text-emerald-900/80">Mensaje saliente</p>;
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

export default function MensajeBubble({ mensaje, onCopiarAOrden, onUsarUbicacion, onAdjuntarAOrden, onGestionCrm }: Props) {
  const [menuCrm, setMenuCrm] = useState(false);
  const menuAncla = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const esSaliente = mensaje._direccion === 'saliente';
  const admiteFuenteCrm = !esSaliente && ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location'].includes(mensaje.tipo);
  const fecha =
    mensaje._direccion === 'entrante'
      ? toDate(mensaje.timestampMeta)
      : toDate(mensaje.createdAt);

  // SPRINT-INBOX-8b: "copiar a orden" solo cuando el form está abierto.
  const textoParaOrden = onCopiarAOrden ? extraerTextoCopiable(mensaje) : null;
  // SPRINT-WA-INBOX-UX-QUICKWINS quickwin 3: "copiar al portapapeles" SIEMPRE
  // que el mensaje tenga texto copiable (sin depender del form abierto).
  const textoClipboard = extraerTextoCopiable(mensaje);
  const [copiadoClipboard, setCopiadoClipboard] = useState(false);
  const handleCopiarClipboard = async () => {
    if (!textoClipboard) return;
    try {
      await navigator.clipboard.writeText(textoClipboard);
      setCopiadoClipboard(true);
      toast.success('Mensaje copiado');
      window.setTimeout(() => setCopiadoClipboard(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  return (
    <div id={`mensaje-${mensaje.wamid || mensaje.id}`} onContextMenu={e => { if (onGestionCrm && admiteFuenteCrm) { e.preventDefault(); setMenuCrm(true); } }} className={`group relative flex items-end gap-1 my-2 ${esSaliente ? 'justify-end' : 'justify-start'}`}>
      {admiteFuenteCrm && onGestionCrm && <div className="relative order-last shrink-0">
        <button ref={menuAncla} type="button" aria-label="Acciones del mensaje" aria-haspopup="menu" aria-controls={menuCrm ? menuId : undefined} aria-expanded={menuCrm}
          className="min-h-11 min-w-11 p-2 rounded hover:bg-gray-100" onClick={() => setMenuCrm(v => !v)}>⋯</button>
        {menuCrm && <MenuMensaje id={menuId} ancla={menuAncla} onCerrar={() => setMenuCrm(false)} onAccion={accion => onGestionCrm(mensaje as WhatsAppMensajeInbox, accion)} />}
      </div>}
      {/* SPRINT-INBOX-8b: botón "copiar a orden" (solo entrante, solo si form abierto y hay texto) */}
      {!esSaliente && textoParaOrden && onCopiarAOrden && (
        <button
          type="button"
          onClick={() => onCopiarAOrden(textoParaOrden)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-full focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          title="Copiar este mensaje al form de orden abierto"
          aria-label="Copiar este mensaje a la orden"
        >
          <ClipboardCopy size={14} />
        </button>
      )}
      {/* SPRINT-WA-INBOX-UX-QUICKWINS quickwin 3: copiar al portapapeles (cualquier dirección, cualquier momento) */}
      {!esSaliente && textoClipboard && (
        <button
          type="button"
          onClick={handleCopiarClipboard}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-500 hover:text-brand-700 hover:bg-brand-50 rounded-full focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-200"
          title="Copiar este mensaje al portapapeles"
          aria-label="Copiar al portapapeles"
        >
          {copiadoClipboard ? (
            <Check size={14} className="text-emerald-600" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      )}
      <div
        className={`max-w-[78%] rounded-[15px] px-3 py-2 ${
          esSaliente
            ? 'bg-[#D9F7CF] text-slate-900 rounded-br-[5px]'
            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-[5px]'
        }`}
      >
        {esSaliente ? (
          <RenderContenidoSaliente mensaje={mensaje} />
        ) : (
          <RenderContenidoEntrante
            mensaje={mensaje}
            onUsarUbicacion={onUsarUbicacion}
            onAdjuntarAOrden={onAdjuntarAOrden}
          />
        )}
        <div
          className={`flex items-center gap-1.5 mt-1 text-[10px] ${
            esSaliente ? 'text-emerald-900/80 justify-end' : 'text-gray-500 justify-start'
          }`}
        >
          {/* SPRINT-WA-TRAZABILIDAD 2026-05-23 función 1: mostrar quién envió en salientes.
              `creadoPor`/`creadoPorNombre` ya viven en el outbox desde antes (parser
              whatsappInbox.service.ts:136-137). Si no hay nombre, fallback "Sistema". */}
          {esSaliente && (
            <span
              className="opacity-80"
              title={`Enviado por ${mensaje.creadoPorNombre || 'Sistema'}`}
            >
              {mensaje.creadoPorNombre || 'Sistema'} ·
            </span>
          )}
          <span>{formatHora(fecha)}</span>
          {esSaliente && (
            <IconoEstadoSaliente estado={mensaje.estado} errorMeta={mensaje.errorMeta} />
          )}
        </div>
      </div>
      {/* SPRINT-WA-INBOX-UX-QUICKWINS quickwin 3: copiar mensaje saliente al portapapeles */}
      {esSaliente && textoClipboard && (
        <button
          type="button"
          onClick={handleCopiarClipboard}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-400 hover:text-brand-700 hover:bg-brand-50 rounded-full focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-200"
          title="Copiar este mensaje al portapapeles"
          aria-label="Copiar al portapapeles"
        >
          {copiadoClipboard ? (
            <Check size={14} className="text-emerald-600" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      )}
    </div>
  );
}
