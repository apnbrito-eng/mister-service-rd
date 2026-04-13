import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Calendario, Personal, DiaSemana } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Calendar as CalendarIcon, Edit, Trash2, Share2, Power, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

const COLORES = [
  '#2563EB', // blue
  '#0f3460', // dark blue
  '#14b8a6', // teal
  '#22c55e', // green
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#a855f7', // purple
];

const DIAS_SEMANA: DiaSemana[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_LABORALES: DiaSemana[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const HORAS_DISPONIBLES = [
  '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM',
  '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

interface FormState {
  nombre: string;
  asignadoId: string;
  asignadoNombre: string;
  color: string;
  dias: DiaSemana[];
  horas: string[];
}

const initialForm: FormState = {
  nombre: '',
  asignadoId: '',
  asignadoNombre: '',
  color: COLORES[0],
  dias: [],
  horas: [],
};

export default function Calendarios() {
  const [loading, setLoading] = useState(true);
  const [calendarios, setCalendarios] = useState<Calendario[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'calendarios'), orderBy('createdAt', 'desc')),
      (snap) => {
        setCalendarios(snap.docs.map(d => {
          const raw = d.data();
          return {
            id: d.id,
            nombre: raw.nombre || '',
            asignadoId: raw.asignadoId || '',
            asignadoNombre: raw.asignadoNombre || '',
            color: raw.color || COLORES[0],
            activo: raw.activo !== false,
            dias: raw.dias || [],
            horas: raw.horas || [],
            createdAt: raw.createdAt?.toDate?.() || new Date(),
          } as Calendario;
        }));
        setLoading(false);
      }
    );
    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (cal: Calendario) => {
    setForm({
      nombre: cal.nombre,
      asignadoId: cal.asignadoId || '',
      asignadoNombre: cal.asignadoNombre || '',
      color: cal.color,
      dias: cal.dias,
      horas: cal.horas,
    });
    setEditingId(cal.id);
    setShowModal(true);
  };

  const toggleDia = (dia: DiaSemana) => {
    setForm(f => ({
      ...f,
      dias: f.dias.includes(dia) ? f.dias.filter(d => d !== dia) : [...f.dias, dia],
    }));
  };

  const toggleHora = (hora: string) => {
    setForm(f => ({
      ...f,
      horas: f.horas.includes(hora) ? f.horas.filter(h => h !== hora) : [...f.horas, hora],
    }));
  };

  const seleccionarLunesViernes = () => setForm(f => ({ ...f, dias: [...DIAS_LABORALES] }));
  const seleccionarTodosDias = () => setForm(f => ({ ...f, dias: [...DIAS_SEMANA] }));
  const limpiarDias = () => setForm(f => ({ ...f, dias: [] }));

  const seleccionarHorarioCompleto = () => setForm(f => ({ ...f, horas: [...HORAS_DISPONIBLES] }));
  const limpiarHoras = () => setForm(f => ({ ...f, horas: [] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('El nombre del calendario es obligatorio'); return; }
    if (form.dias.length === 0) { toast.error('Debes seleccionar al menos 1 día'); return; }
    if (form.horas.length === 0) { toast.error('Debes seleccionar al menos 1 hora'); return; }

    setSaving(true);
    try {
      // Keep dias in canonical order
      const diasOrdenados = DIAS_SEMANA.filter(d => form.dias.includes(d));
      // Keep horas in canonical order
      const horasOrdenadas = HORAS_DISPONIBLES.filter(h => form.horas.includes(h));

      const data = {
        nombre: form.nombre.trim(),
        asignadoId: form.asignadoId,
        asignadoNombre: form.asignadoNombre,
        color: form.color,
        dias: diasOrdenados,
        horas: horasOrdenadas,
      };

      if (editingId) {
        await updateDoc(doc(db, 'calendarios', editingId), data);
        toast.success('Calendario actualizado');
      } else {
        await addDoc(collection(db, 'calendarios'), {
          ...data,
          activo: true,
          createdAt: Timestamp.now(),
        });
        toast.success('Calendario creado');
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (cal: Calendario) => {
    try {
      await updateDoc(doc(db, 'calendarios', cal.id), { activo: !cal.activo });
      toast.success(cal.activo ? 'Desactivado' : 'Activado');
    } catch { toast.error('Error'); }
  };

  const handleDelete = async (cal: Calendario) => {
    if (!confirm(`¿Eliminar el calendario "${cal.nombre}"?`)) return;
    try {
      await deleteDoc(doc(db, 'calendarios', cal.id));
      toast.success('Calendario eliminado');
    } catch { toast.error('Error'); }
  };

  const handleShare = async (cal: Calendario) => {
    const url = `${window.location.origin}/cita/${cal.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado al portapapeles');
    } catch {
      window.prompt('Copia este enlace:', url);
    }
  };

  const describirDias = (dias: DiaSemana[]): string => {
    if (dias.length === 7) return 'Todos los días';
    if (dias.length === 5 && DIAS_LABORALES.every(d => dias.includes(d))) return 'Lun - Vie';
    const abreviados = { Lunes: 'Lun', Martes: 'Mar', 'Miércoles': 'Mié', Jueves: 'Jue', Viernes: 'Vie', 'Sábado': 'Sáb', Domingo: 'Dom' };
    return dias.map(d => abreviados[d]).join(', ');
  };

  const describirHoras = (horas: string[]): string => {
    if (horas.length === 0) return 'Sin horas';
    if (horas.length === HORAS_DISPONIBLES.length) return '9AM - 6PM (10 horas)';
    return `${horas.slice(0, 3).join(', ')}${horas.length > 3 ? ` +${horas.length - 3} más` : ''} (${horas.length} ${horas.length === 1 ? 'hora' : 'horas'})`;
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando calendarios..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Calendarios</h1>
          <p className="text-gray-500 text-sm">{calendarios.length} calendarios configurados</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={18} /> Crear Nuevo Calendario
        </button>
      </div>

      {calendarios.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <CalendarIcon size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 mb-4">Sin calendarios configurados</p>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={14} /> Crear primer calendario
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {calendarios.map(cal => (
            <div key={cal.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: cal.color }}>
                <CalendarIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{cal.nombre}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cal.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {cal.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Asignado a: {cal.asignadoNombre || 'Sin asignar'}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-600">
                  <span>📅 {describirDias(cal.dias)}</span>
                  <span>🕐 {describirHoras(cal.horas)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => handleShare(cal)}
                  title="Compartir enlace"
                  className="p-2 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors">
                  <Share2 size={16} />
                </button>
                <button onClick={() => handleToggleActivo(cal)}
                  title={cal.activo ? 'Desactivar' : 'Activar'}
                  className={`p-2 rounded-lg transition-colors ${cal.activo ? 'hover:bg-orange-50 text-orange-500' : 'hover:bg-green-50 text-green-500'}`}>
                  <Power size={16} />
                </button>
                <button onClick={() => openEdit(cal)}
                  title="Editar"
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                  <Edit size={16} />
                </button>
                <button onClick={() => handleDelete(cal)}
                  title="Eliminar"
                  className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal TODO EN UNO */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingId ? 'Editar Calendario' : 'Crear Nuevo Calendario'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SECCIÓN 1: Información General */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">
              1. Información General
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Calendario *</label>
                <input type="text" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Agenda de María, Calendario General"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asignado a</label>
                <select
                  value={form.asignadoId}
                  onChange={e => {
                    const p = personal.find(x => x.id === e.target.value);
                    setForm(f => ({ ...f, asignadoId: e.target.value, asignadoNombre: p?.nombre || '' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                  <option value="">Sin asignar</option>
                  {personal.filter(p => p.activo).map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} — {p.rol}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color del calendario</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-9 h-9 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-[#0f3460] scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    >
                      {form.color === c && <Check size={16} className="text-white mx-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Días Disponibles */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-1 pb-2 border-b border-gray-100">
              2. Días Disponibles
            </h3>
            <p className="text-sm text-gray-600 mb-3">¿Qué días atiende este calendario?</p>

            <div className="grid grid-cols-7 gap-2 mb-3">
              {DIAS_SEMANA.map(dia => {
                const abreviado = dia.slice(0, 3);
                const selected = form.dias.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDia(dia)}
                    className={`py-2.5 rounded-lg text-xs font-medium transition-all ${
                      selected
                        ? 'bg-[#1a5fa8] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {abreviado}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={seleccionarLunesViernes}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                Seleccionar Lunes-Viernes
              </button>
              <button type="button" onClick={seleccionarTodosDias}
                className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
                Seleccionar todos
              </button>
              <button type="button" onClick={limpiarDias}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                Limpiar
              </button>
            </div>
          </div>

          {/* SECCIÓN 3: Horas Disponibles */}
          <div>
            <h3 className="text-sm font-semibold text-[#0f3460] uppercase tracking-wide mb-1 pb-2 border-b border-gray-100">
              3. Horas Disponibles
            </h3>
            <p className="text-sm text-gray-600 mb-1">¿Qué horas ofrece este calendario?</p>
            <p className="text-xs text-gray-400 mb-3">Selecciona las horas exactas disponibles. Solo horas en punto.</p>

            <div className="grid grid-cols-5 gap-2 mb-3">
              {HORAS_DISPONIBLES.map(hora => {
                const selected = form.horas.includes(hora);
                return (
                  <button
                    key={hora}
                    type="button"
                    onClick={() => toggleHora(hora)}
                    className={`py-2.5 rounded-lg text-xs font-medium transition-all ${
                      selected
                        ? 'bg-[#1a5fa8] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {hora}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={seleccionarHorarioCompleto}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                Seleccionar horario completo (9AM-6PM)
              </button>
              <button type="button" onClick={limpiarHoras}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                Limpiar horas
              </button>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
              {saving ? 'Guardando...' : 'Guardar Calendario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
