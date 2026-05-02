import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, Timestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cotizacion, ItemCotizacion, EstadoCotizacion, OrdenServicio } from '../types';
import { formatMoneda, formatFechaCorta, generateNumeroCotizacion, parseOrden } from '../utils';
import { siguienteNumeroFactura } from '../services/contadores.service';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import CatalogoSelectorModal, { type SeleccionCatalogo } from '../components/CatalogoSelectorModal';
import EliminarOrdenButton from '../components/ordenes/EliminarOrdenButton';
import { Plus, FileText, Trash2, Edit, Check, Printer, X, Copy, Receipt, Search, Boxes, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

const ESTADO_COLORS: Record<EstadoCotizacion, string> = {
  borrador: 'bg-gray-100 text-gray-700',
  enviada: 'bg-blue-100 text-blue-700',
  aceptada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
};

const ESTADO_LABELS: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

export default function Cotizaciones() {
  const { userProfile } = useApp();
  const puedeFacturar = puede(userProfile, 'facturasCrear');
  const puedeCrear = puede(userProfile, 'cotizacionesCrear');
  const puedeModificar = puede(userProfile, 'cotizacionesModificar');
  const puedeAprobar = puede(userProfile, 'cotizacionesAprobarPrecio');
  const [convirtiendoId, setConvirtiendoId] = useState<string | null>(null);

  const handleConvertirAFactura = async (cot: Cotizacion) => {
    if (!puedeFacturar) {
      toast.error('No tienes permiso para crear facturas');
      return;
    }
    if (cot.convertida) {
      toast('Esta cotización ya fue convertida en factura', { icon: 'i' });
      return;
    }
    setConvirtiendoId(cot.id);
    try {
      const numero = await siguienteNumeroFactura();
      const facturaData: Record<string, unknown> = {
        numero,
        clienteNombre: cot.clienteNombre,
        items: cot.items,
        total: cot.total,
        estado: 'emitida',
        fechaEmision: Timestamp.now(),
        cotizacionId: cot.id,
        createdAt: Timestamp.now(),
        // Convertir cotización → factura siempre representa reparación completa.
        // El chequeo previo (RD$2,000) se factura por otra vía (sin cotización).
        tipoCierre: 'reparacion_completa',
        origen: 'post-cierre' as const,
      };
      if (cot.clienteId) facturaData.clienteId = cot.clienteId;
      if (cot.ordenId) facturaData.ordenId = cot.ordenId;
      // ordenNumero opcional — Cotizacion no lo declara, pero algunos usos pueden incluirlo
      const facturaRef = await addDoc(collection(db, 'facturas'), facturaData);

      // Descontar inventario por items con tipoItem === 'pieza'
      const itemsPieza = cot.items.filter(i => i.tipoItem === 'pieza' && i.piezaInventarioId);
      let piezasDescontadas = 0;
      const usuario = userProfile?.nombre || 'Sistema';
      const ahora = Timestamp.now();
      for (const item of itemsPieza) {
        try {
          const piezaRef = doc(db, 'piezas_inventario', item.piezaInventarioId!);
          const piezaSnap = await getDoc(piezaRef);
          if (!piezaSnap.exists()) continue;
          const stockActual: number = (piezaSnap.data().stockActual as number) || 0;
          const nuevoStock = stockActual - item.cantidad;
          await updateDoc(piezaRef, { stockActual: nuevoStock, updatedAt: ahora });
          const movData: Record<string, unknown> = {
            piezaId: item.piezaInventarioId!,
            piezaNombre: piezaSnap.data().nombre || item.descripcion,
            tipo: 'salida',
            cantidad: item.cantidad,
            motivo: 'venta_orden',
            usuario,
            fecha: ahora,
          };
          if (cot.ordenId) movData.ordenId = cot.ordenId;
          if (numero) movData.ordenNumero = numero;
          if (nuevoStock < 0) movData.notas = 'Venta con stock negativo — verificar reposición';
          await addDoc(collection(db, 'movimientos_inventario'), movData);
          piezasDescontadas++;
        } catch (err) {
          // No revertir la factura: el admin debe conciliar manualmente
          console.error('Error descontando pieza', item.piezaInventarioId, err);
        }
      }

      await updateDoc(doc(db, 'cotizaciones', cot.id), {
        convertida: true,
        facturaId: facturaRef.id,
        updatedAt: Timestamp.now(),
      });
      const sufijoInv = piezasDescontadas > 0
        ? ` · ${piezasDescontadas} pieza(s) descontadas del inventario`
        : '';
      toast.success(`Factura ${numero} creada a partir de cotización ${cot.numero}${sufijoInv}`);
    } catch (err) {
      console.error(err);
      toast.error('Error al convertir cotización en factura');
    } finally {
      setConvirtiendoId(null);
    }
  };

  const [loading, setLoading] = useState(true);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filtroEstado, setFiltroEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState<{
    clienteNombre: string;
    tecnicoNombre: string;
    notas: string;
    items: ItemCotizacion[];
    clienteId?: string;
    ordenId?: string;
    ordenNumero?: string;
  }>({
    clienteNombre: '', tecnicoNombre: '', notas: '',
    items: [{ descripcion: '', cantidad: 1, precio: 0, tipoItem: 'manual' }],
  });

  // Cache de órdenes vinculadas (para botón eliminar)
  const [ordenesVinculadas, setOrdenesVinculadas] = useState<Record<string, OrdenServicio>>({});

  // Catalog selector state
  const [showCatalogo, setShowCatalogo] = useState(false);
  const [catalogoFiltroMarca, setCatalogoFiltroMarca] = useState<string | undefined>(undefined);
  const [catalogoFiltroEquipo, setCatalogoFiltroEquipo] = useState<string | undefined>(undefined);
  const [catalogoTab, setCatalogoTab] = useState<'servicios' | 'piezas'>('servicios');

  // Recibir orden desde OrdenDetalle (Cambio 4)
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'cotizaciones'), orderBy('createdAt', 'desc')),
      (snap) => {
        setCotizaciones(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
          updatedAt: d.data().updatedAt?.toDate?.() || new Date(),
        } as Cotizacion)));
        setLoading(false);
      }
    );
    // Precargar órdenes vinculadas a cualquier cotización para el botón Eliminar
    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const map: Record<string, OrdenServicio> = {};
      snap.docs.forEach(d => {
        const o = parseOrden(d.id, d.data() as Record<string, unknown>);
        map[d.id] = o;
      });
      setOrdenesVinculadas(map);
    });
    return () => { unsub(); unsubOrdenes(); };
  }, []);

  // Detectar navegación con estado desde OrdenDetalle ("Generar cotización desde orden")
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromOrden = (location.state as any)?.fromOrden as
      { id: string; numero: string; clienteId?: string; clienteNombre: string; equipoMarca?: string; equipoTipo?: string; tecnicoNombre?: string }
      | undefined;
    if (fromOrden) {
      setForm({
        clienteNombre: fromOrden.clienteNombre,
        clienteId: fromOrden.clienteId,
        tecnicoNombre: fromOrden.tecnicoNombre || '',
        notas: '',
        items: [],
        ordenId: fromOrden.id,
        ordenNumero: fromOrden.numero,
      });
      setCatalogoFiltroMarca(fromOrden.equipoMarca);
      setCatalogoFiltroEquipo(fromOrden.equipoTipo);
      setEditingId(null);
      setShowModal(true);
      setShowCatalogo(true);
      // Limpiar el state para que F5 no relance el flujo
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = form.items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { descripcion: '', cantidad: 1, precio: 0, tipoItem: 'manual' }] }));

  const handleSeleccionCatalogo = (sel: SeleccionCatalogo) => {
    if (sel.tipo === 'servicio') {
      const s = sel.servicio;
      setForm(f => ({
        ...f,
        items: [...f.items, {
          descripcion: `${s.nombre} (${s.marca} · ${s.equipoTipo})`,
          cantidad: 1,
          precio: s.precio,
          tipoItem: 'servicio',
          servicioPrecioId: s.id,
        }],
      }));
      toast.success(`${s.nombre} agregado`);
    } else {
      const p = sel.pieza;
      const item: ItemCotizacion = {
        descripcion: p.codigo ? `${p.nombre} (${p.codigo})` : p.nombre,
        cantidad: 1,
        precio: p.precioVenta,
        tipoItem: 'pieza',
        piezaInventarioId: p.id,
      };
      if (typeof p.precioCompra === 'number') item.costoCompra = p.precioCompra;
      setForm(f => ({ ...f, items: [...f.items, item] }));
      if (p.stockActual <= 0) {
        toast(`${p.nombre} agregado (sin stock — verificar antes de facturar)`, {
          duration: 4000,
          style: { borderLeft: '4px solid #f59e0b', background: '#fffbeb', color: '#92400e' },
        });
      } else {
        toast.success(`${p.nombre} agregado (stock: ${p.stockActual})`);
      }
    }
    setShowCatalogo(false);
  };

  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, field: keyof ItemCotizacion, value: any) => {
    setForm(f => ({
      ...f,
      items: f.items.map((item, idx) => idx === i ? { ...item, [field]: value } : item),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre) { toast.error('Cliente es requerido'); return; }
    if (form.items.length === 0) { toast.error('Agrega al menos un item'); return; }
    if (form.items.some(i => !i.descripcion)) { toast.error('Completa la descripción de todos los items'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const upd: Record<string, unknown> = {
          clienteNombre: form.clienteNombre,
          tecnicoNombre: form.tecnicoNombre,
          items: form.items,
          total,
          notas: form.notas,
          updatedAt: Timestamp.now(),
        };
        if (form.ordenId) upd.ordenId = form.ordenId;
        if (form.clienteId) upd.clienteId = form.clienteId;
        await updateDoc(doc(db, 'cotizaciones', editingId), upd);
        toast.success('Cotización actualizada');
      } else {
        const numero = generateNumeroCotizacion(cotizaciones.length);
        const data: Record<string, unknown> = {
          numero,
          clienteNombre: form.clienteNombre,
          tecnicoNombre: form.tecnicoNombre,
          items: form.items,
          total,
          estado: 'borrador',
          notas: form.notas,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        if (form.ordenId) data.ordenId = form.ordenId;
        if (form.clienteId) data.clienteId = form.clienteId;
        const ref = await addDoc(collection(db, 'cotizaciones'), data);
        // Si vino desde una orden, vincular en el doc de orden también
        if (form.ordenId) {
          try {
            await updateDoc(doc(db, 'ordenes_servicio', form.ordenId), {
              cotizacionId: ref.id,
              updatedAt: Timestamp.now(),
            });
          } catch (err) {
            console.warn('No se pudo vincular cotización a la orden:', err);
          }
        }
        toast.success(`Cotización ${numero} creada · ${formatMoneda(total)}`);
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

  const resetForm = () => setForm({
    clienteNombre: '', tecnicoNombre: '', notas: '',
    items: [{ descripcion: '', cantidad: 1, precio: 0, tipoItem: 'manual' }],
  });

  const handleEdit = (cot: Cotizacion) => {
    setForm({
      clienteNombre: cot.clienteNombre,
      tecnicoNombre: cot.tecnicoNombre || '',
      notas: cot.notas || '',
      items: cot.items.length > 0 ? cot.items : [{ descripcion: '', cantidad: 1, precio: 0 }],
    });
    setEditingId(cot.id);
    setShowModal(true);
  };

  const handleChangeEstado = async (id: string, estado: EstadoCotizacion) => {
    try {
      await updateDoc(doc(db, 'cotizaciones', id), { estado, updatedAt: Timestamp.now() });
      toast.success(`Estado: ${ESTADO_LABELS[estado]}`);
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!puedeModificar) {
      toast.error('No tienes permiso para eliminar cotizaciones');
      return;
    }
    if (!confirm('¿Eliminar esta cotización?')) return;
    try {
      await deleteDoc(doc(db, 'cotizaciones', id));
      toast.success('Cotización eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const handlePrint = (cot: Cotizacion) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>${cot.numero}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}
      h1{color:#0f3460;border-bottom:2px solid #0f3460;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#0f3460;color:white}
      .total{font-size:1.2em;font-weight:bold;text-align:right;margin-top:20px}
      </style></head><body>
      <h1>Mister Service RD - Cotización ${cot.numero}</h1>
      <p><strong>Cliente:</strong> ${cot.clienteNombre}</p>
      <p><strong>Fecha:</strong> ${formatFechaCorta(cot.createdAt)}</p>
      ${cot.tecnicoNombre ? `<p><strong>Técnico:</strong> ${cot.tecnicoNombre}</p>` : ''}
      <table><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
      <tbody>${cot.items.map(i => `<tr><td>${i.descripcion}</td><td>${i.cantidad}</td><td>RD$${i.precio.toLocaleString()}</td><td>RD$${(i.cantidad * i.precio).toLocaleString()}</td></tr>`).join('')}</tbody></table>
      <p class="total">Total: RD$${cot.total.toLocaleString()}</p>
      ${cot.notas ? `<p><strong>Notas:</strong> ${cot.notas}</p>` : ''}
      <hr><p style="font-size:0.8em;color:#999;margin-top:30px">Mister Service RD · Santo Domingo, República Dominicana</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const cotizacionesFiltradas = cotizaciones.filter(c => {
    const matchEstado = !filtroEstado || c.estado === filtroEstado;
    const matchBusqueda = !busqueda || c.clienteNombre.toLowerCase().includes(busqueda.toLowerCase()) || c.numero.toLowerCase().includes(busqueda.toLowerCase());
    return matchEstado && matchBusqueda;
  });

  if (loading) return <LoadingSpinner fullPage text="Cargando cotizaciones..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Cotizaciones</h1>
          <p className="text-gray-500 text-sm">{cotizaciones.length} cotizaciones</p>
        </div>
        {puedeCrear && (
          <button onClick={() => { resetForm(); setEditingId(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Plus size={18} /> Nueva Cotización
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-2 flex-wrap">
          {['', 'borrador', 'enviada', 'aceptada', 'rechazada'].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroEstado === e ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {e === '' ? 'Todas' : ESTADO_LABELS[e as EstadoCotizacion]}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <input type="text" placeholder="Buscar por cliente o número..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-3 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
        </div>
      </div>

      {cotizacionesFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">Sin cotizaciones</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cotizacionesFiltradas.map(cot => (
            <div key={cot.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-sm font-bold text-[#0f3460]">{cot.numero}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_COLORS[cot.estado]}`}>
                      {ESTADO_LABELS[cot.estado]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{cot.clienteNombre}</p>
                  <p className="text-xs text-gray-500">{cot.items.length} items · {formatFechaCorta(cot.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-[#0f3460]">{formatMoneda(cot.total)}</p>
                </div>
              </div>
              {/* Items preview */}
              <div className="mt-3 bg-gray-50 rounded-lg p-3">
                {cot.items.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-600 py-0.5">
                    <span>{item.descripcion}</span>
                    <span>{item.cantidad} × {formatMoneda(item.precio)}</span>
                  </div>
                ))}
                {cot.items.length > 3 && <p className="text-xs text-gray-400 mt-1">+{cot.items.length - 3} más</p>}
              </div>
              {/* Actions */}
              <div className="flex gap-2 mt-3 flex-wrap items-center">
                {cot.convertida && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-medium border border-emerald-200">
                    <Check size={11} /> Facturada
                  </span>
                )}
                {cot.estado !== 'aceptada' && puedeAprobar && (
                  <button onClick={() => handleChangeEstado(cot.id, 'aceptada')}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100">
                    <Check size={12} /> Aprobar
                  </button>
                )}
                {cot.estado === 'aceptada' && !cot.convertida && puedeFacturar && (
                  <button
                    onClick={() => handleConvertirAFactura(cot)}
                    disabled={convirtiendoId === cot.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-60"
                  >
                    <Receipt size={12} />
                    {convirtiendoId === cot.id ? 'Creando...' : 'Convertir a Factura'}
                  </button>
                )}
                <button onClick={() => handlePrint(cot)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100">
                  <Printer size={12} /> Imprimir
                </button>
                <button onClick={() => { navigator.clipboard.writeText(`Cotización ${cot.numero}\nCliente: ${cot.clienteNombre}\n${cot.items.map(i => `${i.descripcion}: RD$${i.precio.toLocaleString()}`).join('\n')}\nTotal: RD$${cot.total.toLocaleString()}`); toast.success('Copiado al portapapeles'); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100">
                  <Copy size={12} /> Copiar
                </button>
                {puedeModificar && (
                  <button onClick={() => handleEdit(cot)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100">
                    <Edit size={12} /> Editar
                  </button>
                )}
                {puedeModificar && (
                  <button onClick={() => handleDelete(cot.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100">
                    <Trash2 size={12} /> Eliminar
                  </button>
                )}
                {cot.ordenId && ordenesVinculadas[cot.ordenId] && (
                  <EliminarOrdenButton
                    orden={ordenesVinculadas[cot.ordenId]}
                    variant="text"
                    className="ml-2"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingId(null); resetForm(); }}
        title={editingId ? 'Editar Cotización' : 'Nueva Cotización'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <input type="text" value={form.clienteNombre} onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <input type="text" value={form.tecnicoNombre} onChange={e => setForm(f => ({ ...f, tecnicoNombre: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="block text-sm font-medium text-gray-700">Items</label>
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => { setCatalogoTab('servicios'); setShowCatalogo(true); }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                  <Search size={12} /> Buscar en catálogo
                </button>
                <button type="button"
                  onClick={() => { setCatalogoTab('piezas'); setShowCatalogo(true); }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                  <Boxes size={12} /> Agregar pieza
                </button>
                <button type="button" onClick={addItem}
                  className="inline-flex items-center gap-1 text-xs text-[#1a5fa8] hover:underline">
                  <Plus size={12} /> Item manual
                </button>
              </div>
            </div>
            {form.items.length === 0 ? (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
                Sin items. Usa "Buscar en catálogo" o "Agregar pieza" para empezar.
              </div>
            ) : (
              <div className="space-y-2">
                {form.items.map((item, i) => {
                  const tipo = item.tipoItem || 'manual';
                  const colorBadge = tipo === 'servicio'
                    ? 'bg-blue-100 text-blue-700'
                    : tipo === 'pieza'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-600';
                  const IconBadge = tipo === 'servicio' ? Tag : tipo === 'pieza' ? Boxes : Edit;
                  const labelTipo = tipo === 'servicio' ? 'Servicio' : tipo === 'pieza' ? 'Pieza' : 'Manual';
                  return (
                    <div key={i} className="flex gap-2 items-center flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${colorBadge} shrink-0`}>
                        <IconBadge size={10} /> {labelTipo}
                      </span>
                      <input type="text" value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)}
                        placeholder="Descripción" className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                      <input type="number" value={item.cantidad} onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value) || 0)} min={1}
                        className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                      <input type="number" value={item.precio} onChange={e => updateItem(i, 'precio', parseFloat(e.target.value) || 0)}
                        placeholder="RD$" className="w-28 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                      <button type="button" onClick={() => removeItem(i)} className="p-2 hover:bg-red-50 rounded-lg text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-right mt-3">
              <span className="text-lg font-bold text-[#0f3460]">Total: {formatMoneda(total)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setEditingId(null); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Cotización'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Selector de catálogo (servicios + piezas) */}
      <CatalogoSelectorModal
        isOpen={showCatalogo}
        onClose={() => setShowCatalogo(false)}
        onSelect={handleSeleccionCatalogo}
        filtroMarcaSugerida={catalogoFiltroMarca}
        filtroEquipoSugerido={catalogoFiltroEquipo}
        tabInicial={catalogoTab}
      />
    </div>
  );
}
