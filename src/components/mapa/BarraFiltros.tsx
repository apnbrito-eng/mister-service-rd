/**
 * BarraFiltros.tsx — rango Desde/Hasta en zona RD (`mapaFechas`), atajos
 * (Hoy/Mañana/Semana/Mes), selector equipo/técnico, modo (Mapa/Lista/Semana/Mes),
 * capas (Clientes/Vans/Satélite/Tráfico).
 *
 * UI 375 px: controles agrupados dentro de un botón «Filtros» expandible;
 * fechas en 2 columnas; cada control cumple min-height 44 px. En desktop
 * expone todo horizontal con los mismos botones.
 */
import { useMemo, useState } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Map, List as ListIcon,
  CalendarDays, Satellite, TrafficCone, UserCheck, SlidersHorizontal, CalendarRange, Users,
} from 'lucide-react';
import { ZONAS_RD, type Personal } from '../../types';
import {
  componentesRD, desplazarRangoRD, fechaEnRD, rangoAtajoRD,
} from '../../utils/mapaFechas';

export type ModoVista = 'mapa' | 'lista' | 'semana' | 'mes';
export type EquipoFiltro = 'todos' | 'A' | 'B';

export interface EstadoFiltros {
  /** Primer día del rango — se usa como 00:00 RD en el consumidor. */
  desde: Date;
  /** Último día del rango inclusivo — 00:00 RD. */
  hasta: Date;
  equipo: EquipoFiltro;
  tecnicoId: string;
  zona?: string;
  modo: ModoVista;
  capaClientes: boolean;
  capaGps: boolean;
  tipoMapa: 'mapa' | 'satelite';
  trafico: boolean;
}

interface Props {
  estado: EstadoFiltros;
  setEstado: (e: Partial<EstadoFiltros>) => void;
  tecnicos: Personal[];
  tecnicosEquipoA: Personal[];
  tecnicosEquipoB: Personal[];
  ahora: Date;
  rangoInvalido: boolean;
  onExpandir?: (abierto: boolean) => void;
}

