import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Producto } from '../types';
import { formatMoneda } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Search, Plus, ShoppingBag, Edit2, Trash2, Package } from 'lucide-react';
import toast from 'react-hot-toast';

type Categoria = 'todos' | 'servicio' | 'repuesto' | 'accesorio';

const categoriaConfig: Record<string, { label: string; color: string; bg: string }> = {
  servicio: { label: 'Servicio', color: 'text-blue-700', bg: 'bg-blue-100' },
  repuesto: { label: 'Repuesto', color: 'text-orange-700', bg: 'bg-orange-100' },
  accesorio: { label: 'Accesorio', color: 'text-purple-700', bg: 'bg-purple-100' },
};

const emptyForm = {
  nombre: '',
  descripcion: '',
  precio: 0,
  categoria: 'servicio' as 'servicio' | 'repuesto' | 'accesorio',
  activo: true,
};

export default function Productos() {
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria>('todos');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'productos'), orderBy('createdAt', 'desc')),
      (snap) => {
        setProductos(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate?.() || new Date(),
          } as Producto))
        );
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = productos.filter((p) => {
    const matchCategoria = filtroCategoria === 'todos' || p.categoria === filtroCategoria;
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCategoria && matchBusqueda;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (producto: Producto) => {
    setEditingId(producto.id);
    setForm({
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      precio: producto.precio,
      categoria: producto.categoria,
      activo: producto.activo,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (form.precio < 0) {
      toast.error('El precio no puede ser negativo');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'productos', editingId), {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          precio: Number(form.precio),
          categoria: form.categoria,
          activo: form.activo,
        });
        toast.success('Producto actualizado');
      } else {
        await addDoc(collection(db, 'productos'), {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          precio: Number(form.precio),
          categoria: form.categoria,
          activo: form.activo,
          createdAt: Timestamp.now(),
        });
        toast.success('Producto creado');
      }
      setShowModal(false);
    } catch (error) {
      toast.error('Error al guardar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (producto: Producto) => {
    if (!confirm(`¿Eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'productos', producto.id));
      toast.success('Producto eliminado');
    } catch {
      toast.error('Error al eliminar el producto');
    }
  };

  const toggleActivo = async (producto: Producto) => {
    try {
      await updateDoc(doc(db, 'productos', producto.id), {
        activo: !producto.activo,
      });
      toast.success(producto.activo ? 'Producto desactivado' : 'Producto activado');
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const tabs: { key: Categoria; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'servicio', label: 'Servicios' },
    { key: 'repuesto', label: 'Repuestos' },
    { key: 'accesorio', label: 'Accesorios' },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f3460' }}>
            Catálogo de Servicios y Repuestos
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {productos.length} producto{productos.length !== 1 ? 's' : ''} registrado{productos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#1a5fa8' }}
        >
          <Plus size={18} />
          Agregar Producto
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFiltroCategoria(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtroCategoria === tab.key
                ? 'text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={filtroCategoria === tab.key ? { backgroundColor: '#0f3460' } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
      </div>

      {/* Product Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ShoppingBag size={56} strokeWidth={1.2} />
          <p className="mt-4 text-lg font-medium">No hay productos</p>
          <p className="text-sm mt-1">
            {busqueda || filtroCategoria !== 'todos'
              ? 'No se encontraron productos con los filtros aplicados'
              : 'Agrega tu primer producto al catálogo'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((producto) => {
            const cat = categoriaConfig[producto.categoria];
            return (
              <div
                key={producto.id}
                className={`rounded-2xl shadow-sm border border-gray-100 bg-white p-5 flex flex-col gap-3 transition-opacity ${
                  !producto.activo ? 'opacity-60' : ''
                }`}
              >
                {/* Category badge + Active toggle */}
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${cat.bg} ${cat.color}`}>
                    <Package size={12} />
                    {cat.label}
                  </span>
                  <button
                    onClick={() => toggleActivo(producto)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      producto.activo ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    title={producto.activo ? 'Desactivar' : 'Activar'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        producto.activo ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Name */}
                <h3 className="text-base font-bold text-gray-900 leading-tight">
                  {producto.nombre}
                </h3>

                {/* Description */}
                {producto.descripcion && (
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {producto.descripcion}
                  </p>
                )}

                {/* Price */}
                <p className="text-xl font-bold mt-auto" style={{ color: '#1a5fa8' }}>
                  {formatMoneda(producto.precio)}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => openEdit(producto)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <Edit2 size={14} />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(producto)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Editar Producto' : 'Nuevo Producto'}
      >
        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre del producto o servicio"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>

          {/* Descripcion */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Descripción del producto o servicio"
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
            />
          </div>

          {/* Precio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Precio (RD$) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.precio}
              onChange={(e) => setForm({ ...form, precio: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <select
              value={form.categoria}
              onChange={(e) =>
                setForm({ ...form, categoria: e.target.value as 'servicio' | 'repuesto' | 'accesorio' })
              }
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
            >
              <option value="servicio">Servicio</option>
              <option value="repuesto">Repuesto</option>
              <option value="accesorio">Accesorio</option>
            </select>
          </div>

          {/* Activo */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="activo-check"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="activo-check" className="text-sm text-gray-700">
              Producto activo
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2.5 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 text-sm font-medium rounded-xl text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#1a5fa8' }}
            >
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Producto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
