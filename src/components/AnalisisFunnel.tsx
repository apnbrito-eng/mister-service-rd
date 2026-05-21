import { useMemo } from 'react';
import { TrendingDown } from 'lucide-react';
import type { OrdenServicio, FaseOrden } from '../types';
import { FASES_ORDENADAS, faseLabel } from '../utils';

interface Props {
  ordenes: OrdenServicio[];
  /** Filtra órdenes a las que entraron en una de sus fases en este rango.
   *  Si undefined, considera todas las órdenes. */
  rangoFecha?: { inicio: Date; fin: Date };
  className?: string;
}

/**
 * Item de la fila del embudo (SPRINT-FUNNEL-CONVERSION-FASES, 2026-05-21).
 */
interface FilaFunnel {
  fase: FaseOrden;
  /** Cuántas órdenes únicas pasaron por esta fase (alguna vez). */
  pasaronPor: number;
  /** Cuántas órdenes están ACTUALMENTE en esta fase (snapshot). */
  enFase: number;
  /** % de conversión respecto a la fase anterior del embudo. */
  pctVsAnterior: number;
  /** Tiempo promedio que las órdenes que LLEGARON a la fase siguiente
   *  pasaron en esta fase (en horas). 0 si no hay datos. */
  horasPromedio: number;
}

function aDate(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object' && valor !== null && 'toDate' in valor) {
    try { return (valor as { toDate: () => Date }).toDate(); } catch { return null; }
  }
  return null;
}

function dentroDeRango(d: Date | null, rango?: { inicio: Date; fin: Date }): boolean {
  if (!rango) return true;
  if (!d) return false;
  return d >= rango.inicio && d <= rango.fin;
}

/**
 * Construye el embudo de conversión a partir de `historialFases[]` de cada
 * orden. Para cada `FASES_ORDENADAS[i]`:
 *  - `pasaronPor` = cantidad de órdenes únicas cuyo historialFases incluyó
 *    esa fase en algún momento (dentro del rango si está set).
 *  - `enFase` = cantidad de órdenes cuyo `fase` actual === la fase del row.
 *  - `pctVsAnterior` = pasaronPor[i] / pasaronPor[i-1] * 100. 100% para
 *    el primer row.
 *  - `horasPromedio` = promedio de (timestamp(siguiente) - timestamp(actual))
 *    para las órdenes que avanzaron de fase[i] a fase[i+1].
 *
 * Diseño:
 *  - Lectura pura sobre array client-side. Sin query Firestore.
 *  - Sin índice compuesto. Sin orderBy.
 *  - Excluye órdenes con `eliminada === true` del cálculo.
 *  - Las fases `cancelado` y `garantia_reclamada` NO están en FASES_ORDENADAS;
 *    no aparecen en el embudo (corresponden a otros sub-flujos).
 */
function calcularFunnel(
  ordenes: OrdenServicio[],
  rango?: { inicio: Date; fin: Date },
): FilaFunnel[] {
  const ordenesValidas = ordenes.filter(o => !o.eliminada);

  const filas: FilaFunnel[] = FASES_ORDENADAS.map((fase) => ({
    fase,
    pasaronPor: 0,
    enFase: 0,
    pctVsAnterior: 0,
    horasPromedio: 0,
  }));

  // Para calcular promedios, acumulamos suma + count por fase.
  const acumTiempos: Record<FaseOrden, { sumaHoras: number; count: number }> = {} as Record<FaseOrden, { sumaHoras: number; count: number }>;
  FASES_ORDENADAS.forEach((f) => { acumTiempos[f] = { sumaHoras: 0, count: 0 }; });

  for (const orden of ordenesValidas) {
    const historial = orden.historialFases || [];
    // Set de fases por las que pasó esta orden (única por orden).
    const fasesUnicas = new Set<FaseOrden>();
    for (const h of historial) {
      const f = h.fase as FaseOrden;
      if (FASES_ORDENADAS.includes(f)) {
        // Si hay rango, solo contar si el timestamp cae dentro.
        const ts = aDate(h.timestamp);
        if (dentroDeRango(ts, rango)) {
          fasesUnicas.add(f);
        }
      }
    }

    // Acumular pasaronPor
    for (const f of fasesUnicas) {
      const fila = filas.find(r => r.fase === f);
      if (fila) fila.pasaronPor += 1;
    }

    // Snapshot: orden actualmente en cada fase
    if (FASES_ORDENADAS.includes(orden.fase as FaseOrden)) {
      const fila = filas.find(r => r.fase === orden.fase);
      if (fila) fila.enFase += 1;
    }

    // Tiempo en cada fase: para las órdenes que avanzaron, calcular delta.
    // Iteramos historial en orden cronológico (asumimos viene así; sino
    // sortear). Cada par consecutivo (h[i], h[i+1]) → h[i].fase duró
    // (timestamp[i+1] - timestamp[i]).
    const historialOrdenado = [...historial].sort((a, b) => {
      const ta = aDate(a.timestamp)?.getTime() ?? 0;
      const tb = aDate(b.timestamp)?.getTime() ?? 0;
      return ta - tb;
    });
    for (let i = 0; i < historialOrdenado.length - 1; i++) {
      const actual = historialOrdenado[i];
      const siguiente = historialOrdenado[i + 1];
      const faseActual = actual.fase as FaseOrden;
      if (!FASES_ORDENADAS.includes(faseActual)) continue;
      const tActual = aDate(actual.timestamp);
      const tSig = aDate(siguiente.timestamp);
      if (!tActual || !tSig) continue;
      // Si hay rango, solo contar si el periodo cae dentro.
      if (!dentroDeRango(tActual, rango)) continue;
      const horas = (tSig.getTime() - tActual.getTime()) / (1000 * 60 * 60);
      if (horas < 0) continue; // datos corruptos
      acumTiempos[faseActual].sumaHoras += horas;
      acumTiempos[faseActual].count += 1;
    }
  }

  // Calcular horasPromedio
  for (const fila of filas) {
    const acum = acumTiempos[fila.fase];
    fila.horasPromedio = acum.count > 0 ? acum.sumaHoras / acum.count : 0;
  }

  // Calcular pctVsAnterior
  filas[0].pctVsAnterior = 100;
  for (let i = 1; i < filas.length; i++) {
    const prev = filas[i - 1].pasaronPor;
    filas[i].pctVsAnterior = prev > 0 ? (filas[i].pasaronPor / prev) * 100 : 0;
  }

  return filas;
}

