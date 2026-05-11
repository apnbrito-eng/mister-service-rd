import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, query, orderBy, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PiezaInventario, MovimientoInventario } from '../types';
import { formatMoneda, formatFecha, parsePiezaInventario } from '../utils';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Edit, Search, Boxes, Power, AlertTriangle, History, ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const CATEGORIAS_PIEZA = ['motor', 'tarjeta', 'manguera', 'correa', 'válvula', 'sensor', 'tornillería', 'otro'];

interface PiezaForm {
  nombre: string;
  codigo: string;
  descripcion: string;
  precioCompra: number;
  precioVenta: number;
  precioMayoreo: number;
  precioDetalle: number;
  stockActual: number;
  stockMinimo: number;
  proveedorSugerido: string;
  categoria: string;
  activo: boolean;
}

const initialForm: PiezaForm = {
  nombre: '', codigo: '', descripcion: '',
  precioCompra: 0, precioVenta: 0, precioMayoreo: 0, precioDetalle: 0,
  stockActual: 0, stockMinimo: 0,
  proveedorSugerido: '', categoria: 'otro', activo: true,
};

/** Redondea al múltiplo de 50 más cercano. RD-style. */
function redondear50(n: number): number {
  return Math.round(n / 50) * 50;
}

export default function Inventario() {
  const { userProfile } = useApp();
  // Editar precios y campos sensibles del modal completo: solo admin/coord
  // (matchea firestore.rules granularidad fina decisión 35 — operaria no puede
  // tocar campos de precio, ni activo, ni descripción).
  const puedeEditar = puede(userProfile, 'configuracionModificar') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';
  // Crear pieza (recepción) y ajustar stock: operaria/secretaria pueden
  // recepcionar piezas nuevas y mover stock (matchea firestore.rules
  // create: esStaffOficina y update solo stockActual+updatedAt).
  const puedeCrear = puedeEditar ||
    userProfile?.rol === 'operaria' ||
    userProfile?.rol === 'secretaria';
  const puedeAjustarStock = puedeCrear;

  const [loading, setLoading] = useState(true);
  const [piezas, setPiezas] = useState<PiezaInventario[]>([]);
  // Política H10: docs sin `precioMayoreo` ni `precioDetalle` están pre-migración.
  // En la UI editora ocultamos el campo legacy `precioVenta` apenas el doc se guarda
  // con los nuevos campos (sale del Set). Previene drift.
  const [piezasPreMigracion, setPiezasPreMigracion] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PiezaForm>(initialForm);
  const [editandoPreMigracion, setEditandoPreMigracion] = useState(false);

  // Movimientos
  const [showMovimientosModal, setShowMovimientosModal] = useState(false);
  const [piezaMovimientos, setPiezaMovimientos] = useState<PiezaInventario | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);
  const [loadingMovs, setLoadingMovs] = useState(false);

  // Ajustar stock
  const [showAjusteModal, setShowAjusteModal] = useState(false);
  const [piezaAjuste, setPiezaAjuste] = useState<PiezaInventario | null>(null);
  const [ajusteForm, setAjusteForm] = useState<{ tipo: 'entrada' | 'salida' | 'ajuste'; cantidad: number; motivo: string; notas: string }>({
    tipo: 'entrada', cantidad: 1, motivo: '', notas: '',
  });
  const [savingAjuste, setSavingAjuste] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'piezas_inventario'), orderBy('nombre')),
      (snap) => {
        const preMig = new Set<string>();
        const items = snap.docs.map(d => {
          const raw = d.data();
          if (typeof raw.precioMayoreo !== 'number' && typeof raw.precioDetalle !== 'number') {
            preMig.add(d.id);
          }
          return parsePiezaInventario(d.id, raw);
        });
        setPiezas(items);
        setPiezasPreMigracion(preMig);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const piezasFiltradas = useMemo(() => {
    return piezas.filter(p => {
      if (!p.activo && !soloAlertas) {
        // mostrar inactivos solo si el usuario explícitamente filtra alertas (raro), por ahora ocultarlos
        return false;
      }
      if (filtroCategoria && p.categoria !== filtroCategoria) return false;
      if (soloAlertas) {
        const min = p.stockMinimo ?? 0;
        if (p.stockActual > min && p.stockActual > 0) return false;
      }
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!p.nombre.toLowerCase().includes(q) && !(p.codigo || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [piezas, busqueda, filtroCategoria, soloAlertas]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setEditandoPreMigracion(false);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (p: PiezaInventario) => {
    const preMig = piezasPreMigracion.has(p.id);
    const detalleDefault = p.precioDetalle ?? p.precioVenta;
    const mayoreoDefault = p.precioMayoreo ?? redondear50(p.precioVenta * 0.85);
    setForm({
      nombre: p.nombre, codigo: p.codigo || '', descripcion: p.descripcion || '',
      precioCompra: p.precioCompra || 0,
      precioVenta: p.precioVenta || 0,
      precioDetalle: detalleDefault,
      precioMayoreo: mayoreoDefault,
      stockActual: p.stockActual, stockMinimo: p.stockMinimo || 0,
      proveedorSugerido: p.proveedorSugerido || '', categoria: p.categoria || 'otro',
      activo: p.activo,
    });
    setEditingId(p.id);
    setEditandoPreMigracion(preMig);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (form.precioDetalle < 0 || form.precioMayoreo < 0 || form.stockActual < 0) {
      toast.error('Valores numéricos inválidos');
      return;
    }
    setSaving(true);
    try {
      // Política decisión 34: al guardar, sincronizamos el legacy `precioVenta`
      // con el Detalle. Consumidores que todavía leen `precioVenta` reciben un
      // valor coherente.
      const data: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        precioVenta: form.precioDetalle,
        precioDetalle: form.precioDetalle,
        precioMayoreo: form.precioMayoreo,
        stockActual: form.stockActual,
        activo: form.activo,
        categoria: form.categoria,
        updatedAt: Timestamp.now(),
      };
      if (form.codigo) data.codigo = form.codigo.trim();
      if (form.descripcion) data.descripcion = form.descripcion.trim();
      if (form.precioCompra > 0) data.precioCompra = form.precioCompra;
      if (form.stockMinimo > 0) data.stockMinimo = form.stockMinimo;
      if (form.proveedorSugerido) data.proveedorSugerido = form.proveedorSugerido.trim();
      // Strip undefined antes del write
      const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

      if (editingId) {
        await updateDoc(doc(db, 'piezas_inventario', editingId), payload);
        toast.success('Pieza actualizada');
      } else {
        payload.createdAt = Timestamp.now();
        await addDoc(collection(db, 'piezas_inventario'), payload);
        toast.success('Pieza creada');
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar pieza');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (p: PiezaInventario) => {
    try {
      await updateDoc(doc(db, 'piezas_inventario', p.id), {
        activo: !p.activo,
        updatedAt: Timestamp.now(),
      });
      toast.success(p.activo ? 'Pieza desactivada' : 'Pieza activada');
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const openMovimientos = async (p: PiezaInventario) => {
    setPiezaMovimientos(p);
    setShowMovimientosModal(true);
    setLoadingMovs(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'movimientos_inventario'),
        where('piezaId', '==', p.id),
      ));
      const movs = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          piezaId: raw.piezaId || '',
          piezaNombre: raw.piezaNombre || '',
          tipo: raw.tipo || 'ajuste',
          cantidad: raw.cantidad || 0,
          motivo: raw.motivo || '',
          ordenId: raw.ordenId,
          ordenNumero: raw.ordenNumero,
          usuario: raw.usuario || '',
          fecha: raw.fecha?.toDate?.() || new Date(),
          notas: raw.notas,
        } as MovimientoInventario;
      });
      // Ordenar client-side por fecha desc (evita índice compuesto)
      movs.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
      setMovimientos(movs);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar movimientos');
    } finally {
      setLoadingMovs(false);
    }
  };

  const cerrarMovimientos = () => {
    setShowMovimientosModal(false);
    setPiezaMovimientos(null);
    setMovimientos([]);
  };

  const openAjuste = (p: PiezaInventario) => {
    setPiezaAjuste(p);
    setAjusteForm({ tipo: 'entrada', cantidad: 1, motivo: '', notas: '' });
    setShowAjusteModal(true);
  };

  const cerrarAjuste = () => {
    setShowAjusteModal(false);
    setPiezaAjuste(null);
    setAjusteForm({ tipo: 'entrada', cantidad: 1, motivo: '', notas: '' });
    setSavingAjuste(false);
  };

  // @safe-non-tx: SPRINT-134 follow-up (hallazgo P-003 ext, 2026-05-11).
  // Muta piezas_inventario + movimientos_inventario. Refactor pendiente a writeBatch.
  const handleConfirmarAjuste = async () => {
    if (!piezaAjuste) return;
    if (ajusteForm.cantidad <= 0) { toast.error('Cantidad inválida'); return; }
    if (!ajusteForm.motivo.trim()) { toast.error('Motivo requerido'); return; }
    setSavingAjuste(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const ahora = Timestamp.now();
      // Calcular nuevo stock
      let nuevoStock = piezaAjuste.stockActual;
      if (ajusteForm.tipo === 'entrada') nuevoStock += ajusteForm.cantidad;
      else if (ajusteForm.tipo === 'salida') nuevoStock -= ajusteForm.cantidad;
      else nuevoStock = ajusteForm.cantidad; // ajuste = nuevo total absoluto
      if (nuevoStock < 0) {
        toast.error('El stock no puede quedar negativo');
        setSavingAjuste(false);
        return;
      }
      // Registrar movimiento
      const movData: Record<string, unknown> = {
        piezaId: piezaAjuste.id,
        piezaNombre: piezaAjuste.nombre,
        tipo: ajusteForm.tipo,
        cantidad: ajusteForm.cantidad,
        motivo: ajusteForm.motivo.trim(),
        usuario,
        fecha: ahora,
      };
      if (ajusteForm.notas) movData.notas = ajusteForm.notas.trim();
      await addDoc(collection(db, 'movimientos_inventario'), movData);
      // Actualizar stock en la pieza
      await updateDoc(doc(db, 'piezas_inventario', piezaAjuste.id), {
        stockActual: nuevoStock,
        updatedAt: ahora,
      });
      toast.success('Stock actualizado');
      cerrarAjuste();
    } catch (err) {
      console.error(err);
      toast.error('Error al ajustar stock');
    } finally {
      setSavingAjuste(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando inventario..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <Boxes size={24} /> Inventario de Piezas
          </h1>
          <p className="text-gray-500 text-sm">{piezasFiltradas.length} de {piezas.length} piezas</p>
        </div>
        {puedeCrear && (
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus size={18} /> Agregar pieza
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
        </div>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
          <option value="">Todas las categorías</option>
          {CATEGORIAS_PIEZA.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={soloAlertas} onChange={() => setSoloAlertas(v => !v)}
            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
          Solo piezas con alerta de stock
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pieza</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Código</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Categoría</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Stock</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Precios</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {piezasFiltradas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">Sin piezas que coincidan con los filtros</td></tr>
              ) : piezasFiltradas.map(p => {
                const min = p.stockMinimo ?? 0;
                const sinStock = p.stockActual === 0;
                const bajoStock = !sinStock && p.stockActual <= min && min > 0;
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${sinStock ? 'bg-red-50' : bajoStock ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.nombre}</p>
                      {p.descripcion && <p className="text-[11px] text-gray-500 truncate max-w-xs">{p.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{p.codigo || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{p.categoria || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 font-semibold ${sinStock ? 'text-red-700' : bajoStock ? 'text-amber-700' : 'text-gray-900'}`}>
                        {(sinStock || bajoStock) && <AlertTriangle size={12} />}
                        {p.stockActual}
                      </span>
                      {min > 0 && <p className="text-[10px] text-gray-400">mín {min}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {piezasPreMigracion.has(p.id) ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold text-[#0f3460]">{formatMoneda(p.precioVenta)}</span>
                          <span className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Precio único</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] text-gray-500">Det. <span className="font-semibold text-[#0f3460]">{formatMoneda(p.precioDetalle ?? p.precioVenta)}</span></span>
                          <span className="text-[10px] text-gray-500">May. <span className="font-semibold text-[#0f3460]">{formatMoneda(p.precioMayoreo ?? p.precioVenta)}</span></span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openMovimientos(p)} title="Ver movimientos"
                          className="p-2 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors">
                          <History size={13} />
                        </button>
                        {puedeAjustarStock && (
                          <button onClick={() => openAjuste(p)} title="Ajustar stock"
                            className="p-2 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors">
                            <RefreshCw size={13} />
                          </button>
                        )}
                        {puedeEditar && (
                          <>
                            <button onClick={() => openEdit(p)} title="Editar"
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                              <Edit size={13} />
                            </button>
                            <button onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}
                              className="p-2 hover:bg-amber-50 rounded-lg text-amber-600 transition-colors">
                              <Power size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar pieza */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingId ? 'Editar pieza' : 'Agregar pieza'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
              <input type="text" value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código (opcional)</label>
              <input type="text" value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
              <select value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                {CATEGORIAS_PIEZA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio compra (RD$)</label>
              <input type="number" min={0} step={50} value={form.precioCompra}
                onChange={e => setForm(f => ({ ...f, precioCompra: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-medium text-gray-600 mb-1"
                title="Detalle: cliente final que compra la pieza suelta. Mayoreo: distribuidores u otros talleres que compran en volumen."
              >
                Precio Detalle (RD$) *
                <span className="ml-1 text-gray-400 text-[10px]" title="Cliente final / mostrador">ⓘ</span>
              </label>
              <input
                type="number"
                min={0}
                step={50}
                value={form.precioDetalle}
                onChange={e => {
                  const detalle = Number(e.target.value);
                  setForm(f => {
                    const mayoreoActual = f.precioMayoreo;
                    // Si admin todavía no tocó Mayoreo, sugerir 85% del Detalle redondeado.
                    const sugerirMayoreo = mayoreoActual === 0 || mayoreoActual === redondear50(f.precioDetalle * 0.85);
                    return {
                      ...f,
                      precioDetalle: detalle,
                      precioVenta: detalle,
                      precioMayoreo: sugerirMayoreo ? redondear50(detalle * 0.85) : mayoreoActual,
                    };
                  });
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Cliente final que compra la pieza suelta.</p>
            </div>
            <div>
              <label
                className="block text-xs font-medium text-gray-600 mb-1"
                title="Detalle: cliente final que compra la pieza suelta. Mayoreo: distribuidores u otros talleres que compran en volumen."
              >
                Precio Mayoreo (RD$) *
                <span className="ml-1 text-gray-400 text-[10px]" title="Distribuidores / talleres aliados">ⓘ</span>
              </label>
              <input
                type="number"
                min={0}
                step={50}
                value={form.precioMayoreo}
                onChange={e => setForm(f => ({ ...f, precioMayoreo: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Distribuidores u otros talleres en volumen.</p>
            </div>
          </div>
          {/* Política H10: campo legacy `precioVenta` solo visible si el doc todavía
              está pre-migración. Una vez admin guarda con los nuevos campos, oculto. */}
          {editandoPreMigracion && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <label className="block text-xs font-medium text-amber-800 mb-1">
                Precio venta legacy (RD$) — solo lectura
              </label>
              <input
                type="number"
                value={form.precioVenta}
                readOnly
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 text-amber-900"
              />
              <p className="text-[10px] text-amber-700 mt-1">
                Esta pieza fue creada antes de la separación Mayoreo/Detalle. Al guardar,
                el campo legacy se sincronizará con el Precio Detalle automáticamente.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock actual</label>
              <input type="number" min={0} value={form.stockActual}
                onChange={e => setForm(f => ({ ...f, stockActual: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock mínimo (alerta)</label>
              <input type="number" min={0} value={form.stockMinimo}
                onChange={e => setForm(f => ({ ...f, stockMinimo: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor sugerido</label>
              <input type="text" value={form.proveedorSugerido}
                onChange={e => setForm(f => ({ ...f, proveedorSugerido: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <textarea rows={2} value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.activo}
              onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
              className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
            Pieza activa
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

      {/* Modal Movimientos */}
      <Modal
        isOpen={showMovimientosModal}
        onClose={cerrarMovimientos}
        title={piezaMovimientos ? `Movimientos de ${piezaMovimientos.nombre}` : 'Movimientos'}
        size="lg"
      >
        {loadingMovs ? (
          <div className="py-8 text-center text-sm text-gray-500">Cargando movimientos...</div>
        ) : movimientos.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin movimientos registrados para esta pieza.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {movimientos.map(m => (
              <div key={m.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className={`mt-0.5 p-1.5 rounded-full ${
                  m.tipo === 'entrada' ? 'bg-green-100 text-green-700' :
                  m.tipo === 'salida' ? 'bg-red-100 text-red-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {m.tipo === 'entrada' ? <ArrowUpCircle size={12} /> :
                   m.tipo === 'salida' ? <ArrowDownCircle size={12} /> :
                   <RefreshCw size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 capitalize">
                      {m.tipo} · {m.cantidad} unid.
                    </p>
                    <span className="text-xs text-gray-400">{formatFecha(m.fecha)}</span>
                  </div>
                  <p className="text-xs text-gray-700">{m.motivo}</p>
                  {m.ordenNumero && <p className="text-[11px] text-blue-600">Orden {m.ordenNumero}</p>}
                  <p className="text-[11px] text-gray-500 mt-0.5">por {m.usuario}</p>
                  {m.notas && <p className="text-[11px] text-gray-500 italic mt-0.5">{m.notas}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal Ajustar stock */}
      <Modal
        isOpen={showAjusteModal}
        onClose={cerrarAjuste}
        title={piezaAjuste ? `Ajustar stock de ${piezaAjuste.nombre}` : 'Ajustar stock'}
      >
        {piezaAjuste && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
              Stock actual: <span className="font-semibold">{piezaAjuste.stockActual}</span> unidades.
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de movimiento</label>
              <div className="grid grid-cols-3 gap-1">
                {(['entrada', 'salida', 'ajuste'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setAjusteForm(f => ({ ...f, tipo: t }))}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border capitalize transition-colors ${
                      ajusteForm.tipo === t
                        ? 'bg-[#1a5fa8] text-white border-[#1a5fa8]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#1a5fa8]'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {ajusteForm.tipo === 'entrada' && 'Suma al stock actual.'}
                {ajusteForm.tipo === 'salida' && 'Resta del stock actual.'}
                {ajusteForm.tipo === 'ajuste' && 'Reemplaza el stock por la cantidad indicada (ajuste absoluto).'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad *</label>
              <input type="number" min={1} value={ajusteForm.cantidad}
                onChange={e => setAjusteForm(f => ({ ...f, cantidad: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo *</label>
              <input type="text" value={ajusteForm.motivo}
                onChange={e => setAjusteForm(f => ({ ...f, motivo: e.target.value }))}
                placeholder="compra, devolución, conteo físico..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
              <textarea rows={2} value={ajusteForm.notas}
                onChange={e => setAjusteForm(f => ({ ...f, notas: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={cerrarAjuste} disabled={savingAjuste}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={handleConfirmarAjuste} disabled={savingAjuste}
                className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {savingAjuste ? 'Guardando...' : 'Confirmar ajuste'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