function fmtInput(d: Date) {
  const c = componentesRD(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${c.anio}-${pad(c.mes + 1)}-${pad(c.dia)}`;
}

function parseInputFecha(valor: string): Date | null {
  if (!valor) return null;
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]) - 1;
  const dia = Number(m[3]);
  return fechaEnRD(anio, mes, dia);
}

export default function BarraFiltros({
  estado, setEstado, tecnicos, tecnicosEquipoA, tecnicosEquipoB, ahora, rangoInvalido, onExpandir,
}: Props) {
  const [abierto, setAbierto] = useState(false);

  const diffDias = useMemo(() => {
    const DIA = 86_400_000;
    const dIni = fechaEnRD(componentesRD(estado.desde).anio, componentesRD(estado.desde).mes, componentesRD(estado.desde).dia);
    const dFin = fechaEnRD(componentesRD(estado.hasta).anio, componentesRD(estado.hasta).mes, componentesRD(estado.hasta).dia);
    return Math.max(0, Math.round((dFin.getTime() - dIni.getTime()) / DIA)) + 1;
  }, [estado.desde, estado.hasta]);

  const atajo = (ini: Date, fin: Date) => setEstado({ desde: ini, hasta: fin });

  const desplazar = (dir: 1 | -1) => {
    const { desde, hasta } = desplazarRangoRD(estado.desde, estado.hasta, diffDias * dir);
    setEstado({ desde, hasta });
  };

  const tecnicosFiltrados = useMemo(() => {
    if (estado.equipo === 'A') return tecnicosEquipoA;
    if (estado.equipo === 'B') return tecnicosEquipoB;
    return tecnicos;
  }, [estado.equipo, tecnicos, tecnicosEquipoA, tecnicosEquipoB]);

  return (
    <div className="border-b border-gray-200 bg-white shadow-sm">
      {/* Fila principal: modos + atajos + botón de filtros */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Modo de vista">
          <button
            type="button"
            role="tab"
            aria-selected={estado.modo === 'mapa'}
            onClick={() => setEstado({ modo: 'mapa' })}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-3 text-sm font-medium ${
              estado.modo === 'mapa' ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Mapa"
          >
            <Map size={16} /><span className="hidden sm:inline">Mapa</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={estado.modo === 'lista'}
            onClick={() => setEstado({ modo: 'lista' })}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-3 text-sm font-medium ${
              estado.modo === 'lista' ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Lista"
          >
            <ListIcon size={16} /><span className="hidden sm:inline">Lista</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={estado.modo === 'semana'}
            onClick={() => setEstado({ modo: 'semana' })}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-3 text-sm font-medium ${
              estado.modo === 'semana' ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Semana"
          >
            <CalendarRange size={16} /><span className="hidden sm:inline">Semana</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={estado.modo === 'mes'}
            onClick={() => setEstado({ modo: 'mes' })}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-3 text-sm font-medium ${
              estado.modo === 'mes' ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Mes"
          >
            <CalendarDays size={16} /><span className="hidden sm:inline">Mes</span>
          </button>
        </div>

        {/* Atajos de rango */}
        <div className="flex flex-wrap gap-1">
          <button type="button" className="min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => { const r = rangoAtajoRD('hoy', ahora); atajo(r.desde, r.hasta); }}>Hoy</button>
          <button type="button" className="min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => { const r = rangoAtajoRD('manana', ahora); atajo(r.desde, r.hasta); }}>Mañana</button>
          <button type="button" className="hidden min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 sm:inline-flex" onClick={() => { const r = rangoAtajoRD('semana', ahora); atajo(r.desde, r.hasta); }}>Semana</button>
          <button type="button" className="hidden min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 sm:inline-flex" onClick={() => { const r = rangoAtajoRD('mes', ahora); atajo(r.desde, r.hasta); }}>Mes</button>
        </div>

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => { setAbierto(!abierto); onExpandir?.(!abierto); }}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            aria-expanded={abierto}
            aria-controls="mapa-filtros-detalle"
          >
            <SlidersHorizontal size={14} /> Filtros
          </button>
        </div>
      </div>

      {/* Zona expandible: fechas RD + equipo + técnico + capas */}
      {abierto && (
        <div id="mapa-filtros-detalle" className="space-y-3 border-t border-gray-100 px-3 py-2">
          {/* Fechas en 2 columnas */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><Calendar size={12} /> Desde (RD)</span>
              <input
                type="date"
                value={fmtInput(estado.desde)}
                onChange={(e) => { const d = parseInputFecha(e.target.value); if (d) setEstado({ desde: d }); }}
                className="min-h-[44px] rounded-md border border-gray-300 px-2 text-sm"
                aria-label="Fecha desde (zona Santo Domingo)"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><Calendar size={12} /> Hasta (RD)</span>
              <input
                type="date"
                value={fmtInput(estado.hasta)}
                onChange={(e) => { const d = parseInputFecha(e.target.value); if (d) setEstado({ hasta: d }); }}
                className="min-h-[44px] rounded-md border border-gray-300 px-2 text-sm"
                aria-label="Fecha hasta (zona Santo Domingo)"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => desplazar(-1)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700"
              aria-label="Rango anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-gray-500">{diffDias} día{diffDias === 1 ? '' : 's'}</span>
            <button
              type="button"
              onClick={() => desplazar(1)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700"
              aria-label="Rango siguiente"
            >
              <ChevronRight size={16} />
            </button>
            <div className="ml-auto flex flex-wrap gap-1 sm:hidden">
              <button type="button" className="min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => { const r = rangoAtajoRD('semana', ahora); atajo(r.desde, r.hasta); }}>Semana</button>
              <button type="button" className="min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => { const r = rangoAtajoRD('mes', ahora); atajo(r.desde, r.hasta); }}>Mes</button>
            </div>
          </div>
          {rangoInvalido && (
            <div role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-800">
              Rango inválido: Desde &gt; Hasta. Ajustá las fechas para ver datos.
            </div>
          )}

          {/* Equipo / técnico */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><Users size={12} /> Equipo</span>
              <select
                value={estado.equipo}
                onChange={(e) => setEstado({ equipo: e.target.value as EquipoFiltro, tecnicoId: '' })}
                className="min-h-[44px] rounded-md border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="A">Equipo A · Wila</option>
                <option value="B">Equipo B · Yohana</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><UserCheck size={12} /> Técnico</span>
              <select
                value={estado.tecnicoId}
                onChange={(e) => setEstado({ tecnicoId: e.target.value })}
                className="min-h-[44px] rounded-md border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="">Todos</option>
                {tecnicosFiltrados.map((t) => (
                  <option key={t.id} value={t.uid || t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Zona de citas
            <select aria-label="Zona de citas" value={estado.zona ?? ''} onChange={e => setEstado({ zona: e.target.value })} className="min-h-[44px] rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">Todas las zonas</option>
              {ZONAS_RD.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>

          {/* Capas */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEstado({ capaClientes: !estado.capaClientes })}
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 px-3 text-sm ${
                estado.capaClientes ? 'bg-emerald-50 text-emerald-800' : 'bg-white text-gray-700'
              }`}
              aria-pressed={estado.capaClientes}
            >
              <UserCheck size={14} /> Clientes
            </button>
            <button
              type="button"
              onClick={() => setEstado({ capaGps: !estado.capaGps })}
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 px-3 text-sm ${
                estado.capaGps ? 'bg-blue-50 text-blue-800' : 'bg-white text-gray-700'
              }`}
              aria-pressed={estado.capaGps}
            >
              Vans en vivo
            </button>
            <button
              type="button"
              onClick={() => setEstado({ tipoMapa: estado.tipoMapa === 'mapa' ? 'satelite' : 'mapa' })}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
              aria-pressed={estado.tipoMapa === 'satelite'}
            >
              <Satellite size={14} /> {estado.tipoMapa === 'satelite' ? 'Satélite' : 'Mapa'}
            </button>
            <button
              type="button"
              onClick={() => setEstado({ trafico: !estado.trafico })}
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border border-gray-200 px-3 text-sm ${
                estado.trafico ? 'bg-amber-50 text-amber-900' : 'bg-white text-gray-700'
              }`}
              aria-pressed={estado.trafico}
            >
              <TrafficCone size={14} /> Tráfico
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
