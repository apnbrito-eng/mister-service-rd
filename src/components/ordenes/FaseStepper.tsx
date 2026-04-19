import { useState } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio, FaseOrden, EstadoOrdenSimple } from '../../types';
import { crearRegistroAuditoria, faseLabel, faseColor } from '../../utils';
import { useApp } from '../../context/AppContext';
import { puede } from '../../utils/permisos';
import { registrarComisionPorOrden } from '../../utils/comisiones';
import Modal from '../Modal';
import { Check, Package, AlertTriangle, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

/** Fases visibles en el stepper (excluye 'cancelado' que se maneja aparte) */
const FASES_STEPPER: FaseOrden[] = [
  'nuevo_lead', 'en_gestion', 'en_diagnostico', 'en_cotizacion',
  'aprobado', 'agendado', 'trabajo_realizado', 'cerrado',
];

/** Etiqueta corta por fase para pills compactas */
const FASE_LABEL_CORTO: Record<FaseOrden, string> = {
  nuevo_lead: 'Nuevo',
  en_gestion: 'Gestión',
  en_diagnostico: 'Diag',
  en_cotizacion: 'Cot',
  aprobado: 'Aprob',
  agendado: 'Agenda',
  trabajo_realizado: 'Realizado',
  cerrado: 'Cerrado',
  cancelado: 'Cancel',
};

function mapearEstadoSimple(fase: FaseOrden): EstadoOrdenSimple {
  if (['trabajo_realizado', 'cerrado'].includes(fase)) return 'completado';
  if (['en_diagnostico', 'en_cotizacion'].includes(fase)) return 'en_proceso';
  if (fase === 'cancelado') return 'cancelado';
  return 'pendiente';
}

interface Props {
  orden: OrdenServicio;
  readonly?: boolean;
  tienestandby?: boolean;
  onCambioFase?: (nuevaFase: FaseOrden, nota?: string) => Promise<void>;
  size?: 'sm' | 'md';
  className?: string;
}

export default function FaseStepper({
  orden,
  readonly = false,
  tienestandby = false,
  onCambioFase,
  size = 'md',
  className = '',
}: Props) {
  const { userProfile } = useApp();
  const puedeModificar = puede(userProfile, 'ordenesModificar');
  const puedeRetroceder =
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora' ||
    userProfile?.rol === 'operaria';

  const esAnulada = orden.eliminada || orden.fase === 'cancelado';
  const interactivo = size === 'md' && !readonly && !esAnulada && puedeModificar;

  // Modal de retroceso
  const [showRetrocesoModal, setShowRetrocesoModal] = useState(false);
  const [faseDestinoRetro, setFaseDestinoRetro] = useState<FaseOrden | null>(null);
  const [motivoRetro, setMotivoRetro] = useState('');
  const [saving, setSaving] = useState(false);

  // Fases ya pasadas: cualquier fase cuyo índice sea <= índice actual
  const faseActualIdx = FASES_STEPPER.indexOf(orden.fase);
  // Si la fase actual es 'cancelado', ninguna está "activa" — mostrar todas grises
  const effectiveIdx = orden.fase === 'cancelado' ? -1 : faseActualIdx;

  const ejecutarCambio = async (nuevaFase: FaseOrden, nota?: string) => {
    // Si el caller provee handler, delegar
    if (onCambioFase) {
      return onCambioFase(nuevaFase, nota);
    }
    const usuario = userProfile?.nombre || 'Sistema';
    const ahora = Timestamp.now();
    const nuevoHistorial = [
      ...orden.historialFases.map(h => ({
        fase: h.fase,
        timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
        usuario: h.usuario || '',
        ...(h.nota ? { nota: h.nota } : {}),
      })),
      {
        fase: nuevaFase,
        timestamp: ahora,
        usuario,
        ...(nota ? { nota } : {}),
      },
    ];
    const registro = crearRegistroAuditoria(
      usuario, 'cambio_fase',
      nota ? `Cambió fase a "${faseLabel(nuevaFase)}" — ${nota}` : `Cambió fase a "${faseLabel(nuevaFase)}"`,
      'fase', faseLabel(orden.fase), faseLabel(nuevaFase)
    );
    await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
      fase: nuevaFase,
      estadoSimple: mapearEstadoSimple(nuevaFase),
      estado: nuevaFase === 'cerrado' ? 'cerrado' : 'activo',
      historialFases: nuevoHistorial,
      auditoria: arrayUnion(registro),
      updatedAt: ahora,
    });

    // Al cerrar, intentar registrar comisión (idempotente; si ya existe o no aplica, noop)
    if (nuevaFase === 'cerrado') {
      try {
        const ordenAct = { ...orden, fase: 'cerrado' as FaseOrden };
        const res = await registrarComisionPorOrden(ordenAct, userProfile);
        if (res.creada) {
          toast.success(`Comisión registrada: RD$ ${(res.comisionMonto || 0).toLocaleString('es-DO')}`);
        }
      } catch (err) {
        console.error('Error registrando comisión:', err);
        toast.error('Orden cerrada, pero la comisión no se registró. Revisa logs.');
      }
    }
  };

  const handleClickFase = async (fase: FaseOrden, e: React.MouseEvent) => {
    if (!interactivo) return;
    e.stopPropagation();
    e.preventDefault();
    if (fase === orden.fase) return;
    const destinoIdx = FASES_STEPPER.indexOf(fase);
    const esRetroceso = destinoIdx < faseActualIdx;
    if (esRetroceso) {
      if (!puedeRetroceder) {
        toast.error('No tienes permiso para retroceder fases');
        return;
      }
      setFaseDestinoRetro(fase);
      setMotivoRetro('');
      setShowRetrocesoModal(true);
      return;
    }
    // Avance: confirm nativo rápido
    if (!window.confirm(`¿Avanzar la orden a "${faseLabel(fase)}"?`)) return;
    setSaving(true);
    try {
      await ejecutarCambio(fase);
      toast.success(`Fase: ${faseLabel(fase)}`);
    } catch (err) {
      console.error(err);
      toast.error('Error al cambiar fase');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarRetroceso = async () => {
    if (!faseDestinoRetro) return;
    if (motivoRetro.trim().length < 10) {
      toast.error('El motivo debe tener al menos 10 caracteres');
      return;
    }
    setSaving(true);
    try {
      await ejecutarCambio(faseDestinoRetro, motivoRetro.trim());
      toast.success(`Regresada a "${faseLabel(faseDestinoRetro)}"`);
      setShowRetrocesoModal(false);
      setFaseDestinoRetro(null);
      setMotivoRetro('');
    } catch (err) {
      console.error(err);
      toast.error('Error al retroceder fase');
    } finally {
      setSaving(false);
    }
  };

  // Clases compartidas
  const pillBase = size === 'sm'
    ? 'flex items-center justify-center rounded-full text-[9px] font-semibold transition-all'
    : 'flex items-center gap-1 rounded-full text-xs font-semibold transition-all border';
  const pillSize = size === 'sm' ? 'w-6 h-6' : 'px-3 py-1.5';

  const pillClass = (idx: number) => {
    const isPast = idx < effectiveIdx;
    const isCurrent = idx === effectiveIdx;
    if (esAnulada) return `${pillBase} ${pillSize} bg-gray-100 text-gray-400 ${size === 'md' ? 'border-gray-200' : ''}`;
    if (isCurrent) {
      return `${pillBase} ${pillSize} ${faseColor(FASES_STEPPER[idx])} ${size === 'md' ? 'border-transparent ring-2 ring-offset-1 ring-[#1a5fa8]' : ''} shadow-sm`;
    }
    if (isPast) {
      return `${pillBase} ${pillSize} bg-green-50 text-green-700 ${size === 'md' ? 'border-green-200' : ''}`;
    }
    return `${pillBase} ${pillSize} bg-gray-50 text-gray-400 ${size === 'md' ? 'border-gray-200' : ''}`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Badge de Stand-by */}
      {tienestandby && !esAnulada && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 text-[11px] font-medium">
          <Package size={11} /> En Stand-by — piezas pendientes
        </div>
      )}

      {/* Banner anulación (sobre el stepper) */}
      {orden.eliminada && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-[11px] font-medium">
          <AlertTriangle size={11} /> Orden eliminada
        </div>
      )}
      {!orden.eliminada && orden.fase === 'cancelado' && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-medium">
          <AlertTriangle size={11} /> Orden cancelada
        </div>
      )}

      {/* Stepper horizontal */}
      <div className={`flex items-center gap-1 ${size === 'md' ? 'overflow-x-auto pb-1' : 'flex-wrap'}`}>
        {FASES_STEPPER.map((fase, idx) => {
          const isPast = idx < effectiveIdx;
          const isCurrent = idx === effectiveIdx;
          const content = size === 'sm' ? (
            isPast ? <Check size={10} /> : <span>{idx + 1}</span>
          ) : (
            <>
              {isPast && <Check size={11} />}
              <span>{FASE_LABEL_CORTO[fase]}</span>
            </>
          );
          const title = faseLabel(fase) + (isCurrent ? ' (actual)' : isPast ? ' (pasada)' : '');

          return (
            <div key={fase} className="flex items-center">
              {interactivo ? (
                <button
                  type="button"
                  onClick={(e) => handleClickFase(fase, e)}
                  disabled={saving}
                  title={title}
                  className={`${pillClass(idx)} hover:opacity-80 disabled:opacity-60 cursor-pointer`}
                >
                  {content}
                </button>
              ) : (
                <div title={title} className={pillClass(idx)}>
                  {content}
                </div>
              )}
              {idx < FASES_STEPPER.length - 1 && (
                <ChevronRight size={size === 'sm' ? 10 : 12} className="text-gray-300 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Modal retroceso con motivo */}
      <Modal
        isOpen={showRetrocesoModal}
        onClose={() => { setShowRetrocesoModal(false); setFaseDestinoRetro(null); setMotivoRetro(''); }}
        title={faseDestinoRetro ? `Regresar a "${faseLabel(faseDestinoRetro)}"` : 'Regresar fase'}
      >
        {faseDestinoRetro && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
              Estás retrocediendo la orden de <span className="font-semibold">{faseLabel(orden.fase)}</span> a <span className="font-semibold">{faseLabel(faseDestinoRetro)}</span>. Escribe el motivo para auditoría.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo del regreso *</label>
              <textarea
                rows={4}
                value={motivoRetro}
                onChange={e => setMotivoRetro(e.target.value)}
                placeholder="Mínimo 10 caracteres"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className={`text-[11px] mt-1 ${motivoRetro.trim().length >= 10 ? 'text-gray-500' : 'text-red-500'}`}>
                {motivoRetro.trim().length}/10 caracteres mínimos
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button"
                onClick={() => { setShowRetrocesoModal(false); setFaseDestinoRetro(null); setMotivoRetro(''); }}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
                Cancelar
              </button>
              <button type="button"
                onClick={handleConfirmarRetroceso}
                disabled={saving || motivoRetro.trim().length < 10}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? 'Guardando...' : 'Confirmar regreso'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
