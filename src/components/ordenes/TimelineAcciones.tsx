import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowRight, Edit3, Trash2, Plus, Check, FileText, Camera,
  Pause, RotateCcw, Shield, History,
} from 'lucide-react';
import type { ItemTimeline } from '../../utils/timelineAcciones';
import { obtenerTimelineAcciones } from '../../utils/timelineAcciones';
import type { OrdenServicio } from '../../types';

interface Props {
  orden: Pick<OrdenServicio, 'historialFases' | 'auditoria'>;
  /** Máximo de items a mostrar. Default 5. */
  max?: number;
  className?: string;
}

/**
 * Devuelve el icono apropiado para un item de timeline.
 * Mantenemos el mapa local al componente (no en el helper puro) porque
 * los iconos son detalle de presentación.
 */
function iconoParaItem(item: ItemTimeline) {
  if (item.origen === 'fase') return ArrowRight;
  switch (item.accion) {
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

/**
 * Timeline visual horizontal (responsive a vertical en pantallas chicas)
 * con las últimas N acciones registradas en una orden. Solo lectura.
 *
 * Sub-regla: el componente se auto-oculta cuando la orden tiene <2
 * acciones registradas (helper devuelve []), para evitar pollution
 * visual en órdenes recién creadas.
 */
export default function TimelineAcciones({ orden, max = 5, className = '' }: Props) {
  const items = obtenerTimelineAcciones(orden, max);
  if (items.length === 0) return null;

  return (
    <section
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}
      aria-label="Últimas acciones de la orden"
    >
      <div className="flex items-center gap-2 mb-3">
        <History size={16} className="text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">Últimas acciones</h3>
      </div>

      {/* Mobile / pantallas chicas: vertical compacto. md+: horizontal con scroll-x si overflow. */}
      <ol className="flex flex-col gap-3 md:flex-row md:gap-2 md:overflow-x-auto md:pb-2">
        {items.map((item, idx) => {
          const Icono = iconoParaItem(item);
          const fechaRel = formatDistanceToNow(item.fecha, { locale: es, addSuffix: true });
          const fechaAbs = format(item.fecha, "yyyy-MM-dd HH:mm");
          return (
            <li
              key={idx}
              title={fechaAbs}
              className="flex md:flex-col items-start gap-2 md:gap-1.5 md:min-w-[180px] md:max-w-[220px] p-2.5 rounded-lg bg-gray-50 border border-gray-100"
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-200 shrink-0">
                <Icono size={14} className="text-gray-600" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {item.descripcion}
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {item.actorNombre}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {fechaRel}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
