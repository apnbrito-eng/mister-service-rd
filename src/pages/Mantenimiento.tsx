import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, getDocs, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Mantenimiento as MantenimientoType, Personal } from '../types';
import { formatFechaCorta, generarTokenPortalCliente } from '../utils';
import { siguienteNumeroOrden } from '../services/contadores.service';
import { useTiposEquipo } from '../hooks/useTiposEquipo';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Calendar, Check, X, RefreshCw } from 'lucide-react';
import { isBefore, addMonths } from 'date-fns';
import toast from 'react-hot-toast';

const FRECUENCIA_LABELS: Record<string, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export default function Mantenimiento() {
  const tiposEquipo = useTiposEquipo();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MantenimientoType[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clienteNombre: '', equipoTipo: '', frecuencia: 'trimestral',
    proximaFecha: '', tecnicoId: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'mantenimiento'), orderBy('proximaFecha', 'asc')),
      (snap) => {
        setItems(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          proximaFecha: d.data().proximaFecha?.toDate?.() || new Date(),
        } as MantenimientoType)));
        setLoading(false);
      }
    );
    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre || !form.proximaFecha) {
      toast.error('Cliente y fecha son requeridos');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'mantenimiento'), {
        clienteId: '',
        clienteNombre: form.clienteNombre,
        equipoTipo: form.equipoTipo,
        frecuencia: form.frecuencia,
        proximaFecha: Timestamp.fromDate(new Date(form.proximaFecha)),
        tecnicoId: form.tecnicoId,
        activo: true,
      });
      toast.success('Mantenimiento programado');
      setShowModal(false);
      setForm({ clienteNombre: '', equipoTipo: '', frecuencia: 'trimestral', proximaFecha: '', tecnicoId: '' });
    } catch {
      toast.error('Error');
    } finally {
      setSaving(false);
    }
  };

  // SPRINT-134 (sub-sprint Mantenimiento, 2026-05-11): cross-collection
  // mantenimiento + ordenes_servicio envuelto en writeBatch para atomicidad.
  // `siguienteNumeroOrden()` ya es transaccional internamente (counter), por lo
  // que se invoca antes del batch (lectura/escritura aislada en su propia tx).
  // El batch garantiza: o se crea la orden Y se actualiza proximaFecha, o ninguna
  // de las dos. Si el batch falla, el número de orden ya consumido queda como
  // hueco numérico (mismo comportamiento que SPRINT-133 — counter no se revierte).
  const handleGenerarOrden = async (item: MantenimientoType) => {
    try {
      const numero = await siguienteNumeroOrden();
      const ahora = Timestamp.now();
      const meses = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[item.frecuencia] || 3;
      const nextDate = addMonths(item.proximaFecha, meses);

      const batch = writeBatch(db);
      const ordenRef = doc(collection(db, 'ordenes_servicio'));
      batch.set(ordenRef, {
        numero,
        clienteId: item.clienteId || '',
        clienteNombre: item.clienteNombre,
        equipoTipo: item.equipoTipo,
        equipoMarca: '',
        descripcionFalla: `Mantenimiento programado (${FRECUENCIA_LABELS[item.frecuencia]})`,
        tecnicoId: item.tecnicoId || '',
        tecnicoNombre: '',
        responsableId: '',
        fase: 'agendado',
        estado: 'activo',
        fechaCita: Timestamp.fromDate(item.proximaFecha),
        notas: 'Generada automáticamente por mantenimiento programado',
        historialFases: [{ fase: 'agendado', timestamp: ahora, usuario: 'Sistema' }],
        // Portal del Cliente: orden nace en `agendado`, generar token.
        tokenPortalCliente: generarTokenPortalCliente(),
        createdAt: ahora,
        updatedAt: ahora,
      });
      batch.update(doc(db, 'mantenimiento', item.id), {
        proximaFecha: Timestamp.fromDate(nextDate),
      });
      await batch.commit();

      toast.success(`Orden ${numero} creada`);
    } catch {
      toast.error('Error al generar orden');
    }
  };

  const toggleActivo = async (item: MantenimientoType) => {
    await updateDoc(doc(db, 'mantenimiento', item.id), { activo: !item.activo });
    toast.success(item.activo ? 'Desactivado' : 'Activado');
  };

  const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);

  if (loading) return <LoadingSpinner fullPage text="Cargando mantenimientos..." />;

  const vencidos = items.filter(i => i.activo && isBefore(i.proximaFecha, new Date()));
  const proximos = items.filter(i => i.activo && !isBefore(i.proximaFecha, new Date()));
  const inactivos = items.filter(i => !i.activo);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0f3460]">Mantenimiento Programado</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Programar
        </button>
      </div>

      {/* Vencidos */}
      {vencidos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-red-600 mb-2 uppercase">Vencidos ({vencidos.length})</h2>
          <div className="space-y-2">
            {vencidos.map(item => (
              <MantenimientoCard key={item.id} item={item} onGenerar={handleGenerarOrden} onToggle={toggleActivo} isVencido />
            ))}
          </div>
        </div>
      )}

      {/* Próximos */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Próximos ({proximos.length})</h2>
        {proximos.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
            Sin mantenimientos programados
          </div>
        ) : (
          <div className="space-y-2">
            {proximos.map(item => (
              <MantenimientoCard key={item.id} item={item} onGenerar={handleGenerarOrden} onToggle={toggleActivo} />
            ))}
          </div>
        )}
      </div>

      {inactivos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase">Inactivos ({inactivos.length})</h2>
          <div className="space-y-2">
            {inactivos.map(item => (
              <MantenimientoCard key={item.id} item={item} onGenerar={handleGenerarOrden} onToggle={toggleActivo} />
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Programar Mantenimiento">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
            <input type="text" value={form.clienteNombre} onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo equipo</label>
              <select value={form.equipoTipo} onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="">Seleccionar...</option>
                {tiposEquipo.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
              <select value={form.frecuencia} onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                {Object.entries(FRECUENCIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Próxima fecha *</label>
              <input type="date" value={form.proximaFecha} onChange={e => setForm(f => ({ ...f, proximaFecha: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <select value={form.tecnicoId} onChange={e => setForm(f => ({ ...f, tecnicoId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="">Sin asignar</option>
                {/* @safe-tecnicoid-id: mantenimientos.tecnicoId NO está gateado por rule
                    auth.uid (firestore.rules:521-525 usa esStaffOficina). Es descriptor
                    que matchea con personal.id (lookup UI). Migración a uid es scope SPRINT-111. */}
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Programar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MantenimientoCard({ item, onGenerar, onToggle, isVencido }: {
  item: MantenimientoType; onGenerar: (i: MantenimientoType) => void;
  onToggle: (i: MantenimientoType) => void; isVencido?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4 ${
      isVencido ? 'border-red-200 bg-red-50/50' : !item.activo ? 'opacity-50 border-gray-100' : 'border-gray-100'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isVencido ? 'bg-red-100' : 'bg-[#0f3460]/10'}`}>
        <Calendar size={18} className={isVencido ? 'text-red-600' : 'text-[#0f3460]'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{item.clienteNombre}</p>
        <p className="text-xs text-gray-500">
          {item.equipoTipo} · {FRECUENCIA_LABELS[item.frecuencia]} · {formatFechaCorta(item.proximaFecha)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.activo && (
          <button onClick={() => onGenerar(item)}
            className="flex items-center gap-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
            <RefreshCw size={12} /> Generar Orden
          </button>
        )}
        <button onClick={() => onToggle(item)}
          className={`p-1.5 rounded-lg text-xs ${item.activo ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-500'}`}>
          {item.activo ? <X size={14} /> : <Check size={14} />}
        </button>
      </div>
    </div>
  );
}
