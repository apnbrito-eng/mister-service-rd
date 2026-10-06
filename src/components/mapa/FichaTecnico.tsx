/**
 * FichaTecnico.tsx — avance del día + pendientes anteriores (SIN filtrar por
 * rango). Para cada pendiente se muestra motivo/pieza/antigüedad real tomando
 * `standby_piezas` cuando aplica. Reporta errores/cargando y permite refresh.
 */
import { ArrowLeft, Clock, AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import type { OrdenServicio, Personal, StandbyPieza } from '../../types';
import type { DiaTecnico } from '../../utils/mapaOperaciones';
import { hora12, textoEstado } from '../../utils/mapaOperaciones';
import { componentesRD } from '../../utils/mapaFechas';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fechaLargaRD = (d: Date) => {
  const c = componentesRD(d);
  return `${DIAS_SEMANA[c.diaSemana]} ${c.dia} de ${MESES[c.mes]}`;
};
const fechaCortaRD = (d: Date) => {
  const c = componentesRD(d);
  return `${c.dia} ${MESES[c.mes]}`;
};
const diasDesdeRD = (desde: Date, hasta: Date) => {
  const DIA = 86_400_000;
  // Reducimos a inicio de día en RD.
  const ini = componentesRD(desde);
  const fin = componentesRD(hasta);
  const a = Date.UTC(ini.anio, ini.mes, ini.dia);
  const b = Date.UTC(fin.anio, fin.mes, fin.dia);
  return Math.round((b - a) / DIA);
};

interface Props {
  tecnico: Personal;
  dia: DiaTecnico;
  ahora: Date;
  diaSeleccionado: Date;
  abiertosAnteriores: OrdenServicio[];
  cargandoAbiertos: boolean;
  errorAbiertos: string | null;
  standbyPorOrden: Map<string, StandbyPieza[]>;
  onRefrescarAbiertos: () => void;
  onCerrar: () => void;
  onAbrirCita: (ordenId: string) => void;
  onRepartirDia: () => void;
  onVerRuta: () => void;
}

export default function FichaTecnico({
  tecnico,
  dia,
  ahora,
  diaSeleccionado,
  abiertosAnteriores,
  cargandoAbiertos,
  errorAbiertos,
  standbyPorOrden,
  onRefrescarAbiertos,
  onCerrar,
  onAbrirCita,
  onRepartirDia,
  onVerRuta,
}: Props) {
  const avance = dia.total === 0 ? 0 : dia.hechas / dia.total;
  const colorBarra = dia.atrasado ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
          aria-label="Volver"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-gray-900">{tecnico.nombre}</div>
          <div className="truncate text-xs text-gray-500">
            {tecnico.operariaNombre ? `Equipo de ${tecnico.operariaNombre}` : 'Sin operaria'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <section>
          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">
            Avance de {fechaLargaRD(diaSeleccionado)}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-medium text-gray-900">{textoEstado(dia, ahora)}</div>
              <div className="text-xs text-gray-500">{dia.hechas} / {dia.total}</div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full ${colorBarra}`} style={{ width: `${Math.round(avance * 100)}%` }} />
            </div>
            {dia.atrasado && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                <AlertTriangle size={12} /> Va {dia.atrasoMin} min atrasado
              </div>
            )}
            {dia.libreDesde && (
              <div className="mt-1 text-xs text-gray-500">
                Fin estimado {hora12(dia.libreDesde)}
              </div>
            )}
            {dia.kmPendientes > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                Faltan ~{dia.kmPendientes} km · {dia.minPendientes} min ({dia.fuente})
              </div>
            )}
          </div>

          <ul className="mt-3 space-y-1" aria-label="Paradas del día">
            {dia.paradas.map((p, idx) => (
              <li key={p.cita.id}>
                <button
                  type="button"
                  onClick={() => onAbrirCita(p.cita.id)}
                  className="flex w-full min-h-[44px] items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-left hover:bg-gray-50"
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${
                      p.cita.progreso.garantia ? 'bg-red-600' : p.estado === 'hecha' ? 'bg-gray-400' : 'bg-brand-600'
                    }`}
                    aria-hidden="true"
                  >
                    {p.cita.progreso.garantia ? '!' : p.estado === 'hecha' ? '✓' : idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{p.cita.clienteNombre}</div>
                    <div className="truncate text-xs text-gray-500">
                      {hora12(p.cita.inicio)}
                      {p.enStandby && ' · en espera de piezas'}
                      {p.sinUbicacion && ' · sin ubicación'}
                      {p.tardeMin > 10 && ` · ${p.tardeMin} min tarde`}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-400" aria-hidden="true" />
                </button>
              </li>
            ))}
            {!dia.paradas.length && (
              <li className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
                Sin citas para {fechaLargaRD(diaSeleccionado)}.
              </li>
            )}
          </ul>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onVerRuta}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
            >
              Ver ruta
            </button>
            <button
              type="button"
              onClick={onRepartirDia}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Repartir su día
            </button>
          </div>
        </section>

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-gray-500">Pendientes anteriores</div>
            <button
              type="button"
              onClick={onRefrescarAbiertos}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50"
              aria-label="Refrescar pendientes anteriores"
            >
              <RefreshCw size={12} /> Refrescar
            </button>
          </div>
          {cargandoAbiertos && (
            <div className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">Cargando…</div>
          )}
          {errorAbiertos && (
            <div role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
              {errorAbiertos}
            </div>
          )}
          {!cargandoAbiertos && !errorAbiertos && abiertosAnteriores.length === 0 && (
            <div className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">Sin pendientes previos.</div>
          )}
          <ul className="space-y-1">
            {abiertosAnteriores.map((o) => {
              const dias = o.fechaCita ? diasDesdeRD(o.fechaCita, ahora) : null;
              const standby = standbyPorOrden.get(o.id) ?? [];
              const piezaStr = standby.length
                ? `Esperando: ${standby.map((s) => s.piezaFaltante).filter(Boolean).join(', ') || 'pieza'}`
                : null;
              const motivo = o.motivoChequeo || o.descripcionFalla || 'Sin motivo';
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onAbrirCita(o.id)}
                    className="flex w-full min-h-[44px] items-start gap-2 rounded-md border border-gray-100 bg-white px-2 py-1 text-left hover:bg-gray-50"
                  >
                    <Clock size={14} className="mt-0.5 text-gray-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">{o.clienteNombre}</div>
                      <div className="truncate text-xs text-gray-500">{motivo}</div>
                      {piezaStr && (
                        <div className="truncate text-[11px] text-amber-800">{piezaStr}</div>
                      )}
                      <div className="truncate text-xs text-gray-500">
                        {o.fechaCita ? fechaCortaRD(o.fechaCita) : 'Sin fecha'}
                        {dias !== null && dias >= 0 && ` · hace ${dias} día${dias === 1 ? '' : 's'}`}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
