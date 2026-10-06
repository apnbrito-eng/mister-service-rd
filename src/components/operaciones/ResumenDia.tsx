/**
 * ResumenDia.tsx — 6 tarjetas KPI operativas del Centro de Operaciones.
 * Los reportes financieros permanecen en su módulo existente.
 * Las cifras describen estados registrados de las citas seleccionadas.
 */
import type { ResumenOperaciones } from '../../utils/operacionesPrioridad';

interface Props {
  resumen: ResumenOperaciones;
}

interface Kpi {
  label: string;
  valor: string;
  nota: string;
  tono?: 'ok' | 'warn' | 'alert';
}

function tonoClases(tono: Kpi['tono']): string {
  if (tono === 'alert') return 'text-rose-700';
  if (tono === 'warn') return 'text-amber-700';
  return 'text-slate-900';
}

export default function ResumenDia({ resumen }: Props) {
  const kpis: Kpi[] = [
    {
      label: 'Con actividad registrada',
      valor: `${resumen.tecnicosActivos - resumen.libres}/${resumen.tecnicosActivos}`,
      nota: `${resumen.enCamino} en camino · ${resumen.libres} sin actividad registrada`,
    },
    {
      label: 'Órdenes cerradas',
      valor: `${resumen.cerradas}/${resumen.totalDelDia}`,
      nota:
        resumen.totalDelDia === 0
          ? 'Sin órdenes agendadas en el rango'
          : `${resumen.pendientesCierre} pendientes de cierre`,
    },
    {
      label: 'Atrasadas',
      valor: `${resumen.atrasadas}`,
      nota:
        resumen.atrasadas === 0
          ? 'Sin atrasos calculables'
          : `mayor +${resumen.mayorAtrasoMin} min`,
      tono: resumen.atrasadas > 0 ? 'warn' : 'ok',
    },
    {
      label: 'Stand-by',
      valor: `${resumen.standby}`,
      nota: resumen.standby === 0 ? 'Sin esperas registradas' : 'en espera',
    },
    {
      label: 'Garantías abiertas',
      valor: `${resumen.garantiasAbiertas}`,
      nota: resumen.garantiasAbiertas === 0 ? 'Sin garantías pendientes' : 'servicios de garantía',
      tono: resumen.garantiasAbiertas > 0 ? 'alert' : 'ok',
    },
    {
      label: 'En sitio',
      valor: `${resumen.enSitio}`,
      nota: `${resumen.enCamino} en camino registrados`,
    },
  ];

  return (
    <section
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 md:grid-cols-3 xl:grid-cols-6"
      aria-label="Resumen del día"
    >
      {kpis.map((k) => (
        <div key={k.label} className="min-w-0 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">{k.label}</div>
          <div
            className={`mt-1 text-2xl font-bold leading-tight tabular-nums tracking-tight ${tonoClases(k.tono)}`}
          >
            {k.valor}
          </div>
          <div className="text-xs text-slate-500">{k.nota}</div>
        </div>
      ))}
    </section>
  );
}
