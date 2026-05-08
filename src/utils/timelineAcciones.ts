import type { OrdenServicio, HistorialFase, RegistroAuditoria, AccionAuditoria, FaseOrden } from '../types';
import { faseLabel } from './index';

/**
 * Item normalizado del timeline visual al pie de OrdenDetalle.
 * Mezcla `historialFases` (cambios de fase) y `auditoria` (acciones libres
 * sobre la orden) en una sola línea de tiempo ordenada cronológicamente.
 */
export interface ItemTimeline {
  /**
   * Discriminador de origen — útil para que el componente elija icono.
   *  - `fase`: vino de `historialFases[]`.
   *  - `auditoria`: vino de `auditoria[]`.
   */
  origen: 'fase' | 'auditoria';
  /** Tipo específico de acción cuando viene de auditoría. */
  accion?: AccionAuditoria;
  /** Cuando viene de fase, la fase nueva (ya etiquetada para humanos). */
  fase?: FaseOrden | 'reactivada_post_chequeo';
  /** Frase corta legible para el usuario. */
  descripcion: string;
  /** Nombre del actor humano. Fallback "Sistema" si no se conoce. */
  actorNombre: string;
  /** Fecha del evento — puede ser parsed Date o Date directo según shape. */
  fecha: Date;
}

/**
 * Parser tolerante a shapes legacy. Algunas órdenes viejas tienen
 * `historialFases[].timestamp` como objeto Firestore Timestamp aún
 * después del fetch, otras como Date instanciado. Mismo problema con
 * `auditoria[].fecha`. Devolvemos null si no se puede interpretar.
 */
function aDate(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  // Firestore Timestamp: tiene método toDate()
  if (typeof valor === 'object' && valor !== null && 'toDate' in valor) {
    const ts = valor as { toDate: () => Date };
    try { return ts.toDate(); } catch { return null; }
  }
  if (typeof valor === 'string' || typeof valor === 'number') {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function describirFase(h: HistorialFase): string {
  const etiqueta = h.fase === 'reactivada_post_chequeo'
    ? 'Reactivada post-chequeo'
    : faseLabel(h.fase as FaseOrden);
  return h.nota ? `${etiqueta} — ${h.nota}` : etiqueta;
}

function describirAuditoria(r: RegistroAuditoria): string {
  if (r.detalle) return r.detalle;
  // Fallback: mostrar la acción capitalizada y el campo si existe.
  const accion = r.accion.replace(/_/g, ' ');
  if (r.campo) return `${accion} (${r.campo})`;
  return accion;
}

/**
 * Devuelve las últimas N acciones de una orden, ordenadas de más reciente
 * a más vieja. Mezcla `historialFases` y `auditoria` para evitar que el
 * usuario tenga que abrir varios modales para reconstruir el historial.
 *
 * Decisiones:
 *  - Si la orden tiene <2 entradas totales, devuelve [] — el caller decide
 *    no renderizar (evita pollution visual en órdenes recién creadas).
 *  - Items con fecha no parseable se descartan en silencio (no rompen).
 *  - Sin escrituras a Firestore. Lectura pura.
 */
export function obtenerTimelineAcciones(
  orden: Pick<OrdenServicio, 'historialFases' | 'auditoria'>,
  max = 5,
): ItemTimeline[] {
  const items: ItemTimeline[] = [];

  for (const h of orden.historialFases || []) {
    const fecha = aDate(h.timestamp);
    if (!fecha) continue;
    items.push({
      origen: 'fase',
      fase: h.fase,
      descripcion: describirFase(h),
      actorNombre: h.usuario || 'Sistema',
      fecha,
    });
  }

  for (const r of orden.auditoria || []) {
    const fecha = aDate(r.fecha);
    if (!fecha) continue;
    items.push({
      origen: 'auditoria',
      accion: r.accion,
      descripcion: describirAuditoria(r),
      actorNombre: r.usuario || 'Sistema',
      fecha,
    });
  }

  // Si hay menos de 2 acciones registradas, devolver [] para que el caller
  // no renderice el timeline (evita pollution visual en órdenes nuevas).
  if (items.length < 2) return [];

  items.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return items.slice(0, max);
}
