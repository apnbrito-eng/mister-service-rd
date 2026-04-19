import { useState } from 'react';
import { Phone, MessageCircle, MapPin, Edit2, AlertTriangle, XCircle, Package } from 'lucide-react';
import { OrdenServicio, Usuario, StandbyPieza } from '../../types';
import {
  formatFecha, formatTelefono, whatsappLink,
  estadoSimpleLabel, estadoSimpleColor, tiempoTranscurrido, tieneStandby,
} from '../../utils';
import { puede } from '../../utils/permisos';
import Badge from '../Badge';
import EliminarOrdenButton from './EliminarOrdenButton';
import FaseStepper from './FaseStepper';
import CancelarOrdenModal from './CancelarOrdenModal';
import ReagendarModal from './ReagendarModal';

interface OrdenDetailModalProps {
  orden: OrdenServicio;
  userProfile: Usuario | null;
  onEdit: () => void;
  onEliminar?: () => void;
  onAprobarPrecio: () => void;
  precioAprobacion: string;
  setPrecioAprobacion: (v: string) => void;
  aprobandoPrecio: boolean;
  standbyItems?: StandbyPieza[];
}

export default function OrdenDetailModal({
  orden,
  userProfile,
  onEdit,
  onEliminar,
  onAprobarPrecio,
  precioAprobacion,
  setPrecioAprobacion,
  aprobandoPrecio,
  standbyItems = [],
}: OrdenDetailModalProps) {
  const puedeModificar = puede(userProfile, 'ordenesModificar');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReagendarModal, setShowReagendarModal] = useState(false);
  const conStandby = tieneStandby(orden, standbyItems);
  const tienePiezaPendiente = standbyItems.some(s => s.ordenId === orden.id && s.estado !== 'llego');
  const mostrarBannerReagendar = orden.fase === 'aprobado' && tienePiezaPendiente && !orden.eliminada;
  return (
    <div className="space-y-6">
      {/* Banner si está eliminada */}
      {orden.eliminada && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 flex items-start gap-2 text-sm text-red-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Orden eliminada</p>
            {orden.motivoEliminacion && <p className="text-xs mt-0.5">Motivo: {orden.motivoEliminacion}</p>}
            {orden.eliminadaPor && (
              <p className="text-xs text-red-700 mt-0.5">
                Por {orden.eliminadaPor}{orden.fechaEliminacion ? ` · ${formatFecha(orden.fechaEliminacion)}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner si está cancelada (independiente del banner de eliminada) */}
      {orden.fase === 'cancelado' && !orden.eliminada && orden.motivoCancelacion && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-start gap-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Orden cancelada</p>
            <p className="text-xs mt-0.5">Motivo: {orden.motivoCancelacion}</p>
            {orden.canceladaPor && (
              <p className="text-xs text-amber-700 mt-0.5">
                Por {orden.canceladaPor}{orden.fechaCancelacion ? ` · ${formatFecha(orden.fechaCancelacion)}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner pieza pendiente — sugiere reagendar */}
      {mostrarBannerReagendar && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-3">
          <Package size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900 text-sm">Pieza pendiente de llegada</p>
            <p className="text-xs text-amber-800">
              Esta orden está aprobada pero tiene piezas en stand-by. Puedes reagendar para cuando llegue la pieza.
            </p>
          </div>
          {puedeModificar && (
            <button
              type="button"
              onClick={() => setShowReagendarModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg font-medium text-xs shrink-0"
            >
              Reagendar
            </button>
          )}
        </div>
      )}

      {/* Editar / Eliminar */}
      <div className="flex justify-end gap-2 mb-4">
        {puedeModificar && !orden.eliminada && (
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Edit2 size={14} />
            Editar
          </button>
        )}
        <EliminarOrdenButton orden={orden} variant="button" onDeleted={onEliminar} />
      </div>

      {/* Stepper de fases */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
        <FaseStepper orden={orden} size="md" tienestandby={conStandby} />
        {puedeModificar && !orden.eliminada && orden.fase !== 'cancelado' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
            >
              <XCircle size={13} /> Cancelar
            </button>
          </div>
        )}
      </div>
      <CancelarOrdenModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        orden={orden}
        userProfile={userProfile}
      />
      <ReagendarModal
        isOpen={showReagendarModal}
        onClose={() => setShowReagendarModal(false)}
        orden={orden}
      />

      {/* Client Info */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Informacion del Cliente</h3>
        <div className="space-y-2">
          <p className="text-base font-medium text-gray-900">{orden.clienteNombre}</p>
          {orden.clienteTelefono && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 flex items-center gap-1.5">
                <Phone size={14} className="text-gray-400" />
                {formatTelefono(orden.clienteTelefono)}
              </span>
              <a
                href={whatsappLink(orden.clienteTelefono)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <MessageCircle size={12} />
                WhatsApp
              </a>
            </div>
          )}
          {orden.clienteDireccion && (
            <a
              href={
                orden.clienteDireccion.startsWith('http')
                  ? orden.clienteDireccion
                  : orden.clienteLat && orden.clienteLng
                    ? `https://maps.google.com/?q=${orden.clienteLat},${orden.clienteLng}`
                    : `https://maps.google.com/?q=${encodeURIComponent(orden.clienteDireccion)}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#1a5fa8] hover:underline flex items-center gap-1.5"
            >
              <MapPin size={14} />
              {orden.clienteDireccion.startsWith('http') && orden.clienteLat && orden.clienteLng
                ? `\u{1F4CD} ${orden.clienteLat.toFixed(6)}, ${orden.clienteLng.toFixed(6)}`
                : orden.clienteDireccion}
            </a>
          )}
        </div>
      </div>

      {/* Service Info */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Informacion del Servicio</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500 block text-xs">Fecha de Cita</span>
            <span className="text-gray-900">{orden.fechaCita ? formatFecha(orden.fechaCita) : 'Sin agendar'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Tecnico</span>
            <span className="text-gray-900">{orden.tecnicoNombre || 'Sin asignar'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Tipo de Equipo</span>
            <span className="text-gray-900">{orden.equipoTipo}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Marca</span>
            <span className="text-gray-900">{orden.equipoMarca || '--'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Modelo</span>
            <span className="text-gray-900">{orden.equipoModelo || '--'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Estado</span>
            <Badge label={estadoSimpleLabel(orden.estadoSimple || 'pendiente')} color={estadoSimpleColor(orden.estadoSimple || 'pendiente')} />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-gray-500 block text-xs mb-1">Descripcion de la Falla</span>
          <p className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">{orden.descripcionFalla}</p>
        </div>
      </div>

      {/* Notas internas de operaciones - solo visibles para operaciones, NO para tecnicos */}
      {orden.notas && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F4CB}'} Notas Internas (Operaciones)</h3>
          <p className="text-sm text-gray-700 bg-yellow-50 rounded-lg p-3 border border-yellow-100 whitespace-pre-line">{orden.notas}</p>
        </div>
      )}

      {/* Notas del tecnico - visibles para todos */}
      {orden.notasTecnico && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F527}'} Notas del Tecnico</h3>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-sm text-blue-800 whitespace-pre-line">{orden.notasTecnico}</p>
          </div>
        </div>
      )}

      {/* Precio sugerido por el tecnico */}
      {orden.precioSugerido !== undefined && orden.precioSugerido !== null && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F4B0}'} Precio Sugerido por el Tecnico</h3>
          <p className="text-lg font-bold text-green-700 bg-green-50 rounded-lg p-3 border border-green-200">
            RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
          </p>
        </div>
      )}

      {/* Aprobacion de precio (solo admin/operaciones, solo si hay sugerido y no aprobado) */}
      {orden.precioSugerido !== undefined &&
       orden.estadoAprobacion !== 'aprobado' &&
       (userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora' || userProfile?.rol === 'operaria') && (
        <div className="bg-yellow-50 rounded-xl p-4 border-2 border-yellow-200">
          <h3 className="text-sm font-semibold text-yellow-800 uppercase tracking-wide mb-2 flex items-center gap-1">
            {'\u{23F3}'} Aprobar Precio
          </h3>
          <p className="text-xs text-yellow-700 mb-3">
            El tecnico sugirio <strong>RD$ {Number(orden.precioSugerido).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>.
            Puedes modificar el precio antes de aprobar.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-yellow-800 mb-1">Precio final (RD$)</label>
              <input
                type="number"
                value={precioAprobacion}
                onChange={e => setPrecioAprobacion(e.target.value)}
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={onAprobarPrecio}
                disabled={aprobandoPrecio}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-60 whitespace-nowrap"
              >
                {aprobandoPrecio ? 'Aprobando...' : '\u{2705} Aprobar Precio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Precio Aprobado (cuando ya fue aprobado) */}
      {orden.estadoAprobacion === 'aprobado' && orden.precioFinal !== undefined && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{2705}'} Precio Aprobado</h3>
          <div className="bg-green-50 rounded-lg p-3 border-2 border-green-300">
            <p className="text-xl font-bold text-green-700">
              RD$ {Number(orden.precioFinal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </p>
            {orden.aprobadoPor && (
              <p className="text-[11px] text-green-700 mt-1">
                Aprobado por <strong>{orden.aprobadoPor}</strong>
                {orden.fechaAprobacion && ` \u{00B7} ${formatFecha(orden.fechaAprobacion)}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Created By */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Creado por</h3>
        <p className="text-sm text-gray-700">
          {orden.creadoPor || orden.responsableNombre || 'Sistema'}
          {' '}
          <span className="text-gray-400">- {tiempoTranscurrido(orden.createdAt)}</span>
        </p>
      </div>

      {/* Registro de Auditoria */}
      {orden.auditoria && orden.auditoria.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{'\u{1F4DD}'} Registro de Cambios</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {orden.auditoria.slice().reverse().map((reg, i) => (
              <div key={i} className="text-xs bg-gray-50 rounded-lg p-2 border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">{reg.usuario}</span>
                  <span className="text-gray-400">{formatFecha(reg.fecha)}</span>
                </div>
                <p className="text-gray-600 mt-0.5">{reg.detalle}</p>
                {reg.valorAnterior && reg.valorNuevo && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{reg.campo}: &quot;{reg.valorAnterior}&quot; &rarr; &quot;{reg.valorNuevo}&quot;</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase History Timeline */}
      {orden.historialFases.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Historial de Fases</h3>
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-gray-200" />
            {orden.historialFases.map((h, i) => (
              <div key={i} className="relative">
                <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white ${i === orden.historialFases.length - 1 ? 'bg-[#1a5fa8]' : 'bg-gray-300'}`} />
                <div>
                  <Badge fase={h.fase} />
                  <p className="text-xs text-gray-500 mt-1">
                    {formatFecha(h.timestamp)} - {h.usuario}
                  </p>
                  {h.nota && <p className="text-xs text-gray-600 mt-0.5">{h.nota}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
