/**
 * BarraEstadoHoy.tsx — barra apilada con la distribución real de pasos del día.
 * Lee `progresoDelDia` ya calculado (helpers puros). Honesta: si el día no tiene
 * órdenes, muestra estado vacío explícito en vez de simular.
 */
import type { ProgresoDelDia } from '../../utils/operacionesPrioridad';
import { etiquetaPaso } from '../../utils/progresoOrden';

interface Props {
  progreso: ProgresoDelDia;
}

const PASOS: Array<{ i: number; etiqueta: string; clase: string }> = [
  { i: 0, etiqueta: etiquetaPaso(0), clase: 'bg-ms-accion-100 text-ms-accion' },
  { i: 1, etiqueta: etiquetaPaso(1), clase: 'bg-paso-0 text-ms-accion' },
  { i: 2, etiqueta: etiquetaPaso(2), clase: 'bg-paso-1 text-ms-accion' },
  { i: 3, etiqueta: etiquetaPaso(3), clase: 'bg-paso-3 text-white' },
  { i: 4, etiqueta: etiquetaPaso(4), clase: 'bg-paso-4 text-white' },
  { i: 5, etiqueta: etiquetaPaso(5), clase: 'bg-paso-5 text-white' },
  { i: 6, etiqueta: etiquetaPaso(6), clase: 'bg-ms-exito text-white' },
];

export default function BarraEstadoHoy({ progreso }: Props) {
  const total = progreso.total;
  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Sin órdenes agendadas en el rango seleccionado.
      </div>
    );
  }
  const bloques = PASOS.map((p) => ({ ...p, n: progreso.conteos[p.i] ?? 0 }));
  const totalBarra = bloques.reduce((s, b) => s + b.n, 0) + progreso.standby;

  return (
    <div className="space-y-3">
      <div className="flex h-9 overflow-hidden rounded-lg bg-slate-100" role="img" aria-label="Distribución del día">
        {bloques.map((b) => (
          <div
            key={b.i}
            className={`flex min-w-0 items-center justify-center text-xs font-semibold ${b.clase}`}
            style={{ flexGrow: b.n, flexBasis: 0 }}
            title={`${b.etiqueta}: ${b.n}`}
          >
            {b.n > 0 ? b.n : ''}
          </div>
        ))}
        {progreso.standby > 0 && (
          <div
            className="flex min-w-0 items-center justify-center ms-rayado-standby text-xs font-semibold text-slate-900"
            style={{ flexGrow: progreso.standby, flexBasis: 0 }}
            title={`Stand-by: ${progreso.standby}`}
          >
            {progreso.standby}
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {bloques.map((b) => (
          <li key={b.i} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${b.clase}`} aria-hidden />
            {b.etiqueta} <span className="font-semibold text-slate-900">{b.n}</span>
          </li>
        ))}
        {progreso.standby > 0 && (
          <li className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,#94a3b8_0_3px,#cbd5e1_3px_6px)]"
              aria-hidden
            />
            Stand-by <span className="font-semibold text-slate-900">{progreso.standby}</span>
          </li>
        )}
      </ul>
      <div className="text-xs text-slate-500">
        {totalBarra} orden{totalBarra === 1 ? '' : 'es'} en el rango · {progreso.cerradas} cerrada{progreso.cerradas === 1 ? '' : 's'}
      </div>
    </div>
  );
}
