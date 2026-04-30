import { Hourglass, CheckCircle2, XCircle } from 'lucide-react';
import type { SugerenciaSoloChequeo } from '../../types';
import { tiempoTranscurrido } from '../../utils';

interface Props {
  sugerencia: SugerenciaSoloChequeo;
  /** className extra para el contenedor (ej: márgenes específicos del padre). */
  className?: string;
}

/**
 * Banner visible al técnico que muestra el estado de la sugerencia más
 * reciente de "solo chequeo" en una orden.
 *
 * - pendiente → amarillo, "Esperando aprobación"
 * - aprobada  → verde, "Podés cerrar la orden ahora"
 * - rechazada → rojo, mostrando notaResolucion
 *
 * Usar junto a `obtenerUltimaSugerenciaSoloChequeo(orden)` que devuelve la
 * sugerencia a renderizar.
 */
export default function BannerEstadoSugerenciaSoloChequeo({ sugerencia, className }: Props) {
  const fecha = sugerencia.fechaSugerencia instanceof Date
    ? sugerencia.fechaSugerencia
    : sugerencia.fechaSugerencia.toDate?.() ?? new Date();

  if (sugerencia.estado === 'pendiente') {
    return (
      <div
        className={`bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 ${className || ''}`}
      >
        <Hourglass size={16} className="text-amber-700 mt-0.5 shrink-0" />
        <div className="flex-1 text-xs">
          <p className="font-semibold text-amber-900">
            Sugerencia de solo chequeo enviada a oficina ({tiempoTranscurrido(fecha)})
          </p>
          <p className="text-amber-800 mt-0.5">
            Esperando aprobación. Te llegará una notificación cuando se resuelva.
          </p>
          {sugerencia.motivo && (
            <p className="text-amber-700 mt-1 italic">"{sugerencia.motivo}"</p>
          )}
        </div>
      </div>
    );
  }

  if (sugerencia.estado === 'aprobada') {
    return (
      <div
        className={`bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2 ${className || ''}`}
      >
        <CheckCircle2 size={16} className="text-green-700 mt-0.5 shrink-0" />
        <div className="flex-1 text-xs">
          <p className="font-semibold text-green-900">
            Solo chequeo aprobado por oficina
          </p>
          <p className="text-green-800 mt-0.5">
            Podés cerrar la orden ahora. Monto del chequeo: RD${sugerencia.montoChequeo.toLocaleString('es-DO')}.
          </p>
          {sugerencia.notaResolucion && (
            <p className="text-green-700 mt-1 italic">"{sugerencia.notaResolucion}"</p>
          )}
        </div>
      </div>
    );
  }

  // rechazada
  return (
    <div
      className={`bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 ${className || ''}`}
    >
      <XCircle size={16} className="text-red-700 mt-0.5 shrink-0" />
      <div className="flex-1 text-xs">
        <p className="font-semibold text-red-900">
          Solo chequeo rechazado por oficina
        </p>
        {sugerencia.notaResolucion ? (
          <p className="text-red-800 mt-0.5">"{sugerencia.notaResolucion}"</p>
        ) : (
          <p className="text-red-800 mt-0.5">
            La oficina no aprobó esta sugerencia.
          </p>
        )}
        <p className="text-red-700 mt-1">
          Volvé al flujo normal de aprobación de precio para cerrar la orden.
        </p>
      </div>
    </div>
  );
}
