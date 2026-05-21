import { useEffect, useState, useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowRight, Edit3, Trash2, Plus, Check, FileText, Camera,
  Pause, RotateCcw, Shield, History, MessageSquare, Send,
} from 'lucide-react';
import { normalizarTelefono } from '../../services/clientes.service';
import { suscribirMensajes } from '../../services/whatsappInbox.service';
import {
  construirTimelineUnificado,
  type ItemTimelineUnificado,
} from '../../utils/timelineUnificado';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import type {
  OrdenServicio,
  WhatsAppMensajeInbox,
  WhatsAppMensajeOutbox,
} from '../../types';

interface Props {
  orden: Pick<
    OrdenServicio,
    'historialFases' | 'auditoria' | 'clienteTelefono' | 'clienteNombre'
  >;
  /** Máximo de items en el timeline. Default 50 (timeline completo). */
  max?: number;
  className?: string;
  /** Visual variant: 'page' = sección dentro del detail page,
   *  'modal' = compacto para el side modal. */
  variant?: 'page' | 'modal';
}

/**
 * Timeline UNIFICADO en el detalle de una orden (SPRINT-FEED-UNIFICADO-ORDEN).
 *
 * Mezcla en un solo hilo cronológico descendente:
 *   - Cambios de fase (`orden.historialFases`)
 *   - Registros de auditoría (`orden.auditoria`)
 *   - Mensajes WhatsApp del cliente (whatsapp_mensajes_inbox + _outbox
 *     filtrados por wa_id derivado del teléfono del cliente)
 *
 * Lectura pura — no escribe. Reusa `suscribirMensajes` de
 * `whatsappInbox.service`. Si el cliente no tiene teléfono normalizable
 * o no hay mensajes, el timeline degrada a fases+auditoría sin error.
 *
 * Sub-regla CLAUDE.md `react-refresh/only-export-components`: este archivo
 * solo exporta el componente; helpers viven en `utils/timelineUnificado.ts`.
 */
function iconoParaItem(item: ItemTimelineUnificado) {
  if (item.origenUnificado === 'whatsapp_entrante') return WhatsAppIcon;
  if (item.origenUnificado === 'whatsapp_saliente') return Send;
  if (item.origenUnificado === 'fase') return ArrowRight;
  // auditoria
  switch ((item as { accion?: string }).accion) {
    case 'crear': return Plus;
    case 'editar':
    case 'editar_orden_datos_cliente':
      return Edit3;
    case 'eliminar': return Trash2;
    case 'cierre': return Check;
    case 'marcar_chequeo': return Camera;
    case 'precio_sugerido': return FileText;
    case 'aprobar_piezas':
    case 'editar_piezas':
      return FileText;
    case 'poner_standby': return Pause;
    case 'reactivar_orden':
    case 'reactivar_orden_post_chequeo':
      return RotateCcw;
    case 'emitir_garantia':
    case 'reclamo_garantia_cliente':
    case 'marcar_garantia_admin':
    case 'cambio_tecnico_garantia':
    case 'descuento_garantia_tecnico':
      return Shield;
    default: return History;
  }
}

function coloresParaItem(item: ItemTimelineUnificado): {
  bg: string;
  text: string;
  border: string;
} {
  switch (item.origenUnificado) {
    case 'whatsapp_entrante':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' };
    case 'whatsapp_saliente':
      return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-100' };
    case 'fase':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' };
    case 'auditoria':
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100' };
  }
}

function tipoLabel(item: ItemTimelineUnificado): string {
  switch (item.origenUnificado) {
    case 'whatsapp_entrante': return 'WhatsApp del cliente';
    case 'whatsapp_saliente': return 'WhatsApp enviado';
    case 'fase': return 'Cambio de fase';
    case 'auditoria':
    default: return 'Auditoría';
  }
}

export default function TimelineUnificadoOrden({
  orden,
  max = 50,
  className = '',
  variant = 'page',
}: Props) {
  const [mensajes, setMensajes] = useState<
    Array<
      | (WhatsAppMensajeInbox & { _direccion: 'entrante' })
      | (WhatsAppMensajeOutbox & { _direccion: 'saliente' })
    >
  >([]);

  // Derivar wa_id desde el teléfono del cliente. normalizarTelefono devuelve
  // 10 dígitos RD; wa_id en whatsapp_mensajes_* también es 10 dígitos.
  const waId = useMemo(() => {
    if (!orden.clienteTelefono) return '';
    return normalizarTelefono(orden.clienteTelefono);
  }, [orden.clienteTelefono]);

  // Subscribe a los mensajes WhatsApp del cliente. Si no hay wa_id válido,
  // omitir la suscripción (timeline degrada a solo fases+auditoría).
  useEffect(() => {
    if (!waId) {
      setMensajes([]);
      return undefined;
    }
    const unsub = suscribirMensajes(waId, (msgs) => setMensajes(msgs));
    return () => unsub();
  }, [waId]);

  const items = useMemo(
    () =>
      construirTimelineUnificado(orden, mensajes, {
        max,
        nombreCliente: orden.clienteNombre,
      }),
    [orden, mensajes, max],
  );

  if (items.length === 0) {
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
          Actividad y línea de tiempo
        </h3>
        <p className="text-sm text-gray-400">Sin actividad registrada</p>
      </div>
    );
  }

  const compact = variant === 'modal';

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${
        compact ? 'p-4' : 'p-6'
      } ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase">
          <MessageSquare size={14} className="inline mr-1" />
          Actividad y línea de tiempo
        </h3>
        <span className="text-[10px] text-gray-400">{items.length} eventos</span>
      </div>
      <div className={`space-y-3 ${compact ? 'max-h-96 overflow-y-auto pr-1' : ''}`}>
        {items.map((item, i) => {
          const Icono = iconoParaItem(item);
          const colores = coloresParaItem(item);
          const isLast = i === items.length - 1;
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ${colores.bg} ${colores.border} border`}
                >
                  <Icono size={14} className={colores.text} />
                </div>
                {!isLast && <div className="w-0.5 flex-1 min-h-[1.25rem] bg-gray-200 mt-1" />}
              </div>
              <div className={`flex-1 pb-2 ${compact ? '' : 'pb-3'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-500">
                    {tipoLabel(item)}
                  </span>
                  <span
                    className="text-[10px] text-gray-400"
                    title={format(item.fecha, "d MMM yyyy HH:mm", { locale: es })}
                  >
                    {formatDistanceToNow(item.fecha, { locale: es, addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-gray-800 mt-0.5 break-words">
                  {item.descripcion}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {item.actorNombre}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
