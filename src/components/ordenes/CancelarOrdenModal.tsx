import { useState } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio, Usuario } from '../../types';
import { crearRegistroAuditoria, faseLabel, calcularExpiracionTokenPortal } from '../../utils';
import Modal from '../Modal';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenServicio | null;
  userProfile: Usuario | null;
  onCancelled?: () => void;
}

export default function CancelarOrdenModal({ isOpen, onClose, orden, userProfile, onCancelled }: Props) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    setMotivo('');
    setSaving(false);
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
      const nuevoHistorial = [
        ...orden.historialFases.map(h => ({
          fase: h.fase,
          timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        })),
        {
          fase: 'cancelado',
          timestamp: ahora,
          usuario,
          nota: `Cancelada — ${motivo.trim()}`,
        },
      ];
      const registro = crearRegistroAuditoria(
        usuario, 'cambio_fase',
        `Canceló orden — Motivo: ${motivo.trim()}`,
        'fase', faseLabel(orden.fase), 'Cancelado'
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        fase: 'cancelado',
        estadoSimple: 'cancelado',
        estado: 'cancelado',
        motivoCancelacion: motivo.trim(),
        canceladaPor: usuario,
        canceladaPorId: userProfile?.id || '',
        fechaCancelacion: ahora,
        historialFases: nuevoHistorial,
        auditoria: arrayUnion(registro),
        updatedAt: ahora,
        // SPRINT-139 (2026-05-11): el token del portal queda activo 30 días
        // más después de la cancelación para que el cliente pueda consultar.
        tokenPortalClienteExpiraEn: Timestamp.fromDate(
          calcularExpiracionTokenPortal(ahora.toDate())
        ),
      });
      toast.success('Orden cancelada con motivo registrado');
      handleClose();
      onCancelled?.();
    } catch (err) {
      console.error(err);
      toast.error('Error al cancelar la orden');
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={orden ? `Cancelar orden ${orden.numero || ''}` : 'Cancelar orden'}
    >
      {orden && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
            La orden se marcará como cancelada. Se conservará en el historial.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de cancelación *</label>
            <textarea
              rows={4}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Mínimo 10 caracteres (p. ej. cliente pospuso, no contesta, etc.)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className={`text-[11px] mt-1 ${motivo.trim().length >= 10 ? 'text-gray-500' : 'text-red-500'}`}>
              {motivo.trim().length}/10 caracteres mínimos
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
              Volver
            </button>
            <button type="button" onClick={handleConfirmar} disabled={saving || motivo.trim().length < 10}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Cancelando...' : 'Confirmar cancelación'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
