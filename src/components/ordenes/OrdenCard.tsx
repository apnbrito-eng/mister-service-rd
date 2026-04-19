import { useState } from 'react';
import { Calendar, Clock, Wrench, User, XCircle } from 'lucide-react';
import { OrdenServicio, EstadoOrdenSimple, StandbyPieza } from '../../types';
import { estadoSimpleBorder, formatFecha, tiempoTranscurrido, tieneStandby } from '../../utils';
import Badge from '../Badge';
import EliminarOrdenButton from './EliminarOrdenButton';
import FaseStepper from './FaseStepper';
import CancelarOrdenModal from './CancelarOrdenModal';
import { useApp } from '../../context/AppContext';
import { puede } from '../../utils/permisos';

interface OrdenCardProps {
  orden: OrdenServicio;
  onSelect: (orden: OrdenServicio) => void;
  onChangeEstado: (orden: OrdenServicio, nuevoEstado: EstadoOrdenSimple) => void;
  standbyItems?: StandbyPieza[];
}

export default function OrdenCard({ orden, onSelect, standbyItems = [] }: OrdenCardProps) {
  const { userProfile } = useApp();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const puedeCancelar = puede(userProfile, 'ordenesModificar');
  const conStandby = tieneStandby(orden, standbyItems);
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
            {orden.eliminada && (
              <Badge label="Eliminada" color="bg-red-100 text-red-700" />
            )}
            {orden.fase === 'cancelado' && orden.motivoCancelacion && !orden.eliminada && (
              <span
                title={`Motivo: ${orden.motivoCancelacion}${orden.canceladaPor ? ` — ${orden.canceladaPor}` : ''}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 cursor-help"
              >
                Cancelada
              </span>
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
            {orden.operariaNombre && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">
                Op: {orden.operariaNombre.split(' ')[0]}
              </span>
            )}
          </div>
        </div>

        {/* Stepper compacto + cancelar + eliminar */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <FaseStepper orden={orden} size="sm" tienestandby={conStandby} />
          {puedeCancelar && !orden.eliminada && orden.fase !== 'cancelado' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowCancelModal(true); }}
              title="Cancelar orden"
              className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 transition-colors"
            >
              <XCircle size={13} />
            </button>
          )}
          <EliminarOrdenButton orden={orden} variant="icon" size="sm" />
        </div>
      </div>
      <CancelarOrdenModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        orden={orden}
        userProfile={userProfile}
      />
    </div>
  );
}
