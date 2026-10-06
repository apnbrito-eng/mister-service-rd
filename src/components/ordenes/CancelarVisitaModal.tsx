import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../Modal';
import type { OrdenServicio } from '../../types';
import { cancelarVisitaOrden } from '../../services/reasignacion.service';

export default function CancelarVisitaModal({ isOpen, onClose, orden }: {
  isOpen: boolean; onClose: () => void; orden: OrdenServicio;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (isOpen) setMotivo(''); }, [isOpen, orden.id]);
  const confirmar = async () => {
    if (saving || motivo.trim().length < 10) return;
    setSaving(true);
    try {
      await cancelarVisitaOrden(orden.id, {
        tecnicoId: orden.tecnicoId || null, fase: orden.fase,
        fechaCitaMs: orden.fechaCita?.getTime() ?? null,
      }, motivo.trim());
      toast.success('Visita cancelada. La orden y su historial se conservan.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cancelar la visita.');
    } finally { setSaving(false); }
  };
  return <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title={`Cancelar visita · ${orden.clienteNombre}`}>
    <div className="space-y-4">
      <p className="text-sm">Registra lo acordado con el cliente. Se cancela esta visita y se conserva la orden para su seguimiento.</p>
      <label className="block text-sm font-medium" htmlFor="motivo-cancelar-visita">Motivo confirmado con el cliente *</label>
      <textarea id="motivo-cancelar-visita" rows={3} maxLength={300} value={motivo} disabled={saving} onChange={e => setMotivo(e.target.value)} className="w-full border rounded-lg p-2" />
      <p className="text-xs text-gray-600">Mínimo 10 caracteres.</p>
      <div className="flex justify-end gap-3">
        <button type="button" disabled={saving} onClick={onClose}>Volver</button>
        <button type="button" disabled={saving || motivo.trim().length < 10} onClick={confirmar} className="bg-red-700 text-white rounded-lg px-4 py-2 disabled:opacity-50">{saving ? 'Guardando…' : 'Confirmar cancelación de visita'}</button>
      </div>
    </div>
  </Modal>;
}
