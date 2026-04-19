import { useState } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio, Usuario } from '../../types';
import { crearRegistroAuditoria } from '../../utils';
import Modal from '../Modal';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenServicio | null;
  userProfile: Usuario | null;
  onDeleted?: () => void;
}

export default function EliminarOrdenModal({ isOpen, onClose, orden, userProfile, onDeleted }: Props) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setMotivo('');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirmar = async () => {
    if (!orden) return;
    if (motivo.trim().length < 10) {
      toast.error('Motivo debe tener al menos 10 caracteres');
      return;
    }
    setSaving(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const ahora = Timestamp.now();
      const registro = crearRegistroAuditoria(
        usuario, 'eliminar', `Eliminó orden — Motivo: ${motivo.trim()}`,
        'eliminada', 'false', 'true'
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        eliminada: true,
        motivoEliminacion: motivo.trim(),
        eliminadaPor: usuario,
        eliminadaPorId: userProfile?.id || '',
        fechaEliminacion: ahora,
        updatedAt: ahora,
        auditoria: arrayUnion(registro),
      });
      toast.success('Orden eliminada');
      handleClose();
      onDeleted?.();
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar la orden');
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={orden ? `Eliminar orden ${orden.numero || ''}` : 'Eliminar orden'}
    >
      {orden && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            Esta orden se marcará como eliminada (soft delete). Sus datos se conservan
            y pueden recuperarse desde el filtro "Ver eliminadas".
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de eliminación *</label>
            <textarea
              rows={4}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Mínimo 10 caracteres explicando por qué se elimina"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <p className={`text-[11px] mt-1 ${motivo.trim().length >= 10 ? 'text-gray-500' : 'text-red-500'}`}>
              {motivo.trim().length}/10 caracteres mínimos
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
              Cancelar
            </button>
            <button type="button" onClick={handleConfirmar} disabled={saving || motivo.trim().length < 10}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Eliminando...' : 'Confirmar eliminación'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
