import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AvanceEmpleado, Personal } from '../types';
import { formatMoneda, formatFecha } from '../utils';
import { calcularQuincenaActual, listarUltimasQuincenas } from '../utils/comisiones';
import { suscribirAvances, crearAvance, eliminarAvance } from '../services/avances.service';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Wallet, Plus, Trash2, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Avances() {
  const { userProfile } = useApp();
  const puedeGestionar = puede(userProfile, 'avancesGestionar') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  const [loading, setLoading] = useState(true);
  const [avances, setAvances] = useState<AvanceEmpleado[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filtroQuincena, setFiltroQuincena] = useState<string>(calcularQuincenaActual(new Date()));
  const [filtroEstado, setFiltroEstado] = useState<'pendientes' | 'descontados' | 'todos'>('pendientes');
  const [filtroPersonal, setFiltroPersonal] = useState<string>('');

  const [form, setForm] = useState({
    personalId: '',
    monto: '',
    motivo: '',
    metodoPago: 'efectivo' as 'efectivo' | 'transferencia' | 'tarjeta',
    quincenaAsignada: calcularQuincenaActual(new Date()),
    notas: '',
  });

  useEffect(() => {
    const unsub = suscribirAvances(items => {
      setAvances(items);
      setLoading(false);
    });
    const unsubPersonal = onSnapshot(
      query(collection(db, 'personal'), where('activo', '==', true)),
      snap => setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal))),
    );
    return () => { unsub(); unsubPersonal(); };
  }, []);

  const quincenasDisponibles = useMemo(() => listarUltimasQuincenas(12), []);
  const empleados = personal.filter(p =>
    ['tecnico', 'operaria', 'coordinadora', 'secretaria'].includes(p.rol)
  );

  const avancesFiltrados = useMemo(() => {
    return avances.filter(a => {
      if (filtroEstado === 'pendientes' && a.descontado) return false;
      if (filtroEstado === 'descontados' && !a.descontado) return false;
      if (filtroPersonal && a.personalId !== filtroPersonal) return false;
      if (filtroQuincena && a.quincenaAsignada !== filtroQuincena) return false;
      return true;
    });
  }, [avances, filtroEstado, filtroPersonal, filtroQuincena]);

  const totales = useMemo(() => {
    const pendientes = avances.filter(a => !a.descontado);
    return {
      pendientes: pendientes.reduce((s, a) => s + a.monto, 0),
      descontados: avances.filter(a => a.descontado).reduce((s, a) => s + a.monto, 0),
      cantidad: avancesFiltrados.length,
      totalFiltro: avancesFiltrados.reduce((s, a) => s + a.monto, 0),
    };
  }, [avances, avancesFiltrados]);

  // Pendientes por empleado (para mostrar banner)
  const pendientesPorEmpleado = useMemo(() => {
    const mapa: Record<string, { nombre: string; total: number; cantidad: number }> = {};
    avances
      .filter(a => !a.descontado)
      .forEach(a => {
        if (!mapa[a.personalId]) mapa[a.personalId] = { nombre: a.personalNombre, total: 0, cantidad: 0 };
        mapa[a.personalId].total += a.monto;
        mapa[a.personalId].cantidad += 1;
      });
    return Object.entries(mapa)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [avances]);

  const resetForm = () => setForm({
    personalId: '',
    monto: '',
    motivo: '',
    metodoPago: 'efectivo',
    quincenaAsignada: calcularQuincenaActual(new Date()),
    notas: '',
  });

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.personalId) { toast.error('Selecciona un empleado'); return; }
    const monto = Number(form.monto);
    if (!monto || monto <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (!form.motivo.trim()) { toast.error('Describe el motivo del avance'); return; }

    setSaving(true);
    try {
      // @safe-tecnicoid-id: SPRINT-132 verificado — form.personalId proviene del dropdown
      // local `empleados.map(e => <option value={e.id}>)` y el campo persistido
      // `avances.personalId` no se gatea por auth.uid en firestore.rules (la rule de /avances
      // solo verifica rol). El lookup es simétrico con el dropdown y NO afecta rules.
      const emp = personal.find(p => p.id === form.personalId);
      await crearAvance({
        personalId: form.personalId,
        personalNombre: emp?.nombre || 'Sin nombre',
        personalRol: emp?.rol,
        monto,
        fecha: new Date(),
        motivo: form.motivo,
        metodoPago: form.metodoPago,
        quincenaAsignada: form.quincenaAsignada,
        creadoPorId: userProfile?.id || '',
        creadoPorNombre: userProfile?.nombre || 'Sistema',
        notas: form.notas || undefined,
      });
      toast.success(`Avance de ${formatMoneda(monto)} registrado para ${emp?.nombre}`);
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar avance');
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (a: AvanceEmpleado) => {
    if (a.descontado) {
      toast.error('No se puede eliminar un avance ya descontado de una liquidación');
      return;
    }
    if (!confirm(`¿Eliminar avance de ${formatMoneda(a.monto)} a ${a.personalNombre}?`)) return;
    try {
      await eliminarAvance(a.id);
      toast.success('Avance eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando avances..." />;

  if (!puedeGestionar) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">No tienes permisos para ver avances.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Wallet size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Avances a Empleados</h1>
            <p className="text-gray-500 text-sm">
              Préstamos/adelantos que se descuentan automáticamente de la nómina.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Registrar avance
        </button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-amber-50 rounded-2xl shadow-sm border border-amber-200 p-4">
          <p className="text-xs font-medium text-amber-700 uppercase">Pendientes de descontar</p>
          <p className="text-xl font-bold text-amber-900 mt-1">{formatMoneda(totales.pendientes)}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">{avances.filter(a => !a.descontado).length} avance(s)</p>
        </div>
        <div className="bg-green-50 rounded-2xl shadow-sm border border-green-200 p-4">
          <p className="text-xs font-medium text-green-700 uppercase">Ya descontados</p>
          <p className="text-xl font-bold text-green-900 mt-1">{formatMoneda(totales.descontados)}</p>
          <p className="text-[11px] text-green-700 mt-0.5">{avances.filter(a => a.descontado).length} avance(s)</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Filtro actual</p>
          <p className="text-xl font-bold text-primary mt-1">{formatMoneda(totales.totalFiltro)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{totales.cantidad} avance(s)</p>
        </div>
      </div>

      {/* Resumen por empleado (pendientes) */}
      {pendientesPorEmpleado.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Pendientes por empleado (a descontar en próxima nómina)
          </h3>
          <div className="flex flex-wrap gap-2">
            {pendientesPorEmpleado.map(p => (
              <div
                key={p.id}
                className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs flex items-center gap-2"
              >
                <AlertTriangle size={12} className="text-amber-600" />
                <span className="font-medium text-amber-900">{p.nombre}</span>
                <span className="text-amber-700">·</span>
                <span className="font-bold text-amber-900">{formatMoneda(p.total)}</span>
                <span className="text-amber-700">({p.cantidad})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Quincena</label>
          <select
            value={filtroQuincena}
            onChange={e => setFiltroQuincena(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          >
            <option value="">Todas las quincenas</option>
            {quincenasDisponibles.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empleado</label>
          <select
            value={filtroPersonal}
            onChange={e => setFiltroPersonal(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          >
            <option value="">Todos</option>
            {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value as 'pendientes' | 'descontados' | 'todos')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          >
            <option value="pendientes">Pendientes</option>
            <option value="descontados">Ya descontados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Empleado</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Monto</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Motivo</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Método</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Quincena</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {avancesFiltrados.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">Sin avances para los filtros seleccionados</td></tr>
              ) : avancesFiltrados.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-xs text-gray-600">{formatFecha(a.fecha)}</td>
                  <td className="px-3 py-3 text-gray-700 font-medium">{a.personalNombre}</td>
                  <td className="px-3 py-3 text-right font-bold text-orange-600">{formatMoneda(a.monto)}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{a.motivo}</td>
                  <td className="px-3 py-3 hidden md:table-cell text-xs text-gray-500 capitalize">{a.metodoPago || '—'}</td>
                  <td className="px-3 py-3 hidden lg:table-cell text-xs text-gray-500 font-mono">{a.quincenaAsignada}</td>
                  <td className="px-3 py-3 text-center">
                    {a.descontado ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        <Check size={10} /> Descontado
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {!a.descontado && (
                      <button
                        onClick={() => handleEliminar(a)}
                        title="Eliminar"
                        className="p-1.5 hover:bg-red-50 rounded text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal registrar */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title="Registrar avance a empleado"
        size="md"
      >
        <form onSubmit={handleGuardar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Empleado *</label>
            <select
              value={form.personalId}
              onChange={e => setForm(f => ({ ...f, personalId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              <option value="">— Selecciona empleado —</option>
              {empleados.map(e => (
                <option key={e.id} value={e.id}>{e.nombre} ({e.rol})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Monto *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">RD$</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0"
                  className="w-full pl-12 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Método</label>
              <select
                value={form.metodoPago}
                onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value as 'efectivo' | 'transferencia' | 'tarjeta' }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Motivo *</label>
            <input
              type="text"
              value={form.motivo}
              onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="Ej: adelanto para piezas, emergencia médica, etc."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Descontar en quincena
            </label>
            <select
              value={form.quincenaAsignada}
              onChange={e => setForm(f => ({ ...f, quincenaAsignada: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              {quincenasDisponibles.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              El avance se descontará automáticamente de la liquidación de esta quincena.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notas <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : 'Registrar avance'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
