import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { OrdenServicio, Personal, Usuario } from '../../types';
import { resincronizarOperariaEnOrden } from '../../services/ordenes.service';

/**
 * Botón "Re-sincronizar operaria" — SPRINT-130.
 *
 * Estados visuales:
 * - **Oculto** cuando no aplica: orden sin técnico.
 * - **Disabled gris con tooltip** cuando el técnico no tiene operaria asignada
 *   (instruye a Jorge a asignarla en Personal primero).
 * - **Disabled "Sincronizada"** cuando la operaria del doc ya coincide con la
 *   del técnico (no hay nada que hacer).
 * - **Activo púrpura** cuando hay mismatch entre `orden.operariaNombre` y la
 *   operaria actual del técnico — click ejecuta el helper de servicio.
 *
 * No hace optimistic update: depende del `onSnapshot` aguas arriba para
 * refrescar la UI. Pide confirm() antes de escribir.
 *
 * IMPORTANTE: el técnico se busca en `personal` por `p.uid || p.id` (post
 * SPRINT-106 / commit `c4be345`: `orden.tecnicoId == auth.uid`). El cazador
 * P-006 verifica esa convención a nivel de dropdowns; este componente no
 * escribe `tecnicoId`, solo lo lee.
 */
interface Props {
  orden: OrdenServicio;
  personal: Personal[];
  userProfile: Usuario | null;
}

export default function BotonRederivarOperaria({ orden, personal, userProfile }: Props) {
  const [aplicando, setAplicando] = useState(false);

  // Orden sin técnico: no hay nada que derivar.
  if (!orden.tecnicoId) return null;

  // Buscar técnico — convención post-c4be345: tecnicoId == auth.uid.
  const tecnico = personal.find((p) => (p.uid || p.id) === orden.tecnicoId);

  // Técnico ya no está en personal (huérfano migración): no podemos derivar.
  if (!tecnico) return null;

  // SPRINT-149: `tecnico.operariaId` y `orden.operariaId` post-SPRINT-105
  // persisten ambos auth.uid. Si una orden legacy tiene operariaId=docId y el
  // técnico tiene operariaId=uid, el botón aparecerá como "no sincronizada"
  // y el handler de re-sincronización escribirá el uid correcto a la orden
  // (alineando ambos lados). Comportamiento esperado post-SPRINT-149.
  const operariaIdTecnico = tecnico.operariaId || null;
  const operariaNombreTecnico = tecnico.operariaNombre || null;
  const operariaIdOrden = orden.operariaId || null;
  const operariaNombreOrden = orden.operariaNombre || null;

  // Caso 1: el técnico no tiene operaria asignada. Botón disabled con tooltip.
  if (!operariaIdTecnico) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-400 cursor-not-allowed"
          title="Este técnico todavía no tiene operaria asignada. Asignala desde Personal primero."
        >
          <AlertTriangle size={12} />
          Sin operaria
        </button>
        <span className="text-[11px] text-amber-600">
          Asigná operaria al técnico en Personal primero.
        </span>
      </div>
    );
  }

  // Caso 2: ya está sincronizada. Botón disabled gris.
  const sincronizada =
    operariaIdOrden === operariaIdTecnico && operariaNombreOrden === operariaNombreTecnico;
  if (sincronizada) {
    return (
      <div className="mt-2">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 cursor-default"
          title="La operaria de esta orden ya coincide con la del técnico."
        >
          <CheckCircle2 size={12} />
          Sincronizada
        </button>
      </div>
    );
  }

  // Caso 3: hay mismatch. Botón activo con confirmación.
  const handleClick = async () => {
    if (aplicando) return;

    const usuarioNombre = userProfile?.nombre || 'sistema';
    const mensajeConfirm = operariaNombreOrden
      ? `Cambiar la operaria de esta orden de "${operariaNombreOrden}" a "${operariaNombreTecnico}"?`
      : `Asignar la operaria "${operariaNombreTecnico}" a esta orden?`;

    if (!window.confirm(mensajeConfirm)) return;

    setAplicando(true);
    try {
      const result = await resincronizarOperariaEnOrden(
        orden.id,
        personal,
        { nombre: usuarioNombre },
      );

      if (result.ok) {
        toast.success(`Operaria sincronizada: ${operariaNombreTecnico}`);
      } else {
        switch (result.razon) {
          case 'ya_sincronizada':
            toast.success('La orden ya estaba sincronizada.');
            break;
          case 'tecnico_sin_operaria':
            toast.error('Este técnico no tiene operaria asignada.');
            break;
          case 'tecnico_no_encontrado':
            toast.error('No se encontró al técnico actual en Personal.');
            break;
          case 'orden_sin_tecnico':
            toast.error('Esta orden no tiene técnico asignado.');
            break;
          case 'orden_no_existe':
            toast.error('La orden ya no existe.');
            break;
          default:
            toast.error('Error inesperado. Revisá la consola.');
        }
      }
    } finally {
      setAplicando(false);
    }
  };

  const banner = operariaNombreOrden
    ? `Operaria actual: ${operariaNombreOrden}. El técnico hoy reporta a ${operariaNombreTecnico}.`
    : `Esta orden no tiene operaria asignada. El técnico hoy reporta a ${operariaNombreTecnico}.`;

  return (
    <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
      <p className="text-[11px] text-amber-800">{banner}</p>
      <button
        type="button"
        onClick={handleClick}
        disabled={aplicando}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        <RefreshCw size={12} className={aplicando ? 'animate-spin' : ''} />
        {aplicando ? 'Sincronizando…' : 'Re-sincronizar operaria'}
      </button>
    </div>
  );
}
