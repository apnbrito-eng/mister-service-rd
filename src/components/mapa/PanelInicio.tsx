/**
 * PanelInicio.tsx — vista «inicio» del panel lateral: Requiere atención + lista de técnicos.
 * Nombre del cliente SIEMPRE primero (regla QA review #18, DiaTecnico fix).
 */
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { Personal } from '../../types';
import type { DiaTecnico, SugerenciaMover, Senal } from '../../utils/mapaOperaciones';
import { hora12, textoEstado } from '../../utils/mapaOperaciones';
import { componentesRD, diaEsHoyRD } from '../../utils/mapaFechas';

interface ResumenTecnico {
  tecnico: Personal;
  dia: DiaTecnico;
  senal: Senal;
  minSinSenal: number | null;
}

interface Props {
  ahora: Date;
  /** Día cuya proyección mostramos; el panel adapta el label «Sin citas …» al día activo. */
  diaActivo: Date;
  resumenes: ResumenTecnico[];
  sugerencias: SugerenciaMover[];
  onSeleccionarTecnico: (tecnicoId: string) => void;
  onReasignarSugerencia: (s: SugerenciaMover) => void;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function etiquetaDia(d: Date, ahora: Date): string {
  if (diaEsHoyRD(d, ahora)) return 'hoy';
  const c = componentesRD(d);
  const h = componentesRD(ahora);
  const esManana = new Date(d.getTime() - 86_400_000);
  const ec = componentesRD(esManana);
  if (ec.anio === h.anio && ec.mes === h.mes && ec.dia === h.dia) return 'mañana';
  return `${DIAS[c.diaSemana]} ${c.dia} ${MESES[c.mes]}`;
}

function textoEstadoParaDia(d: DiaTecnico, ahora: Date, diaActivo: Date): string {
  const base = textoEstado(d, ahora);
  if (d.estado === 'sin_citas') return `Sin citas ${etiquetaDia(diaActivo, ahora)}`;
  if (d.estado === 'termino' && !diaEsHoyRD(diaActivo, ahora)) return `Terminó su día de ${etiquetaDia(diaActivo, ahora)}`;
  return base;
}

const colorSenal: Record<Senal, string> = {
  ok: 'bg-emerald-500',
  vieja: 'bg-amber-500',
  perdida: 'bg-red-500',
  sin_gps: 'bg-gray-300',
};

export default function PanelInicio({ ahora, diaActivo, resumenes, sugerencias, onSeleccionarTecnico, onReasignarSugerencia }: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {sugerencias.length > 0 && (
        <section className="border-b border-amber-100 bg-amber-50 p-3">
          <div className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
            <AlertTriangle size={14} /> Requiere atención
          </div>
          <ul className="space-y-2">
            {sugerencias.map((s, i) => (
              <li key={`${s.cita.id}:${i}`} className="rounded-md border border-amber-200 bg-white p-2 text-sm">
                <div className="text-sm font-medium text-gray-900">{s.cita.clienteNombre}</div>
                <div className="text-xs text-gray-600">{s.texto}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onReasignarSugerencia(s)}
                    className="min-h-[44px] rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    Pasar a {s.a.nombre}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex-1 p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Técnicos</div>
        <ul className="space-y-2" aria-label="Técnicos activos">
          {resumenes.map(({ tecnico, dia, senal, minSinSenal }) => {
            const avance = dia.total === 0 ? 0 : dia.hechas / dia.total;
            return (
              <li key={tecnico.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionarTecnico(tecnico.uid || tecnico.id)}
                  className="flex w-full min-h-[44px] items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left hover:bg-gray-50"
                >
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: tecnico.color || '#0f3460' }}
                  >
                    {(tecnico.nombre || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {tecnico.nombre}
                      <span className={`ml-2 inline-block h-2 w-2 rounded-full ${colorSenal[senal]}`} title={`Señal GPS: ${senal}`} />
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {textoEstadoParaDia(dia, ahora, diaActivo)}
                      {diaEsHoyRD(diaActivo, ahora) && senal !== 'ok' && minSinSenal !== null && ` · señal ${senal} hace ${minSinSenal} min`}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full ${dia.atrasado ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.round(avance * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">{dia.hechas}/{dia.total}</span>
                    </div>
                    {dia.proxima?.sale && dia.estado === 'por_salir' && (
                      <div className="text-[11px] text-gray-500">Sale {hora12(dia.proxima.sale)}</div>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              </li>
            );
          })}
          {!resumenes.length && (
            <li className="rounded-md bg-gray-50 px-2 py-2 text-xs text-gray-600">
              Sin técnicos con citas en el rango.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
