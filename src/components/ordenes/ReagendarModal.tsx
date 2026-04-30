import { useState, useEffect } from 'react';
import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio } from '../../types';
import {
  crearRegistroAuditoria, faseLabel, formatFecha, HORARIOS, HORARIOS_LABEL,
  generarTokenPortalCliente,
} from '../../utils';
import { useApp } from '../../context/AppContext';
import Modal from '../Modal';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenServicio;
  onSuccess?: () => void;
}

export default function ReagendarModal({ isOpen, onClose, orden, onSuccess }: Props) {
  const { userProfile } = useApp();
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [motivo, setMotivo] = useState('Reagendada por pieza pendiente');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const hoy = format(new Date(), 'yyyy-MM-dd');
      setFecha(hoy);
      setHora('');
      setMotivo('Reagendada por pieza pendiente');
    }
  }, [isOpen]);

  const handleConfirmar = async () => {
    if (!fecha || !hora) {
      toast.error('Selecciona fecha y hora');
      return;
    }
    const nuevaFechaCita = new Date(`${fecha}T${hora}:00`);
    if (isNaN(nuevaFechaCita.getTime())) {
      toast.error('Fecha u hora inválida');
      return;
    }
    setSaving(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const ahora = Timestamp.now();
      const notaHistorial = motivo.trim() || 'Reagendada por pieza pendiente';
      const nuevoHistorial = [
        ...orden.historialFases.map(h => ({
          fase: h.fase,
          timestamp: Timestamp.fromDate(h.timestamp instanceof Date ? h.timestamp : new Date()),
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        })),
        {
          fase: 'agendado',
          timestamp: ahora,
          usuario,
          nota: notaHistorial,
        },
      ];
      const registro = crearRegistroAuditoria(
        usuario,
        'cambio_fase',
        `Reagendada para ${formatFecha(nuevaFechaCita)} — ${notaHistorial}`,
        'fechaCita',
        orden.fechaCita ? formatFecha(orden.fechaCita) : '',
        formatFecha(nuevaFechaCita),
      );
      // Portal del Cliente: si la orden nunca pasó por agendado y no tiene
      // token aún, generarlo acá. Idempotente: si ya existe, lo conservamos.
      const updatePayload: Record<string, unknown> = {
        fase: 'agendado',
        estadoSimple: 'pendiente',
        estado: 'activo',
        fechaCita: Timestamp.fromDate(nuevaFechaCita),
        reagendada: true,
        historialFases: nuevoHistorial,
        auditoria: arrayUnion(registro),
        updatedAt: ahora,
      };
      if (!orden.tokenPortalCliente) {
        updatePayload.tokenPortalCliente = generarTokenPortalCliente();
      }
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), updatePayload);
      toast.success(`Orden reagendada para ${formatFecha(nuevaFechaCita)}`);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al reagendar la orden');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Reagendar orden ${orden.numero || ''}`}>
      <div className="space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <p className="text-gray-800"><span className="font-semibold">Cliente:</span> {orden.clienteNombre}</p>
          <p className="text-gray-600 text-xs mt-1">
            <span className="font-medium">Fase actual:</span> {faseLabel(orden.fase)}
            {orden.fechaCita && (
              <> · <span className="font-medium">Cita actual:</span> {formatFecha(orden.fechaCita)}</>
            )}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nueva fecha *</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={fecha}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setFecha(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nueva hora *</label>
          <div className="grid grid-cols-5 gap-1.5">
            {HORARIOS.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHora(h)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  hora === h
                    ? 'bg-[#0f3460] text-white border-[#0f3460]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#1a5fa8]'
                }`}
              >
                {HORARIOS_LABEL[h] || h}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
          <textarea
            rows={2}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej: Pieza en stand-by, reagendada para cuando llegue."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={saving || !fecha || !hora}
            className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Confirmar reagendamiento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
