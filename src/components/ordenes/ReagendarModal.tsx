import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio } from '../../types';
import {
  faseLabel, formatFecha, HORARIOS, HORARIOS_LABEL,
} from '../../utils';
import { confirmarReasignacion, consultarDisponibilidadReagendar, previewReasignacion, type DisponibilidadReagendar } from '../../services/reasignacion.service';
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
  const fechaActualMs = orden.fechaCita?.getTime() ?? null;
  const [tecnicos, setTecnicos] = useState<{ uid: string; nombre: string }[]>([]);
  const [tecnico, setTecnico] = useState('');
  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadReagendar | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [errorAgenda, setErrorAgenda] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [motivo, setMotivo] = useState('Reagendada por pieza pendiente');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const hoy = format(new Date(), 'yyyy-MM-dd');
      setFecha(hoy);
      setHora('');
      setMotivo('');
      setTecnico(orden.tecnicoId || '');
    }
  }, [isOpen, orden.id, orden.tecnicoId]);

  useEffect(() => {
    if (!isOpen) return;
    let vigente = true;
    getDocs(collection(db, 'personal')).then(snapshot => {
      if (!vigente) return;
      const lista = snapshot.docs.filter(d => {
        const p = d.data();
        return p.rol === 'tecnico' && p.activo !== false && !p.eliminado && p.uid;
      }).map(d => ({ uid: String(d.data().uid), nombre: String(d.data().nombre || 'Técnico') }));
      setTecnicos(lista);
      const actual = snapshot.docs.find(d => d.id === orden.tecnicoId || d.data().uid === orden.tecnicoId);
      if (actual?.data().uid) setTecnico(String(actual.data().uid));
    }).catch(() => { if (vigente) setErrorAgenda('No se pudo consultar la lista de técnicos.'); });
    return () => { vigente = false; };
  }, [isOpen, orden.tecnicoId]);

  const peticion = (nuevaFechaCitaMs: number) => ({
    ordenId: orden.id, destinoUid: tecnico, origen: 'reagendar' as const, nuevaFechaCitaMs,
    esperado: { tecnicoId: orden.tecnicoId || null, fase: orden.fase, fechaCitaMs: fechaActualMs },
    motivo: motivo.trim(),
  });

  useEffect(() => {
    setDisponibilidad(null);
    setHora('');
    if (!isOpen || !tecnico || !fecha) return;
    let vigente = true;
    setConsultando(true);
    setErrorAgenda('');
    // La hora 18 permite consultar también los espacios que quedan hoy.
    consultarDisponibilidadReagendar({
      ordenId: orden.id, destinoUid: tecnico, origen: 'reagendar',
      nuevaFechaCitaMs: new Date(`${fecha}T18:00:00-04:00`).getTime(),
      esperado: { tecnicoId: orden.tecnicoId || null, fase: orden.fase, fechaCitaMs: fechaActualMs },
    }).then(data => { if (vigente) setDisponibilidad(data); })
      .catch(e => { if (vigente) setErrorAgenda(e instanceof Error ? e.message : 'No se pudo consultar la agenda.'); })
      .finally(() => { if (vigente) setConsultando(false); });
    return () => { vigente = false; };
  }, [isOpen, tecnico, fecha, orden.id, orden.tecnicoId, orden.fase, fechaActualMs]);

  const handleConfirmar = async () => {
    if (!fecha || !hora || !tecnico || !motivo.trim() || saving) return;
    setSaving(true);
    try {
      const nuevaFechaCita = new Date(`${fecha}T${hora}:00-04:00`);
      const preview = await previewReasignacion(peticion(nuevaFechaCita.getTime()));
      if (preview.conflictos.length) {
        setHora('');
        throw new Error('El técnico tiene otra cita en ese horario. Selecciona otra hora.');
      }
      await confirmarReasignacion(preview.previewId, { motivo: motivo.trim() });
      toast.success(`Orden reagendada para ${formatFecha(nuevaFechaCita)}`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reagendar la orden');
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
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reagendar-tecnico">Técnico *</label>
          <select id="reagendar-tecnico" value={tecnico} onChange={e => setTecnico(e.target.value)} disabled={saving} className="w-full border rounded-lg p-2">
            <option value="">Selecciona un técnico</option>
            {tecnicos.map(t => <option key={t.uid} value={t.uid}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nueva fecha *</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              disabled={saving}
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
                disabled={saving || consultando || !disponibilidad?.horarios.find(slot => slot.hora === h)?.disponible}
                title={disponibilidad?.horarios.find(slot => slot.hora === h)?.citas.map(c => `${c.clienteNombre} (${c.duracionMin} min)`).join(', ')}
                onClick={() => setHora(h)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  hora === h
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-primary-medium'
                }`}
              >
                {HORARIOS_LABEL[h] || h}
              </button>
            ))}
          </div>
        </div>

        {consultando && <p role="status" className="text-sm">Consultando agenda real…</p>}
        {errorAgenda && <p role="alert" className="text-sm text-red-700">{errorAgenda}</p>}
        {disponibilidad && <div className="text-sm text-gray-600">
          <p>Duración prevista: {disponibilidad.duracionMin} minutos. Horas ocupadas o pasadas deshabilitadas. No incluye tiempo de traslado.</p>
          {Array.from(new Map(disponibilidad.horarios.flatMap(h => h.citas).map(c => [c.ordenId, c])).values()).map(c => <p key={c.ordenId}>{formatFecha(new Date(c.fechaCitaMs))} · {c.clienteNombre} · {c.duracionMin} min</p>)}
        </div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
          <textarea
            disabled={saving}
            maxLength={300}
            rows={2}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej: Pieza pendiente, reagendada para cuando llegue."
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
            disabled={saving || consultando || !disponibilidad || !fecha || !hora || !tecnico || !motivo.trim()}
            className="px-5 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Confirmar reagendamiento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
