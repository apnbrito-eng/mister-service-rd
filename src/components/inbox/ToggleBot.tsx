import { useState } from 'react';
import { Bot, PowerOff, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { toggleBot } from '../../services/whatsappInbox.service';
import toast from 'react-hot-toast';

/**
 * Switch ON/OFF del bot IA por conversación (SPRINT-INBOX-4, 2026-05-20).
 *
 * Comportamiento:
 *   - Si está activado (ON), un click muestra confirmación inline antes de
 *     pausar (pausar es la acción "riesgosa" — el cliente queda sin
 *     respuesta automática hasta que un humano tome la conversación).
 *   - Si está pausado (OFF), un click reactiva directo (sin confirmar).
 *
 * Permisos:
 *   - La rule `whatsapp_conversaciones` (firestore.rules:767-772) permite
 *     toggle `bot.habilitado` SOLO a admin/coord OR a la asignataria de la
 *     conversación. Si el caller no cumple, updateDoc lanza
 *     `permission-denied` y el toast captura el error.
 *
 * Gotcha aplicada:
 *   - P-001: `currentUser.uid` (no `userProfile.id`) se pasa como
 *     `actorUid` al service para el audit log + para que la rule lo
 *     evalúe correctamente.
 */

interface Props {
  waId: string;
  habilitado: boolean;
  /** Si el caller puede invocar el toggle (precheck UX; la rule decide al final). */
  puedeTogglear?: boolean;
}

export default function ToggleBot({ waId, habilitado, puedeTogglear = true }: Props) {
  const { currentUser } = useApp();
  const [confirmandoPausar, setConfirmandoPausar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function ejecutarToggle(nuevoEstado: boolean) {
    if (!currentUser?.uid) {
      toast.error('Sesión no encontrada');
      return;
    }
    setEnviando(true);
    try {
      // P-001: pasamos auth.uid, no userProfile.id.
      await toggleBot(waId, nuevoEstado, currentUser.uid);
      toast.success(nuevoEstado ? 'Bot reactivado' : 'Bot pausado');
      setConfirmandoPausar(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error desconocido';
      // permission-denied → la rule rechazó (no es admin/coord ni asignataria)
      if (/permission-denied|insufficient/i.test(msg)) {
        toast.error('Sin permiso. Solo admin/coord o quien tiene asignada la conversación pueden pausar el bot.');
      } else {
        // eslint-disable-next-line no-console
        console.error('[ToggleBot] falló:', err);
        toast.error('No se pudo cambiar el estado del bot');
      }
    } finally {
      setEnviando(false);
    }
  }

  function onClickPrincipal() {
    if (!puedeTogglear) {
      toast.error('No tenés permiso para cambiar el estado del bot en esta conversación.');
      return;
    }
    if (enviando) return;
    if (habilitado) {
      // Pausar requiere confirmación (acción más riesgosa).
      setConfirmandoPausar(true);
    } else {
      // Reactivar va directo.
      ejecutarToggle(true);
    }
  }

  if (confirmandoPausar) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm">
        <p className="font-medium text-amber-900 mb-2">¿Pausar el bot IA?</p>
        <p className="text-xs text-amber-800 mb-3">
          El cliente no recibirá respuestas automáticas hasta que alguien del
          equipo le responda manualmente. La pausa queda registrada en el
          audit log.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => ejecutarToggle(false)}
            disabled={enviando}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {enviando ? <Loader2 size={12} className="animate-spin" /> : <PowerOff size={12} />}
            Sí, pausar
          </button>
          <button
            type="button"
            onClick={() => setConfirmandoPausar(false)}
            disabled={enviando}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClickPrincipal}
      disabled={enviando || !puedeTogglear}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        habilitado
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
      }`}
      title={
        habilitado
          ? 'Bot IA respondiendo. Click para pausar.'
          : 'Bot pausado. Click para reactivar.'
      }
    >
      {enviando ? (
        <Loader2 size={12} className="animate-spin" />
      ) : habilitado ? (
        <Bot size={12} className="text-emerald-600" />
      ) : (
        <PowerOff size={12} className="text-gray-400" />
      )}
      Bot IA: {habilitado ? 'ON' : 'Pausado'}
    </button>
  );
}
