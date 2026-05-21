import type { OrdenServicio } from '../types';
import type {
  WhatsAppMensajeInbox,
  WhatsAppMensajeOutbox,
} from '../types';
import { obtenerTimelineAcciones, type ItemTimeline } from './timelineAcciones';

/**
 * Item del timeline UNIFICADO (SPRINT-FEED-UNIFICADO-ORDEN, 2026-05-21).
 * Extiende `ItemTimeline` (fases + auditoría) con mensajes WhatsApp del
 * cliente de la orden. Como el lead detail de Kommo: todo el historial del
 * cliente en un solo hilo cronológico.
 *
 * Source-of-truth:
 *  - eventos de fase: `orden.historialFases[]`.
 *  - eventos de auditoría: `orden.auditoria[]`.
 *  - mensajes WhatsApp: `whatsapp_mensajes_inbox` + `whatsapp_mensajes_outbox`
 *    filtrados por `wa_id` derivado del teléfono normalizado del cliente.
 *
 * No escribe Firestore. Sort cronológico descendente (más reciente arriba).
 */
export type ItemTimelineUnificado =
  | (ItemTimeline & { origenUnificado: 'fase' | 'auditoria' })
  | {
      origenUnificado: 'whatsapp_entrante' | 'whatsapp_saliente';
      fecha: Date;
      /** Texto preview del mensaje (puede estar truncado). */
      descripcion: string;
      /** Nombre del actor humano. Para entrantes = nombre del cliente.
       *  Para salientes = staff que envió. Fallback "Sistema". */
      actorNombre: string;
      /** Tipo del mensaje WhatsApp para decidir icono / color. */
      tipoMensaje?: string;
    };

/**
 * Convierte Timestamp Firestore o Date a Date. Devuelve null si inválido.
 */
function aDate(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object' && valor !== null && 'toDate' in valor) {
    try {
      return (valor as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof valor === 'string' || typeof valor === 'number') {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Trunca texto a `max` chars (default 140) agregando ellipsis si excede.
 * Para preview de mensaje en timeline (no para render del mensaje completo).
 */
function preview(texto: string, max = 140): string {
  if (!texto) return '';
  if (texto.length <= max) return texto;
  return texto.slice(0, max).trimEnd() + '…';
}

/**
 * Resuelve la descripción visible de un mensaje entrante según su `tipo`.
 * Mantiene contrato simple: si es text → snippet del body. Si es media
 * → marcador `[imagen]`/`[audio]`/etc. Si es location → "Ubicación
 * compartida".
 */
function describirMensajeEntrante(m: WhatsAppMensajeInbox): string {
  switch (m.tipo) {
    case 'text': {
      const body = (m.contenido as { body?: string })?.body ?? '';
      return preview(body) || '(mensaje vacío)';
    }
    case 'image':
      return '[imagen]';
    case 'audio':
      return '[audio]';
    case 'video':
      return '[video]';
    case 'document':
      return '[documento]';
    case 'location':
      return '[ubicación compartida]';
    case 'sticker':
      return '[sticker]';
    case 'contacts':
      return '[contacto]';
    case 'interactive':
      return '[interactivo]';
    case 'button':
      return '[botón]';
    default:
      return '[mensaje]';
  }
}

/**
 * Resuelve la descripción de un mensaje saliente. Si fue plantilla,
 * mostramos el nombre de la plantilla. Si fue texto libre, snippet. Si
 * fue media, marcador.
 */
function describirMensajeSaliente(m: WhatsAppMensajeOutbox): string {
  if (m.tipo === 'plantilla' && m.plantilla?.nombre) {
    return `Plantilla: ${m.plantilla.nombre}`;
  }
  if (m.tipo === 'texto_libre' && m.texto) {
    return preview(m.texto);
  }
  if (m.tipo === 'media' && m.media) {
    const mime = m.media.mimeType || 'media';
    return `[envío ${mime}]`;
  }
  return '[mensaje saliente]';
}

/**
 * Combina los eventos de la orden con los mensajes WhatsApp del cliente
 * en un solo hilo cronológico descendente. Mensajes WhatsApp sin fecha
 * parseable se descartan en silencio (no rompen el render).
 *
 * Diseño:
 *  - Si `mensajesWhatsApp` está vacío o `wa_id` no se pudo derivar, el
 *    timeline degrada gracefully a fases+auditoría (equivalente a
 *    obtenerTimelineAcciones, pero sin el guard `<2 items`).
 *  - El cap `max` aplica DESPUÉS del merge — los mensajes WhatsApp pueden
 *    desplazar fases/auditoría viejas si son más recientes (esperado).
 */
export function construirTimelineUnificado(
  orden: Pick<OrdenServicio, 'historialFases' | 'auditoria'>,
  mensajesWhatsApp: Array<
    | (WhatsAppMensajeInbox & { _direccion: 'entrante' })
    | (WhatsAppMensajeOutbox & { _direccion: 'saliente' })
  >,
  options: { max?: number; nombreCliente?: string } = {},
): ItemTimelineUnificado[] {
  const max = options.max ?? 50;
  const nombreCliente = options.nombreCliente?.trim() || 'Cliente';

  // Eventos de la orden — reusamos el helper existente pero forzamos
  // un max muy alto para que no recorte acá (el merge final hace el cap).
  const eventosOrden = obtenerTimelineAcciones(orden, 9999);
  const items: ItemTimelineUnificado[] = eventosOrden.map((it) => ({
    ...it,
    origenUnificado: it.origen,
  }));

  // Eventos WhatsApp.
  for (const m of mensajesWhatsApp) {
    if (m._direccion === 'entrante') {
      const fecha = aDate(m.timestampMeta) ?? aDate(m.timestampRecibido);
      if (!fecha) continue;
      items.push({
        origenUnificado: 'whatsapp_entrante',
        fecha,
        descripcion: describirMensajeEntrante(m),
        actorNombre: nombreCliente,
        tipoMensaje: m.tipo,
      });
    } else {
      const fecha = aDate(m.createdAt);
      if (!fecha) continue;
      items.push({
        origenUnificado: 'whatsapp_saliente',
        fecha,
        descripcion: describirMensajeSaliente(m),
        actorNombre: m.creadoPorNombre || 'Sistema',
        tipoMensaje: m.tipo,
      });
    }
  }

  items.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return items.slice(0, max);
}
