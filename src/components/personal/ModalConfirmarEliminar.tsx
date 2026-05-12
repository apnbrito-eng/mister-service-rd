import { AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import type { Personal, Rol, OrdenServicio } from '../../types';

/**
 * Modal de confirmación de eliminación de empleado extraído de PersonalPage.tsx
 * (SPRINT-142b, 2026-05-11).
 *
 * IMPORTANTE: este componente SOLO renderiza JSX. La lógica de eliminación
 * (handleConfirmarEliminar, con writeBatch + chunking + branches por rol) vive
 * en PersonalPage y se pasa como callback `onConfirmar`.
 *
 * El handler `handleConfirmarEliminar` original (SPRINT-133 commit `15cab52`)
 * envuelve mutaciones cross-collection en writeBatch para atomicidad — su
 * comentario `@safe-non-tx: SPRINT-134 follow-up` (que era para otras funciones
 * fuera) sigue en su sitio original. Acá NO se mueve nada de la lógica.
 *
 * Plan de rollback: revertir el commit. Modal vuelve inline a PersonalPage.
 *
 * Constante ROL_LABELS duplicada con PersonalPage / FormAltaEditarEmpleado /
 * GruposOperariaTecnico. Consolidación a `utils/personal.ts` queda para 142d.
 */

// Constante duplicada — consolidación SPRINT-142d.
const ROL_LABELS: Record<Rol, string> = {
  administrador: 'Administrador',
  coordinadora: 'Coordinadora',
  secretaria: 'Secretaria',
  operaria: 'Operaria',
  tecnico: 'Técnico',
  ayudante: 'Ayudante',
};

export interface ModalConfirmarEliminarProps {
  isOpen: boolean;
  onClose: () => void;
  /** Empleado a eliminar. Si es null, el modal renderea vacío (Modal con isOpen=false). */
  personalAccion: Personal | null;
  /** Lista completa (para calcular destinos de transferencia y último admin). */
  personal: Personal[];
  /** Órdenes activas (para mostrar dependencias del técnico/operaria). */
  ordenes: OrdenServicio[];
  transferDestinoId: string;
  setTransferDestinoId: (v: string) => void;
  processingAccion: boolean;
  /** Callback que dispara la eliminación. Lógica completa vive en PersonalPage. */
  onConfirmar: () => void | Promise<void>;
}

export default function ModalConfirmarEliminar({
  isOpen,
  onClose,
  personalAccion,
  personal,
  ordenes,
  transferDestinoId,
  setTransferDestinoId,
  processingAccion,
  onConfirmar,
}: ModalConfirmarEliminarProps) {
  // Helpers locales — mismo shape que los originales en PersonalPage.
  // Replicados acá porque ahora `personal` y `ordenes` llegan por props.
  const getOrdenesActivasDeTecnico = (p: Personal): OrdenServicio[] =>
    ordenes.filter(o =>
      (o.tecnicoId === p.id || o.responsableId === p.id) &&
      !['cerrado', 'cancelado'].includes(o.fase)
    );

  const getTecnicosDeOperaria = (p: Personal): Personal[] =>
    personal.filter(t => t.operariaId === p.id && t.activo);

  const getOrdenesActivasDeOperaria = (p: Personal): OrdenServicio[] =>
    ordenes.filter(o =>
      o.operariaId === p.id &&
      !['cerrado', 'cancelado'].includes(o.fase)
    );

  const destinosTransferencia = (p: Personal): Personal[] => {
    if (p.rol === 'tecnico') {
      return personal.filter(t => t.rol === 'tecnico' && t.activo && t.id !== p.id);
    }
    if (p.rol === 'operaria') {
      return personal.filter(o => o.rol === 'operaria' && o.activo && o.id !== p.id);
    }
    return [];
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={personalAccion ? `Eliminar ${ROL_LABELS[personalAccion.rol].toLowerCase()}: ${personalAccion.nombre}` : 'Eliminar'}
    >
      {personalAccion && (() => {
        const p = personalAccion;
        const destinos = destinosTransferencia(p);

        if (p.rol === 'tecnico') {
          const deps = getOrdenesActivasDeTecnico(p);
          const sinDestino = deps.length > 0 && destinos.length === 0;
          const sinSeleccion = deps.length > 0 && !transferDestinoId;

          return (
            <div className="space-y-4">
              {deps.length === 0 ? (
                <p className="text-sm text-gray-700">
                  Sin órdenes activas asignadas. La eliminación es segura.
                </p>
              ) : (
                <>
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-800">
                      Este técnico tiene {deps.length} orden(es) activa(s). Debes transferirlas a otro técnico.
                    </p>
                  </div>
                  {sinDestino ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      Crea otro técnico activo primero antes de eliminar a {p.nombre}.
                    </p>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transferir a:</label>
                      <select
                        value={transferDestinoId}
                        onChange={e => setTransferDestinoId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      >
                        <option value="">Seleccionar técnico...</option>
                        {destinos.map(d => (
                          // SPRINT-132 + P-006: value={d.uid || d.id} para que el doc id final
                          // escrito en ordenes_servicio.tecnicoId sea auth.uid (gateado por rules).
                          <option key={d.id} value={d.uid || d.id}>
                            {d.nombre}{d.operariaNombre ? ` (grupo ${d.operariaNombre})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} disabled={processingAccion}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={onConfirmar}
                  disabled={processingAccion || sinDestino || sinSeleccion}
                  className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                  {processingAccion ? 'Eliminando...' : 'Confirmar eliminación'}
                </button>
              </div>
            </div>
          );
        }

        if (p.rol === 'operaria') {
          const tecs = getTecnicosDeOperaria(p);
          const ords = getOrdenesActivasDeOperaria(p);
          const tieneDeps = tecs.length > 0 || ords.length > 0;
          const sinDestino = tieneDeps && destinos.length === 0;
          const sinSeleccion = tieneDeps && !transferDestinoId;

          return (
            <div className="space-y-4">
              {!tieneDeps ? (
                <p className="text-sm text-gray-700">Sin técnicos ni órdenes asignadas. La eliminación es segura.</p>
              ) : (
                <>
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-800">
                      {tecs.length} técnico(s) y {ords.length} orden(es) asignada(s). Debes transferirlos a otra operaria.
                    </p>
                  </div>
                  {sinDestino ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      Crea otra operaria activa primero antes de eliminar a {p.nombre}.
                    </p>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transferir a:</label>
                      <select
                        value={transferDestinoId}
                        onChange={e => setTransferDestinoId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                      >
                        <option value="">Seleccionar operaria...</option>
                        {destinos.map(d => (
                          // SPRINT-132: simétrico al lookup en handleConfirmarEliminar (línea ~734).
                          // operariaId no se gatea por rules pero mantenemos el patrón uniforme.
                          <option key={d.id} value={d.uid || d.id}>{d.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} disabled={processingAccion}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                  Cancelar
                </button>
                <button type="button" onClick={onConfirmar}
                  disabled={processingAccion || sinDestino || sinSeleccion}
                  className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                  {processingAccion ? 'Eliminando...' : 'Confirmar eliminación'}
                </button>
              </div>
            </div>
          );
        }

        // administrador / secretaria / coordinadora / ayudante (sin dependencias estructurales)
        const esUltimoAdmin =
          p.rol === 'administrador' &&
          p.activo &&
          personal.filter(x => x.rol === 'administrador' && x.activo && x.id !== p.id).length === 0;

        return (
          <div className="space-y-4">
            {esUltimoAdmin ? (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                <p className="text-xs text-red-800">
                  No puedes eliminar el último administrador del sistema. Crea otro admin activo primero.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-700">
                {p.rol === 'administrador'
                  ? 'Este administrador no tiene dependencias operativas directas. Su historial se conserva.'
                  : 'Las secretarias no son dueñas de órdenes operativas. Su historial se conserva.'}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={processingAccion}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                Cancelar
              </button>
              <button type="button" onClick={onConfirmar}
                disabled={processingAccion || esUltimoAdmin}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {processingAccion ? 'Eliminando...' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
