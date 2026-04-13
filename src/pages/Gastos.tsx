import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Gasto } from '../types';
import { formatMoneda, formatFechaCorta } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, DollarSign, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { startOfMonth, startOfWeek, endOfWeek, addDays, isSameWeek, format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

const CATEGORIAS = ['repuestos', 'transporte', 'herramientas', 'servicios', 'otros'] as const;
const CATEGORIA_LABELS: Record<string, string> = {
  repuestos: 'Repuestos', transporte: 'Transporte', herramientas: 'Herramientas',
  servicios: 'Servicios', otros: 'Otros',
};
const CATEGORIA_COLORS: Record<string, string> = {
  repuestos: 'bg-blue-100 text-blue-700', transporte: 'bg-green-100 text-green-700',
  herramientas: 'bg-orange-100 text-orange-700', servicios: 'bg-purple-100 text-purple-700',
  otros: 'bg-gray-100 text-gray-700',
};

export default function Gastos() {
  const [loading, setLoading] = useState(true);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    categoria: 'repuestos' as string,
    descripcion: '', monto: '', metodoPago: 'efectivo',
  });

  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, 'gastos'), orderBy('fecha', 'desc')),
      (snap) => {
        setGastos(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          fecha: d.data().fecha?.toDate?.() || new Date(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        } as Gasto)));
        setLoading(false);
      }
    );
    const unsub2 = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
        updatedAt: d.data().updatedAt?.toDate?.() || new Date(),
      })));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const gastosMes = gastos.filter(g => g.fecha >= monthStart);
    const totalGastosMes = gastosMes.reduce((s, g) => s + g.monto, 0);
    const cerradosMes = ordenes.filter(o => o.fase === 'cerrado' && o.updatedAt >= monthStart);
    const ingresosMes = cerradosMes.length * 3500; // Estimate

    // Weekly chart data
    const weeks: { label: string; gastos: number; ingresos: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = startOfWeek(addDays(now, -7 * i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const wGastos = gastos.filter(g => g.fecha >= weekStart && g.fecha <= weekEnd).reduce((s, g) => s + g.monto, 0);
      const wOrdenes = ordenes.filter(o => o.fase === 'cerrado' && o.updatedAt >= weekStart && o.updatedAt <= weekEnd);
      weeks.push({
        label: `Sem ${format(weekStart, 'dd/MM', { locale: es })}`,
        gastos: wGastos,
        ingresos: wOrdenes.length * 3500,
      });
    }

    const byCategoria: Record<string, number> = {};
    gastosMes.forEach(g => {
      byCategoria[g.categoria] = (byCategoria[g.categoria] || 0) + g.monto;
    });

    return { totalGastosMes, ingresosMes, weeks, byCategoria };
  }, [gastos, ordenes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descripcion || !form.monto) { toast.error('Completa todos los campos'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'gastos'), {
        fecha: Timestamp.fromDate(new Date(form.fecha)),
        categoria: form.categoria,
        descripcion: form.descripcion,
        monto: parseFloat(form.monto),
        metodoPago: form.metodoPago,
        createdAt: Timestamp.now(),
      });
      toast.success('Gasto registrado');
      setShowModal(false);
      setForm({ fecha: format(new Date(), 'yyyy-MM-dd'), categoria: 'repuestos', descripcion: '', monto: '', metodoPago: 'efectivo' });
    } catch { toast.error('Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    await deleteDoc(doc(db, 'gastos', id));
    toast.success('Eliminado');
  };

  const maxWeekValue = Math.max(...stats.weeks.map(w => Math.max(w.gastos, w.ingresos)), 1);

  if (loading) return <LoadingSpinner fullPage text="Cargando gastos..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0f3460]">Gastos e Ingresos</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Registrar Gasto
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={18} className="text-red-500" />
            <span className="text-sm text-gray-500">Gastos del Mes</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{formatMoneda(stats.totalGastosMes)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={18} className="text-green-500" />
            <span className="text-sm text-gray-500">Ingresos Est. Mes</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{formatMoneda(stats.ingresosMes)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={18} className="text-[#1a5fa8]" />
            <span className="text-sm text-gray-500">Balance</span>
          </div>
          <p className={`text-2xl font-bold ${stats.ingresosMes - stats.totalGastosMes >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatMoneda(stats.ingresosMes - stats.totalGastosMes)}
          </p>
        </div>
      </div>

      {/* Weekly chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Comparativo Semanal</h2>
        <div className="flex items-end gap-4 h-48">
          {stats.weeks.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-1 items-end h-40">
                <div className="flex-1 bg-red-200 rounded-t" style={{ height: `${(w.gastos / maxWeekValue) * 100}%` }}>
                  <div className="text-[9px] text-center text-red-700 mt-1 hidden md:block">
                    {w.gastos > 0 ? formatMoneda(w.gastos) : ''}
                  </div>
                </div>
                <div className="flex-1 bg-green-200 rounded-t" style={{ height: `${(w.ingresos / maxWeekValue) * 100}%` }}>
                  <div className="text-[9px] text-center text-green-700 mt-1 hidden md:block">
                    {w.ingresos > 0 ? formatMoneda(w.ingresos) : ''}
                  </div>
                </div>
              </div>
              <span className="text-xs text-gray-500">{w.label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-4 justify-center">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-3 h-3 bg-red-200 rounded" /> Gastos
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-3 h-3 bg-green-200 rounded" /> Ingresos
          </div>
        </div>
      </div>

      {/* By category */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Gastos por Categoría (Mes)</h2>
        <div className="space-y-2">
          {Object.entries(stats.byCategoria).sort((a, b) => b[1] - a[1]).map(([cat, monto]) => (
            <div key={cat} className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full min-w-[90px] text-center ${CATEGORIA_COLORS[cat]}`}>
                {CATEGORIA_LABELS[cat]}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div className="bg-[#1a5fa8] h-3 rounded-full" style={{
                  width: `${(monto / stats.totalGastosMes) * 100}%`
                }} />
              </div>
              <span className="text-sm font-medium text-gray-700 min-w-[100px] text-right">{formatMoneda(monto)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lista gastos */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Categoría</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Descripción</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Método</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Monto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gastos.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{formatFechaCorta(g.fecha)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORIA_COLORS[g.categoria]}`}>
                      {CATEGORIA_LABELS[g.categoria]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{g.descripcion}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 capitalize">{g.metodoPago}</td>
                  <td className="px-4 py-3 text-sm font-medium text-right text-red-600">{formatMoneda(g.monto)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(g.id)} className="p-1 hover:bg-red-50 rounded text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Registrar Gasto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
            <input type="text" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto (RD$) *</label>
              <input type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
              <select value={form.metodoPago} onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