function formatHoras(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)}m`;
  if (horas < 24) return `${horas.toFixed(1)}h`;
  const dias = horas / 24;
  return `${dias.toFixed(1)}d`;
}

export default function AnalisisFunnel({ ordenes, rangoFecha, className = '' }: Props) {
  const filas = useMemo(
    () => calcularFunnel(ordenes, rangoFecha),
    [ordenes, rangoFecha],
  );

  const maxPasaron = filas.length > 0 ? Math.max(...filas.map(f => f.pasaronPor)) : 0;
  const totalCerrado = filas.find(f => f.fase === 'cerrado')?.pasaronPor ?? 0;
  const totalNuevoLead = filas[0]?.pasaronPor ?? 0;
  const conversionGlobal = totalNuevoLead > 0 ? (totalCerrado / totalNuevoLead) * 100 : 0;

  if (maxPasaron === 0) {
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
          <TrendingDown size={14} className="inline mr-1" />
          Embudo de conversión por fase
        </h3>
        <p className="text-sm text-gray-400">
          Sin órdenes con historial de fases en este período.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase">
          <TrendingDown size={14} className="inline mr-1" />
          Embudo de conversión por fase
        </h3>
        <span className="text-xs text-gray-500">
          Conversión global lead → cerrado:{' '}
          <span className="font-semibold text-gray-800">
            {conversionGlobal.toFixed(1)}%
          </span>
        </span>
      </div>

      <div className="space-y-2">
        {filas.map((fila, i) => {
          const widthPct = maxPasaron > 0 ? (fila.pasaronPor / maxPasaron) * 100 : 0;
          const isFirst = i === 0;
          return (
            <div key={fila.fase} className="space-y-1">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium text-gray-700 min-w-[140px]">
                  {faseLabel(fila.fase)}
                </span>
                <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                  <span title="Órdenes que pasaron por esta fase">
                    <span className="font-semibold text-gray-800">{fila.pasaronPor}</span>{' '}
                    pasaron
                  </span>
                  <span title="Órdenes ACTUALMENTE en esta fase">
                    · <span className="font-semibold text-blue-700">{fila.enFase}</span>{' '}
                    en fase
                  </span>
                  {!isFirst && (
                    <span title="Conversión respecto a la fase anterior">
                      ·{' '}
                      <span
                        className={`font-semibold ${
                          fila.pctVsAnterior >= 70
                            ? 'text-emerald-700'
                            : fila.pctVsAnterior >= 40
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {fila.pctVsAnterior.toFixed(0)}%
                      </span>{' '}
                      vs anterior
                    </span>
                  )}
                  {fila.horasPromedio > 0 && (
                    <span title="Tiempo promedio que las órdenes que avanzaron pasaron en esta fase">
                      · <span className="font-semibold text-gray-600">{formatHoras(fila.horasPromedio)}</span>{' '}
                      promedio
                    </span>
                  )}
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${widthPct}%` }}
                  aria-label={`${fila.pasaronPor} órdenes en ${faseLabel(fila.fase)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 mt-4">
        Calculado client-side a partir de <code>historialFases[]</code>. Las
        fases <em>cancelado</em> y <em>garantía reclamada</em> son sub-flujos
        laterales y no aparecen en el embudo.
      </p>
    </div>
  );
}
