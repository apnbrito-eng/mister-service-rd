/**
 * FiltrosClientesMapa.tsx — chips para filtrar la capa de clientes del mapa:
 * sector (según `sectorDe`), antigüedad (frío/activo/reciente/enfriando/sin
 * registro), garantía (campo cliente / origen marketing — ver `aplicaFiltrosCapa`).
 *
 * Fuentes reales existentes: `clientesFiltros.ts`, `mapaClientes.ts`,
 * `zonas.ts`. No se inventan métricas.
 */
import { useMemo } from 'react';
import { Flame, Snowflake, ShieldCheck, Search } from 'lucide-react';
import { ANTIGUEDAD, type Antiguedad } from '../../utils/mapaClientes';
import type { FiltrosCapaCliente } from './filtrosClienteModelo';

interface Props {
  filtros: FiltrosCapaCliente;
  setFiltros: (f: FiltrosCapaCliente) => void;
  cantidad: number;
  totalSinCoords: number;
}

export default function FiltrosClientesMapa({ filtros, setFiltros, cantidad, totalSinCoords }: Props) {
  // El selector de sector podría venir de la lista completa de sectores existentes.
  const sectoresDisponibles = useMemo(() => {
    // Nos limitamos a los más comunes de ZONAS_RD o `cliente.sector`. Para no
    // inventar, acá dejamos input libre con sugerencias dinámicas pequeñas.
    return [] as string[];
  }, []);

  const toggleAntig = (a: Antiguedad) => {
    const next = filtros.antiguedades.includes(a)
      ? filtros.antiguedades.filter((x) => x !== a)
      : [...filtros.antiguedades, a];
    setFiltros({ ...filtros, antiguedades: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white px-3 py-2 text-xs text-gray-700">
      <p className="w-full text-gray-500">Antigüedad según el historial importado. Consulta la ficha para ver las órdenes actuales.</p>
      <label className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2">
        <Search size={12} className="text-gray-400" aria-hidden="true" />
        <input
          type="search"
          value={filtros.busqueda}
          onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })}
          placeholder="Nombre, teléfono, dirección"
          className="min-h-[44px] border-none bg-transparent text-xs text-gray-900 outline-none"
          aria-label="Buscar cliente"
        />
      </label>
      <input
        type="text"
        value={filtros.sector ?? ''}
        onChange={(e) => setFiltros({ ...filtros, sector: e.target.value || null })}
        placeholder="Sector (ej: Naco)"
        list="filtros-sectores-mapa"
        className="min-h-[44px] rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-900"
        aria-label="Filtrar por sector"
      />
      <datalist id="filtros-sectores-mapa">
        {sectoresDisponibles.map((s) => <option key={s} value={s} />)}
      </datalist>
      <button
        type="button"
        onClick={() => toggleAntig('frio')}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 ${
          filtros.antiguedades.includes('frio') ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-gray-200 bg-white'
        }`}
        aria-pressed={filtros.antiguedades.includes('frio')}
      >
        <Snowflake size={12} aria-hidden="true" /> Fríos
      </button>
      <button
        type="button"
        onClick={() => toggleAntig('activo')}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 ${
          filtros.antiguedades.includes('activo') ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white'
        }`}
        aria-pressed={filtros.antiguedades.includes('activo')}
      >
        <Flame size={12} aria-hidden="true" /> Activos
      </button>
      <button
        type="button"
        onClick={() => setFiltros({ ...filtros, conGarantia: !filtros.conGarantia })}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 ${
          filtros.conGarantia ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 bg-white'
        }`}
        aria-pressed={filtros.conGarantia}
      >
        <ShieldCheck size={12} aria-hidden="true" /> Con historial
      </button>
      <span className="ml-auto text-[11px] text-gray-500">
        {cantidad} cliente{cantidad === 1 ? '' : 's'}
        {totalSinCoords > 0 ? ` · ${totalSinCoords} sin coords` : ''}
      </span>
      <div className="basis-full">
        <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-gray-500">
          {(['activo', 'reciente', 'enfriando', 'frio', 'sin_registro'] as Antiguedad[]).map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: ANTIGUEDAD[a].color }} aria-hidden="true" />
              {ANTIGUEDAD[a].etiqueta}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
