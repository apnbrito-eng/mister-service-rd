/**
 * VistaSemana.tsx — ocupación por técnico/día dentro del rango activo.
 *
 * Fuente real: `capacidadAgenda.construirMapa` (BASE). NO inventa cuotas 5/3/7:
 * usa las que trae `TecnicoAgenda.horasPorDia` desde `calendarios`. Si Jorge no
 * los configuró, el técnico aparece como «sin horario» (meta=0, trabaja=false)
 * y la celda queda gris sin inventar nada.
 *
 * Comparte filtros con el resto (equipo/técnico/rango). Click en celda abre
 * ficha del técnico y setea el día activo.
 */
import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Calendario, Personal } from '../../types';
import type { CitaMapa } from '../../utils/mapaOperaciones';
import { tecnicoDesdePersonal } from '../../utils/mapaAdaptadores';
import {
  calcularAvisos, construirMapa, type CeldaDia, type CitaFutura, type DiaSemana, type Nivel,
  type TecnicoAgenda,
} from '../../utils/capacidadAgenda';
import { componentesRD, fechaEnRD } from '../../utils/mapaFechas';
import { especialidadDe } from '../../utils/capacidadAgenda';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Props {
  desde: Date;
  hasta: Date;
  personal: Personal[];
  citas: CitaMapa[];
  calendarios: Calendario[];
  ahora: Date;
  onSeleccionarCelda: (tecnicoId: string, dia: Date) => void;
}

function diasEnRango(desde: Date, hasta: Date): Date[] {
  const DIA = 86_400_000;
  const ini = componentesRD(desde);
  const inicio = fechaEnRD(ini.anio, ini.mes, ini.dia);
  const fin = componentesRD(hasta);
  const finInc = fechaEnRD(fin.anio, fin.mes, fin.dia);
  const out: Date[] = [];
  for (let t = inicio.getTime(); t <= finInc.getTime(); t += DIA) {
    out.push(new Date(t));
  }
  return out;
}

const NIVEL_COLOR: Record<Nivel, string> = {
  no_trabaja: 'bg-gray-100 text-gray-400',
  vacio: 'bg-white text-gray-500',
  bajo: 'bg-sky-50 text-sky-800',
  casi: 'bg-amber-50 text-amber-900',
  meta: 'bg-emerald-50 text-emerald-900',
  lleno: 'bg-emerald-100 text-emerald-900',
  sobrecargado: 'bg-red-100 text-red-900',
};
const NIVEL_TEXTO: Record<Nivel, string> = {
  no_trabaja: 'Sin horario',
  vacio: 'Vacío',
  bajo: 'Bajo',
  casi: 'Casi lleno',
  meta: 'En meta',
  lleno: 'Lleno',
  sobrecargado: 'Sobrecargado',
};

function celdasForAvisos(tecnicos: TecnicoAgenda[], citas: CitaMapa[], dias: Date[]): CeldaDia[] {
  const citasAgenda: CitaFutura[] = citas.filter(c => !c.progreso.standby).map((c) => ({
    id: c.id,
    tecnicoId: c.tecnicoId ?? '',
    inicio: c.inicio,
    duracionMin: c.duracionMin,
    equipo: c.equipo,
    clienteNombre: c.clienteNombre,
    lat: c.lat,
    lng: c.lng,
  }));
  return construirMapa(tecnicos, citasAgenda, dias);
}

function tecnicoAgendaDesdePersonal(p: Personal, calendarios: Calendario[]): TecnicoAgenda {
  const mapa = tecnicoDesdePersonal(p);
  const horasPorDia: Partial<Record<DiaSemana, string[]>> = {};
  const propias = calendarios.filter((c) => c.activo && (c.asignadoId === (p.uid || p.id) || c.asignadoId === p.id));
  for (const cal of propias) {
    for (const d of cal.dias) {
      const previas = horasPorDia[d] ?? [];
      horasPorDia[d] = Array.from(new Set([...previas, ...cal.horas]));
    }
  }
  const esp = especialidadDe(p.especialidad) ?? null;
  return {
    id: p.uid || p.id,
    nombre: p.nombre,
    equipo: mapa.equipo ?? undefined,
    repara: esp ? [esp] : mapa.repara,
    soloMantenimiento: mapa.soloMantenimiento,
    contratista: mapa.contratista,
    horasPorDia,
  };
}

