import { Search } from 'lucide-react';
import { Personal, EstadoOrdenSimple } from '../../types';

interface OrdenFiltersProps {
  busqueda: string;
  setBusqueda: (v: string) => void;
  filtroMes: string;
  setFiltroMes: (v: string) => void;
  filtroTecnico: string;
  setFiltroTecnico: (v: string) => void;
  filtroEstado: string;
  setFiltroEstado: (v: string) => void;
  tecnicos: Personal[];
  ESTADOS_SIMPLE: EstadoOrdenSimple[];
}

export default function OrdenFilters({
  busqueda,
  setBusqueda,
  filtroMes,
  setFiltroMes,
  filtroTecnico,
  setFiltroTecnico,
  filtroEstado,
  setFiltroEstado,
  tecnicos,
}: OrdenFiltersProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 font-medium">Mes:</label>
        <input
          type="month"
          value={filtroMes}
          onChange={e => setFiltroMes(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
        />
      </div>
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Buscar nombre, #OS..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        />
      </div>
      <select
        value={filtroTecnico}
        onChange={e => setFiltroTecnico(e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
      >
        <option value="">Todos los tecnicos</option>
        {tecnicos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
      </select>
      <select
        value={filtroEstado}
        onChange={e => setFiltroEstado(e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] bg-white"
      >
        <option value="">Todos los estados</option>
        <option value="pendiente">Pendiente</option>
        <option value="en_proceso">En Proceso</option>
        <option value="completado">Completado</option>
        <option value="cancelado">Cancelado</option>
      </select>
    </div>
  );
}
