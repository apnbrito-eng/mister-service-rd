import { ArrowRight, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { OrdenServicio, Rol } from '../../types';
import { calcularSiguientePaso, classNamesPorTono } from '../../utils/siguientePaso';

interface Props {
  orden: OrdenServicio;
  /** Rol del usuario logueado (`userProfile.rol`). */
  rol: Rol | undefined;
  /**
   * Tamaño del banner. `sm` reduce padding y tamaño de texto — útil
   * dentro de cards densas como las de TecnicoVista. `md` es el
   * default y se usa en OrdenDetalle.
   */
  size?: 'sm' | 'md';
  /** className extra opcional para spacing en el contenedor padre. */
  className?: string;
}

/**
 * Banner contextual al rol del usuario y a la fase de la orden. Indica
 * el siguiente paso operativo a realizar (o la espera correspondiente).
 *
 * Es un componente puramente presentacional — toda la lógica de
 * decisión vive en `utils/siguientePaso.ts`. NO escribe a Firestore,
 * NO dispara navegación, solo informa.
 *
 * Si no hay siguiente paso útil para mostrar (rol no soportado, orden
 * cerrada/cancelada/eliminada), renderiza `null`.
 */
export default function BannerSiguientePaso({ orden, rol, size = 'md', className = '' }: Props) {
  const mensaje = calcularSiguientePaso(orden, rol);
  if (!mensaje) return null;

  const colores = classNamesPorTono(mensaje.tono);
  const Icono =
    mensaje.tono === 'accion' ? ArrowRight :
    mensaje.tono === 'espera' ? Clock :
    mensaje.tono === 'alerta' ? AlertCircle :
    CheckCircle2;

  const padding = size === 'sm' ? 'p-3' : 'p-4';
  const radius = size === 'sm' ? 'rounded-xl' : 'rounded-2xl';
  const tituloSize = size === 'sm' ? 'text-xs font-semibold' : 'text-sm font-semibold';
  const detalleSize = size === 'sm' ? 'text-[11px]' : 'text-xs';
  const iconSize = size === 'sm' ? 16 : 20;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${colores.contenedor} ${padding} ${radius} flex items-start gap-3 ${className}`}
    >
      <Icono size={iconSize} className={`${colores.icono} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className={`${tituloSize} ${colores.titulo}`}>
          {mensaje.titulo}
        </p>
        {mensaje.detalle && (
          <p className={`${detalleSize} ${colores.detalle} mt-0.5`}>
            {mensaje.detalle}
          </p>
        )}
      </div>
    </div>
  );
}
