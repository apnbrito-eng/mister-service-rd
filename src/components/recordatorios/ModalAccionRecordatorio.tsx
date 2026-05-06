import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { Check, MessageSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  enviarRecordatorioOperaria, marcarRecordatorioCompletadoPorAdmin,
} from '../../services/recordatorios.service';
import { whatsappUrl, mensajesWhatsApp } from '../../utils/whatsapp';
import { Personal, RecordatorioDiario, TipoRecordatorio } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  operaria: Personal;
  recordatorio: RecordatorioDiario | null;
  tipo: TipoRecordatorio;
}

export default function ModalAccionRecordatorio({
  isOpen, onClose, operaria, recordatorio, tipo,
}: Props) {
  // currentUser para obtener auth.uid real (P-001 — NO usar userProfile.id en
  // writes que la rule gatea por request.auth.uid).
  const { currentUser, userProfile } = useApp();
  const [vista, setVista] = useState<'inicial' | 'override'>('inicial');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  // operariaUid: campo `uid` del doc personal — DEBE ser auth.uid del Auth
  // de la operaria para que la notif respete la rule de notificaciones
  // (`userId == auth.uid`).
  const operariaUid = operaria.uid;
  const tituloOperacion = tipo === 'ruta_manana' ? 'Ruta de mañana' : 'Avisos a clientes';

  const handleClose = () => {
    setVista('inicial');
    setMotivo('');
    onClose();
  };

  const handleRecordar = async () => {
    if (!currentUser || !userProfile) {
      toast.error('Sesión no válida');
      return;
    }
    if (!operariaUid) {
      toast.error('La operaria no tiene Auth (uid). Pídele a admin que la asocie.');
      return;
    }
    setSaving(true);
    try {
      // 1) Notificación in-app a la operaria (rule: userId == auth.uid)
      await enviarRecordatorioOperaria({
        operariaUid,
        operariaNombre: operaria.nombre,
        tipo,
        actorUid: currentUser.uid,
        actorNombre: userProfile.nombre,
      });
      // 2) Abrir WhatsApp (manual — no Business API)
      if (operaria.telefono) {
        const mensaje = tipo === 'ruta_manana'
          ? mensajesWhatsApp.recordatorioOperariaRutaManana(operaria.nombre, userProfile.nombre)
          : mensajesWhatsApp.recordatorioOperariaAvisosClientes(operaria.nombre, userProfile.nombre);
        window.open(whatsappUrl(operaria.telefono, mensaje), '_blank');
      }
      toast.success(`Recordatorio enviado a ${operaria.nombre}`);
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar recordatorio');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarOverride = async () => {
    if (!currentUser || !userProfile) {
      toast.error('Sesión no válida');
      return;
    }
    if (!recordatorio) {
      toast.error('No hay recordatorio creado todavía para esta operaria');
      return;
    }
    const motivoTrim = motivo.trim();
    if (motivoTrim.length < 5) {
      toast.error('El motivo debe tener al menos 5 caracteres');
      return;
    }
    if (motivoTrim.length > 80) {
      toast.error('El motivo no puede pasar de 80 caracteres');
      return;
    }
    setSaving(true);
    try {
      const { yaEstabaCompletado } = await marcarRecordatorioCompletadoPorAdmin({
        recordatorioId: recordatorio.id,
        actorUid: currentUser.uid,
        actorNombre: userProfile.nombre,
        motivo: motivoTrim,
      });
      if (yaEstabaCompletado) {
        toast(`${operaria.nombre} ya tenía el recordatorio marcado completado`);
      } else {
        toast.success('Marcado como completado');
      }
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al marcar completado');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${tituloOperacion} — ${operaria.nombre}`}
      size="sm"
    >
      {vista === 'inicial' ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            ¿Qué querés hacer con el recordatorio pendiente de {operaria.nombre}?
          </p>
          <button
            onClick={handleRecordar}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <WhatsAppIcon filled={true} size={16} />
            Recordar a la operaria
          </button>
          <button
            onClick={() => setVista('override')}
            disabled={saving || !recordatorio}
            title={!recordatorio ? 'La operaria todavía no abrió su recordatorio del día. Primero recordale.' : ''}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} />
            Marcar completado por admin
          </button>
          <button
            onClick={handleClose}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 flex items-start gap-2">
            <MessageSquare size={16} className="text-amber-600 mt-0.5 shrink-0" />
            Vas a marcar como completado por override de admin. Decí brevemente
            por qué (queda en auditoría).
          </p>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            maxLength={80}
            rows={3}
            placeholder="Ej: ya organizó la ruta por teléfono"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] resize-none"
            autoFocus
          />
          <div className="flex justify-between items-center text-[11px] text-gray-500">
            <span>Mínimo 5, máximo 80 caracteres</span>
            <span>{motivo.length}/80</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setVista('inicial'); setMotivo(''); }}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Volver
            </button>
            <button
              onClick={handleConfirmarOverride}
              disabled={saving || motivo.trim().length < 5}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
