import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Personal, Rol } from '../types';
import { formatTelefono } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Edit, UserCog, Check, X, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

const ROL_LABELS: Record<Rol, string> = {
  administrador: 'Administrador',
  secretaria: 'Secretaria',
  operaria: 'Operaria',
  tecnico: 'Técnico',
};

const ROL_COLORS: Record<Rol, string> = {
  administrador: 'bg-purple-100 text-purple-700',
  secretaria: 'bg-blue-100 text-blue-700',
  operaria: 'bg-teal-100 text-teal-700',
  tecnico: 'bg-orange-100 text-orange-700',
};

const ROLES_CON_COMISION: Rol[] = ['tecnico', 'operaria', 'secretaria'];

function comisionDefaultPorNivel(nivel: 'junior' | 'senior'): number {
  return nivel === 'senior' ? 10 : 8;
}

export default function PersonalPage() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador';
  const [loading, setLoading] = useState(true);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Marca si el usuario ya tocó el input de comisión manualmente — evita sobrescribir al cambiar nivel
  const [comisionTocada, setComisionTocada] = useState(false);

  const [form, setForm] = useState<Omit<Personal, 'id'>>({
    nombre: '', rol: 'tecnico', telefono: '', email: '', especialidad: '', zona: '', horario: '', color: '#3b82f6', disponibilidad: true, activo: true,
    nivel: 'senior', comisionPorcentaje: 10, sueldoBase: 0,
    operariaId: '', operariaNombre: '',
  });

  // Operarias/Admins activos disponibles como supervisoras de técnicos
  const operariasDisponibles = personal.filter(
    p => p.activo && (p.rol === 'operaria' || p.rol === 'administrador')
  );

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'personal'), orderBy('nombre')),
      (snap) => {
        setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.rol) { toast.error('Nombre y rol son requeridos'); return; }
    setSaving(true);
    try {
      // Omitir campos undefined para que Firestore no los rechace
      const aplicaComision = ROLES_CON_COMISION.includes(form.rol);
      const data: Record<string, unknown> = {
        nombre: form.nombre,
        rol: form.rol,
        telefono: form.telefono || '',
        email: form.email || '',
        especialidad: form.especialidad || '',
        zona: form.zona || '',
        horario: form.horario || '',
        color: form.color || '#3b82f6',
        disponibilidad: form.disponibilidad,
        activo: form.activo,
      };
      if (aplicaComision) {
        data.nivel = form.nivel || 'senior';
        data.comisionPorcentaje = typeof form.comisionPorcentaje === 'number'
          ? form.comisionPorcentaje
          : comisionDefaultPorNivel(form.nivel || 'senior');
        data.sueldoBase = typeof form.sueldoBase === 'number' ? form.sueldoBase : 0;
      }
      // Solo técnicos tienen operaria a cargo
      if (form.rol === 'tecnico' && form.operariaId) {
        data.operariaId = form.operariaId;
        data.operariaNombre = form.operariaNombre || '';
      }
      if (editingId) {
        await updateDoc(doc(db, 'personal', editingId), data);
        toast.success('Personal actualizado');
      } else {
        await addDoc(collection(db, 'personal'), { ...data, createdAt: Timestamp.now() });
        toast.success('Personal creado');
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      nombre: '', rol: 'tecnico', telefono: '', email: '', especialidad: '', zona: '', horario: '', color: '#3b82f6', disponibilidad: true, activo: true,
      nivel: 'senior', comisionPorcentaje: 10, sueldoBase: 0,
      operariaId: '', operariaNombre: '',
    });
    setComisionTocada(false);
  };

  const handleEdit = (p: Personal) => {
    setForm({
      nombre: p.nombre, rol: p.rol, telefono: p.telefono || '', email: p.email || '', especialidad: p.especialidad || '', zona: p.zona || '', horario: p.horario || '', color: p.color || '#3b82f6', disponibilidad: p.disponibilidad, activo: p.activo,
      nivel: p.nivel || 'senior',
      comisionPorcentaje: typeof p.comisionPorcentaje === 'number' ? p.comisionPorcentaje : comisionDefaultPorNivel(p.nivel || 'senior'),
      sueldoBase: typeof p.sueldoBase === 'number' ? p.sueldoBase : 0,
      operariaId: p.operariaId || '',
      operariaNombre: p.operariaNombre || '',
    });
    // Al editar, considerar el valor actual como "tocado" para no pisarlo al cambiar nivel
    setComisionTocada(true);
    setEditingId(p.id);
    setShowModal(true);
  };

  const handleNivelChange = (nivel: 'junior' | 'senior') => {
    setForm(f => {
      const nuevaComision = comisionTocada
        ? f.comisionPorcentaje
        : comisionDefaultPorNivel(nivel);
      return { ...f, nivel, comisionPorcentaje: nuevaComision };
    });
  };

  const handleRolChange = (rol: Rol) => {
    setForm(f => {
      const aplicaComision = ROLES_CON_COMISION.includes(rol);
      if (!aplicaComision) {
        return { ...f, rol };
      }
      // Si pasa a un rol con comisión y no hay valor, aplicar default
      return {
        ...f,
        rol,
        nivel: f.nivel || 'senior',
        comisionPorcentaje: typeof f.comisionPorcentaje === 'number'
          ? f.comisionPorcentaje
          : comisionDefaultPorNivel(f.nivel || 'senior'),
        sueldoBase: typeof f.sueldoBase === 'number' ? f.sueldoBase : 0,
      };
    });
  };

  const toggleActivo = async (p: Personal) => {
    try {
      await updateDoc(doc(db, 'personal', p.id), { activo: !p.activo });
      toast.success(p.activo ? 'Desactivado' : 'Activado');
    } catch { toast.error('Error'); }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando personal..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0f3460]">Personal</h1>
        <button onClick={() => { resetForm(); setEditingId(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Agregar
        </button>
      </div>

      {esAdmin && (() => {
        const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);
        const operarias = personal.filter(p => (p.rol === 'operaria' || p.rol === 'administrador') && p.activo);
        const operariasConTecnicos = operarias
          .map(op => ({
            operaria: op,
            tecnicos: tecnicos.filter(t => t.operariaId === op.id),
          }))
          .filter(g => g.tecnicos.length > 0);
        const tecnicosSinAsignar = tecnicos.filter(t => !t.operariaId);
        const hayGrupos = operariasConTecnicos.length > 0 || tecnicosSinAsignar.length > 0;

        if (!hayGrupos) return null;

        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#1a5fa8]" />
              <h2 className="text-lg font-semibold text-[#0f3460]">Grupos operaria-técnico</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {operariasConTecnicos.map(({ operaria, tecnicos: tecs }) => (
                <div key={operaria.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: operaria.color || '#0f3460' }}
                    >
                      {operaria.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{operaria.nombre}</p>
                      <p className="text-[10px] text-gray-500">{ROL_LABELS[operaria.rol]} · {tecs.length} técnico{tecs.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tecs.map(t => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
                        style={{
                          backgroundColor: `${t.color || '#3b82f6'}22`,
                          color: t.color || '#3b82f6',
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color || '#3b82f6' }} />
                        {t.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {tecnicosSinAsignar.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-amber-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">?</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-900">Sin asignar</p>
                      <p className="text-[10px] text-amber-700">{tecnicosSinAsignar.length} técnico{tecnicosSinAsignar.length !== 1 ? 's' : ''} sin operaria</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tecnicosSinAsignar.map(t => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700"
                      >
                        {t.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Nombre</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Rol</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Teléfono</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Email</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Especialidad</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Zona</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {personal.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.color || '#0f3460' }}>
                        {p.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{p.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${ROL_COLORS[p.rol]}`}>
                        {ROL_LABELS[p.rol]}
                      </span>
                      {ROLES_CON_COMISION.includes(p.rol) && p.nivel && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 w-fit">
                          {p.nivel === 'senior' ? 'Senior' : 'Junior'} · {typeof p.comisionPorcentaje === 'number' ? p.comisionPorcentaje : comisionDefaultPorNivel(p.nivel)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.telefono ? formatTelefono(p.telefono) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.email || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">{p.especialidad || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">{p.zona || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActivo(p)}
                      className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                        p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                      {p.activo ? <><Check size={10} /> Activo</> : <><X size={10} /> Inactivo</>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleEdit(p)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                      <Edit size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingId(null); resetForm(); }}
        title={editingId ? 'Editar Personal' : 'Agregar Personal'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
            <select value={form.rol} onChange={e => handleRolChange(e.target.value as Rol)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
              {(Object.keys(ROL_LABELS) as Rol[]).map(r => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
            </select>
          </div>

          {form.rol === 'tecnico' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operaria a cargo</label>
              <select
                value={form.operariaId || ''}
                onChange={e => {
                  const op = operariasDisponibles.find(o => o.id === e.target.value);
                  setForm(f => ({
                    ...f,
                    operariaId: e.target.value,
                    operariaNombre: op?.nombre || '',
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                <option value="">Sin asignar</option>
                {operariasDisponibles.map(op => (
                  <option key={op.id} value={op.id}>
                    {op.nombre} ({ROL_LABELS[op.rol]})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                La operaria de las órdenes se asignará automáticamente según este técnico.
              </p>
            </div>
          )}

          {ROLES_CON_COMISION.includes(form.rol) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-indigo-50/40 border border-indigo-100 rounded-lg p-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nivel</label>
                <select
                  value={form.nivel || 'senior'}
                  onChange={e => handleNivelChange(e.target.value as 'junior' | 'senior')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                >
                  <option value="senior">Senior</option>
                  <option value="junior">Junior</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Comisión (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.comisionPorcentaje ?? ''}
                  onChange={e => {
                    setComisionTocada(true);
                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                    setForm(f => ({ ...f, comisionPorcentaje: val }));
                  }}
                  placeholder="10"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sueldo base (RD$)</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={form.sueldoBase ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setForm(f => ({ ...f, sueldoBase: val }));
                  }}
                  placeholder="25000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Especialidad</label>
              <input type="text" value={form.especialidad} onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))}
                placeholder="Ej: Refrigeración, Lavadoras..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
              <input type="text" value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
                placeholder="Ej: Santo Domingo, DN..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horario</label>
              <input type="text" value={form.horario} onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}
                placeholder="Ej: 8:00 AM - 5:00 PM"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color en mapa</label>
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg cursor-pointer" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.disponibilidad} onChange={e => setForm(f => ({ ...f, disponibilidad: e.target.checked }))}
                className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
              Disponible
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
              Activo
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setEditingId(null); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
