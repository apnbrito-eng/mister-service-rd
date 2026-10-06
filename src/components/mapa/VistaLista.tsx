/**
 * VistaLista.tsx — fallback usable con teclado solo. Cada ruta pertenece a UN
 * técnico y UN día — jamás mezcla días.
 *
 * UX: evitamos `button` anidado dentro de `button` (hallazgo QA #AX). La fila
 * de técnico queda como `button` principal; la acción «Ver ruta» aparece
 * aparte dentro de la cabecera, en su propia celda `button`.
 */
import type { Personal } from '../../types';
import type { CitaMapa } from '../../utils/mapaOperaciones';
import { hora12 } from '../../utils/mapaOperaciones';
import { componentesRD, fechaEnRD } from '../../utils/mapaFechas';
import type { RutaTecnicoDia } from './datosDerivados';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fechaLargaRD = (d: Date) => {
  const c = componentesRD(d);
  return `${DIAS_SEMANA[c.diaSemana]} ${c.dia} de ${MESES[c.mes]}`;
};

interface Props {
  rutas: RutaTecnicoDia[];
  personalPorId: Map<string, Personal>;
  onAbrirCita: (ordenId: string) => void;
  onAbrirRuta: (clave: string) => void;
  onAbrirTecnico: (tecnicoId: string, dia: string) => void;
  diaEtiquetaVacio?: string;
}

export default function VistaLista({ rutas, personalPorId, onAbrirCita, onAbrirRuta, onAbrirTecnico, diaEtiquetaVacio }: Props) {
  if (!rutas.length) {
    return (
      <div className="p-4 text-sm text-gray-600">
        {diaEtiquetaVacio
          ? `No hay citas para ${diaEtiquetaVacio}.`
          : 'No hay citas en el rango seleccionado.'}
      </div>
    );
  }

  const porDia = new Map<string, RutaTecnicoDia[]>();
  rutas.forEach((r) => {
    const l = porDia.get(r.dia);
    if (l) l.push(r);
    else porDia.set(r.dia, [r]);
  });

  const dias = [...porDia.keys()].sort();

  return (
    <div className="space-y-4 p-3">
      {dias.map((dia) => {
        const [anio, mes, diaNum] = dia.split('-').map((n) => Number(n));
        const d = anio && mes && diaNum ? fechaEnRD(anio, mes - 1, diaNum, 12) : new Date();
        const grupos = porDia.get(dia) ?? [];
        return (
          <section key={dia} aria-label={`Día ${dia}`}>
            <h3 className="mb-1 text-xs uppercase tracking-wide text-gray-500">
              {fechaLargaRD(d)}
            </h3>
            <ul className="space-y-2">
              {grupos.map((g) => {
                const tec = personalPorId.get(g.tecnicoId);
                return (
                  <li key={g.clave} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <header className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => onAbrirTecnico(g.tecnicoId, g.dia)}
                        className="flex min-h-[44px] flex-1 items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {tec?.nombre || g.tecnicoId || 'Sin asignar'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {g.citas.length} cita{g.citas.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onAbrirRuta(g.clave)}
                        className="min-h-[44px] shrink-0 border-l border-gray-200 px-3 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Ver ruta
                      </button>
                    </header>
                    <ol className="divide-y divide-gray-100">
                      {g.citas.map((c, i) => (
                        <ItemCita key={c.id} cita={c} idx={i + 1} onAbrir={onAbrirCita} />
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ItemCita({ cita, idx, onAbrir }: { cita: CitaMapa; idx: number; onAbrir: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir(cita.id)}
        className="flex w-full min-h-[44px] items-center gap-2 px-3 py-1 text-left hover:bg-gray-50"
      >
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${
            cita.progreso.garantia ? 'bg-red-600' : cita.progreso.completa ? 'bg-gray-400' : 'bg-brand-600'
          }`}
          aria-hidden="true"
        >
          {cita.progreso.completa ? '✓' : cita.progreso.garantia ? '!' : idx}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">{cita.clienteNombre}</div>
          <div className="truncate text-xs text-gray-500">
            {hora12(cita.inicio)}{cita.progreso.standby && ' · espera piezas'}
            {cita.equipo ? ` · ${cita.equipo}` : ''}
          </div>
        </div>
      </button>
    </li>
  );
}
