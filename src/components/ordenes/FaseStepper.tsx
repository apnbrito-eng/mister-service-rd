import { useState } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio, FaseOrden, EstadoOrdenSimple } from '../../types';
import {
  crearRegistroAuditoria, faseLabel, FASES_ORDENADAS,
  generarTokenPortalCliente,
} from '../../utils';
import { useApp } from '../../context/AppContext';
import { puede } from '../../utils/permisos';
import { registrarComisionPorOrden } from '../../utils/comisiones';
import { crearNotificacion } from '../../services/notificaciones.service';
import Modal from '../Modal';
import { Check, Package, AlertTriangle, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const FASES_STEPPER = FASES_ORDENADAS;

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
  mostrarNumeros?: boolean;
  className?: string;
}

export default function FaseStepper({
  orden,
  readonly = false,
  tienestandby = false,
  onCambioFase,
  size = 'md',
  mostrarNumeros = false,
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

  const [showRetrocesoModal, setShowRetrocesoModal] = useState(false);
  const [faseDestinoRetro, setFaseDestinoRetro] = useState<FaseOrden | null>(null);
  const [motivoRetro, setMotivoRetro] = useState('');
  const [saving, setSaving] = useState(false);

  const faseActualIdx = FASES_STEPPER.indexOf(orden.fase);
  const effectiveIdx = orden.fase === 'cancelado' ? -1 : faseActualIdx;

  const ejecutarCambio = async (nuevaFase: FaseOrden, nota?: string) => {
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
    const updatePayload: Record<string, unknown> = {
      fase: nuevaFase,
      estadoSimple: mapearEstadoSimple(nuevaFase),
      estado: nuevaFase === 'cerrado' ? 'cerrado' : 'activo',
      historialFases: nuevoHistorial,
      auditoria: arrayUnion(registro),
      updatedAt: ahora,
    };
    // Si la orden NO está marcada como solo_chequeo y se está cerrando, marcar
    // explícitamente como reparacion_completa para distinguir cierre normal
    // del chequeo previo (relevante en órdenes reactivadas post-chequeo).
    if (nuevaFase === 'cerrado' && !orden.soloChequeo) {
      updatePayload.tipoCierre = 'reparacion_completa';
    }
    // Portal del Cliente: al pasar a `agendado` (manualmente desde el
    // stepper), generar token si no existe. Idempotente.
    if (nuevaFase === 'agendado' && !orden.tokenPortalCliente) {
      updatePayload.tokenPortalCliente = generarTokenPortalCliente();
    }
    await updateDoc(doc(db, 'ordenes_servicio', orden.id), updatePayload);

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

    if (nuevaFase === 'aprobado' && orden.tecnicoId) {
      try {
        const total = orden.precioFinal || orden.precioAprobado || 0;
        await crearNotificacion({
          userId: orden.tecnicoId,
          destinatarioNombre: orden.tecnicoNombre,
          tipo: 'precio_aprobado',
          titulo: 'Precio aprobado · Puedes comenzar',
          mensaje: `Orden ${orden.numero} aprobada. Cliente: ${orden.clienteNombre}. Total: RD$${total.toLocaleString('es-DO')}.`,
          ordenId: orden.id,
          ordenNumero: orden.numero,
        });
      } catch (err) {
        console.error('Error creando notificación:', err);
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

  // Píldora oval con texto completo
  const sizeClasses = size === 'sm'
    ? 'px-2.5 py-1 text-[10.5px] sm:px-3 sm:py-1.5'
    : 'px-3 py-1.5 sm:px-4 sm:py-2 text-[11.5px] sm:text-[12.5px]';
  const chevronSize = size === 'sm' ? 10 : 14;
  const gapClass = size === 'sm' ? 'gap-1' : 'gap-2';

  const pillClass = (idx: number) => {
    const isPast = idx < effectiveIdx;
    const isCurrent = idx === effectiveIdx;
    const base = `inline-flex items-center gap-1.5 rounded-full border font-bold whitespace-nowrap transition-all ${sizeClasses}`;
    if (esAnulada) {
      return `${base} bg-gray-100 text-gray-400 border-gray-200`;
    }
    if (isCurrent) {
      return `${base} bg-[#0f3460] text-white border-[#0f3460] shadow-md ring-4 ring-blue-200`;
    }
    if (isPast) {
      return `${base} bg-green-50 text-green-800 border-green-200`;
    }
    return `${base} bg-gray-50 text-gray-400 border-gray-200`;
  };

  const numeroCircle = (idx: number, isCurrent: boolean, isPast: boolean) => {
    if (!mostrarNumeros) return null;
    const bg = isCurrent
      ? 'bg-white text-[#0f3460]'
      : isPast
        ? 'bg-green-200 text-green-900'
        : 'bg-gray-200 text-gray-500';
    return (
      <span className={`inline-flex items-center justify-center rounded-full w-4 h-4 text-[9px] font-bold ${bg}`}>
        {idx + 1}
      </span>
    );
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {tienestandby && !esAnulada && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 text-[11px] font-medium">
          <Package size={11} /> En Stand-by — piezas pendientes
        </div>
      )}

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

      <div className={`flex flex-wrap items-center ${gapClass}`}>
        {FASES_STEPPER.map((fase, idx) => {
          const isPast = idx < effectiveIdx;
          const isCurrent = idx === effectiveIdx;
          const title = faseLabel(fase) + (isCurrent ? ' (actual)' : isPast ? ' (pasada)' : '');
          const content = (
            <>
              {numeroCircle(idx, isCurrent, isPast)}
              {isPast && !mostrarNumeros && <Check size={size === 'sm' ? 10 : 12} />}
              <span>{faseLabel(fase)}</span>
            </>
          );
          const hoverClass = isCurrent
            ? 'hover:brightness-110'
            : 'hover:scale-105 hover:shadow-sm';

          return (
            <div key={fase} className={`flex items-center ${gapClass}`}>
              {interactivo ? (
                <button
                  type="button"
                  onClick={(e) => handleClickFase(fase, e)}
                  disabled={saving}
                  title={title}
                  className={`${pillClass(idx)} ${hoverClass} disabled:opacity-60 ${isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {content}
                </button>
              ) : (
                <div title={title} className={pillClass(idx)}>
                  {content}
                </div>
              )}
              {idx < FASES_STEPPER.length - 1 && (
                <ChevronRight size={chevronSize} className="text-gray-300 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

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
