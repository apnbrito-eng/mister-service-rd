import { Calendar, Clock, Wrench, User } from 'lucide-react';
import { OrdenServicio, EstadoOrdenSimple } from '../../types';
import { estadoSimpleBorder, estadoSimpleColor, formatFecha, tiempoTranscurrido } from '../../utils';
import Badge from '../Badge';

interface OrdenCardProps {
  orden: OrdenServicio;
  onSelect: (orden: OrdenServicio) => void;
  onChangeEstado: (orden: OrdenServicio, nuevoEstado: EstadoOrdenSimple) => void;
}

export default function OrdenCard({ orden, onSelect, onChangeEstado }: OrdenCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${estadoSimpleBorder(orden.estadoSimple)} p-4 hover:shadow-md transition-shadow`}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Main content - clickable */}
        <div
          className="flex-1 cursor-pointer min-w-0"
          onClick={() => onSelect(orden)}
        >
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-sm font-bold text-[#0f3460]">
              {orden.numero || '#--'}
            </span>
            {orden.reagendada && (
              <Badge label="Reagendada" color="bg-amber-100 text-amber-700" />
            )}
            {orden.soloChequeo && (
              <Badge label="Solo chequeo" color="bg-yellow-100 text-yellow-800" />
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 truncate">
            {orden.equipoTipo} - {orden.clienteNombre}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
            {orden.fechaCita && (
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {formatFecha(orden.fechaCita)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {tiempoTranscurrido(orden.createdAt)}
            </span>
            {orden.tecnicoNombre && (
              <span className="flex items-center gap-1">
                <Wrench size={11} />
                {orden.tecnicoNombre}
              </span>
            )}
            {orden.responsableNombre && (
              <span className="flex items-center gap-1">
                <User size={11} />
                {orden.responsableNombre}
              </span>
            )}
          </div>
        </div>

        {/* Estado dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={orden.estadoSimple || 'pendiente'}
            onChange={(e) => onChangeEstado(orden, e.target.value as EstadoOrdenSimple)}
            onClick={(e) => e.stopPropagation()}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] cursor-pointer ${estadoSimpleColor(orden.estadoSimple || 'pendiente')}`}
          >
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En Proceso</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>
    </div>
  );
}