export default function VistaSemana({ desde, hasta, personal, citas, calendarios, ahora, onSeleccionarCelda }: Props) {
  const tecnicos = useMemo<TecnicoAgenda[]>(() => {
    return personal
      .filter((p) => p.rol === 'tecnico' && p.activo !== false)
      .map((p) => tecnicoAgendaDesdePersonal(p, calendarios));
  }, [personal, calendarios]);

  const dias = useMemo(() => diasEnRango(desde, hasta), [desde, hasta]);

  const avisos = useMemo(() => calcularAvisos(tecnicos, celdasForAvisos(tecnicos, citas, dias), ahora), [tecnicos, citas, dias, ahora]);

  const citasAgenda = useMemo<CitaFutura[]>(() => {
    return citas.filter(c => !c.progreso.standby).map((c) => ({
      id: c.id,
      tecnicoId: c.tecnicoId ?? '',
      inicio: c.inicio,
      duracionMin: c.duracionMin,
      equipo: c.equipo,
      clienteNombre: c.clienteNombre,
      lat: c.lat,
      lng: c.lng,
    }));
  }, [citas]);

  const celdas = useMemo<CeldaDia[]>(
    () => construirMapa(tecnicos, citasAgenda, dias),
    [tecnicos, citasAgenda, dias],
  );

  if (!dias.length) {
    return <div className="p-4 text-sm text-gray-600">Rango inválido.</div>;
  }
  if (!tecnicos.length) {
    return <div className="p-4 text-sm text-gray-600">Sin técnicos activos con calendarios configurados.</div>;
  }

  const etiquetaDia = (d: Date) => {
    const c = componentesRD(d);
    return `${DIAS_SEMANA[c.diaSemana]} ${c.dia}`;
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <p className="px-3 py-2 text-xs text-gray-500">Referencia según horarios configurados. Un espacio libre aún requiere comprobar duración y traslado. Las órdenes en espera de piezas siguen en la ficha del técnico.</p>
      {avisos.length > 0 && (
        <section className="border-b border-amber-100 bg-amber-50 p-2" aria-label="Avisos de la semana">
          <ul className="space-y-1 text-xs text-amber-900">
            {avisos.slice(0, 6).map((a, i) => (
              <li key={i} className="flex items-start gap-1">
                <AlertTriangle size={12} className="mt-0.5" aria-hidden="true" />
                <span className="flex-1">{a.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex-1 overflow-auto">
      <table className="min-w-full text-xs" role="grid" aria-label="Ocupación por técnico y día">
        <thead className="sticky top-0 z-10 bg-white">
          <tr>
            <th className="sticky left-0 z-20 border-b border-r border-gray-200 bg-white px-2 py-2 text-left font-semibold text-gray-700">
              Técnico
            </th>
            {dias.map((d) => (
              <th key={d.toISOString()} className="whitespace-nowrap border-b border-gray-200 bg-white px-2 py-2 text-center font-medium text-gray-600">
                {etiquetaDia(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tecnicos.map((t) => (
            <tr key={t.id}>
              <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-gray-200 bg-white px-2 py-1 text-left font-medium text-gray-800">
                {t.nombre}
              </th>
              {dias.map((d) => {
                // @safe-tecnicoid-id: t.id acá es `uid||id` canónico (ver `tecnicoAgendaDesdePersonal`),
                // comparamos contra el campo del `CeldaDia` que fue construido con esos mismos ids.
                const celda = celdas.find((c) => c.tecnicoId === t.id && c.fecha.getTime() === d.getTime());
                if (!celda) {
                  return (
                    <td key={d.toISOString()} className="border-b border-gray-100 p-1">
                      <div className="min-h-[44px] rounded-md bg-gray-50 px-2 py-1 text-[10px] text-gray-400">—</div>
                    </td>
                  );
                }
                const meta = celda.meta || 0;
                return (
                  <td key={d.toISOString()} className="border-b border-gray-100 p-1">
                    <button
                      type="button"
                      onClick={() => onSeleccionarCelda(t.id, d)}
                      className={`flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-md border border-gray-200 px-2 py-1 text-left ${NIVEL_COLOR[celda.nivel]}`}
                      aria-label={`${t.nombre} · ${etiquetaDia(d)}: ${NIVEL_TEXTO[celda.nivel]}`}
                    >
                      <span className="text-[11px] font-semibold">{celda.citas.length}{meta ? ` / ${meta}` : ''}</span>
                      <span className="text-[10px]">{NIVEL_TEXTO[celda.nivel]}</span>
                      {celda.horasChocadas.length > 0 && (
                        <span className="text-[10px] font-medium text-red-700">⚠ choque</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
