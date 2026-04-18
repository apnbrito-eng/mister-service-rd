import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ServicioPrecio } from '../types';
import { formatMoneda } from '../utils';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Edit, Search, Tag, Power, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

const MARCAS_SUGERIDAS = ['Whirlpool', 'Mabe', 'Frigidaire', 'General Electric', 'Genérico', 'LG', 'Samsung'];
const CATEGORIAS_SUGERIDAS = ['Reparación', 'Mantenimiento', 'Instalación', 'Conversión', 'Otro'];
const EQUIPOS_SUGERIDOS = ['Lavadora', 'Secadora', 'Nevera', 'Estufa', 'Aire', 'Extractor', 'Otro'];

export default function PreciosServicios() {
  const { userProfile } = useApp();
  const puedeEditar = puede(userProfile, 'configuracionModificar') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  const [loading, setLoading] = useState(true);
  const [precios, setPrecios] = useState<ServicioPrecio[]>([]);
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroEquipo, setFiltroEquipo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<ServicioPrecio, 'id' | 'createdAt'>>({
    marca: '', categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: '',
    precio: 0, activo: true, notas: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'precios_servicios'), orderBy('marca')),
      (snap) => {
        setPrecios(snap.docs.map(d => {
          const raw = d.data();
          return {
            id: d.id,
            marca: raw.marca || '',
            categoria: raw.categoria || '',
            equipoTipo: raw.equipoTipo || '',
            nombre: raw.nombre || '',
            precio: raw.precio || 0,
            activo: raw.activo !== false,
            createdAt: raw.createdAt?.toDate?.() || new Date(),
            updatedAt: raw.updatedAt?.toDate?.() || undefined,
            notas: raw.notas,
          } as ServicioPrecio;
        }));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const marcasDisponibles = useMemo(() => Array.from(new Set(precios.map(p => p.marca))).sort(), [precios]);
  const equiposDisponibles = useMemo(() => Array.from(new Set(precios.map(p => p.equipoTipo))).sort(), [precios]);
  const categoriasDisponibles = useMemo(() => Array.from(new Set(precios.map(p => p.categoria))).sort(), [precios]);

  const preciosFiltrados = useMemo(() => {
    return precios.filter(p => {
      if (!verInactivos && !p.activo) return false;
      if (filtroMarca && p.marca !== filtroMarca) return false;
      if (filtroEquipo && p.equipoTipo !== filtroEquipo) return false;
      if (filtroCategoria && p.categoria !== filtroCategoria) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!p.nombre.toLowerCase().includes(q) &&
            !p.marca.toLowerCase().includes(q) &&
            !p.equipoTipo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [precios, filtroMarca, filtroEquipo, filtroCategoria, busqueda, verInactivos]);

  const resetForm = () => {
    setForm({ marca: '', categoria: 'Reparación', equipoTipo: 'Lavadora', nombre: '', precio: 0, activo: true, notas: '' });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (p: ServicioPrecio) => {
    setForm({
      marca: p.marca, categoria: p.categoria, equipoTipo: p.equipoTipo,
      nombre: p.nombre, precio: p.precio, activo: p.activo, notas: p.notas || '',
    });
    setEditingId(p.id);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.marca.trim()) {
      toast.error('Marca y nombre son requeridos');
      return;
    }
    if (form.precio < 0) {
      toast.error('Precio inválido');
      return;
    }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        marca: form.marca.trim(),
        categoria: form.categoria,
        equipoTipo: form.equipoTipo,
        nombre: form.nombre.trim(),
        precio: form.precio,
        activo: form.activo,
        updatedAt: Timestamp.now(),
      };
      if (form.notas) data.notas = form.notas.trim();
      if (editingId) {
        await updateDoc(doc(db, 'precios_servicios', editingId), data);
        toast.success('Servicio actualizado');
      } else {
        data.createdAt = Timestamp.now();
        await addDoc(collection(db, 'precios_servicios'), data);
        toast.success('Servicio creado');
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el servicio');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (p: ServicioPrecio) => {
    try {
      await updateDoc(doc(db, 'precios_servicios', p.id), {
        activo: !p.activo,
        updatedAt: Timestamp.now(),
      });
      toast.success(p.activo ? 'Servicio desactivado' : 'Servicio activado');
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando catálogo de precios..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <Tag size={24} /> Precios de Servicios
          </h1>
          <p className="text-gray-500 text-sm">{preciosFiltrados.length} servicios mostrados de {precios.length} totales</p>
        </div>
        {puedeEditar && (
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus size={18} /> Agregar servicio
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative md:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, marca o equipo..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
        </div>
        <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
          <option value="">Todas las marcas</option>
          {marcasDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtroEquipo} onChange={e => setFiltroEquipo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
          <option value="">Todos los equipos</option>
          {equiposDisponibles.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
          <option value="">Todas las categorías</option>
          {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-gray-700 md:col-span-5">
          <input
            type="checkbox"
            checked={verInactivos}
            onChange={() => setVerInactivos(v => !v)}
            className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]"
          />
          Mostrar también servicios inactivos
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Marca</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Equipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Servicio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Categoría</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Precio</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {preciosFiltrados.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">Sin servicios que coincidan con los filtros</td></tr>
              ) : preciosFiltrados.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-700">{p.marca}</td>
                  <td className="px-4 py-3 text-gray-700">{p.equipoTipo}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.nombre}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{p.categoria}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#0f3460]">{formatMoneda(p.precio)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {puedeEditar ? (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} title="Editar"
                          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                          <Edit size={13} />
                        </button>
                        <button onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}
                          className={`p-2 rounded-lg transition-colors ${p.activo ? 'hover:bg-amber-50 text-amber-600' : 'hover:bg-green-50 text-green-600'}`}>
                          <Power size={13} />
                        </button>
                      </div>
                    ) : (
                      <Lock size={13} className="text-gray-300 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingId ? 'Editar servicio' : 'Agregar servicio'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Marca *</label>
              <input type="text" list="precios-marcas" value={form.marca}
                onChange={e => setForm(f => ({ ...f, marca: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              <datalist id="precios-marcas">
                {MARCAS_SUGERIDAS.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
              <select value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                {CATEGORIAS_SUGERIDAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Equipo</label>
              <select value={form.equipoTipo}
                onChange={e => setForm(f => ({ ...f, equipoTipo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                {EQUIPOS_SUGERIDOS.map(eq => <option key={eq} value={eq}>{eq}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio (RD$)</label>
              <input type="number" min={0} step={50} value={form.precio}
                onChange={e => setForm(f => ({ ...f, precio: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del servicio *</label>
            <input type="text" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas (opcional)</label>
            <textarea rows={2} value={form.notas || ''}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.activo}
              onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
              className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
            Servicio activo (visible para cotizar)
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
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
