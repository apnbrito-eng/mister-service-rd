import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, Timestamp, query, orderBy, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Factura, EstadoFactura, ItemCotizacion, MetodoPago } from '../types';
import { formatMoneda, formatFechaCorta, generateNumeroFactura } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, FileText, Trash2, Check, Printer, Search, Filter, DollarSign, CalendarDays, TrendingUp, X, ChevronDown } from 'lucide-react';
import { startOfMonth, startOfDay, endOfDay, startOfYear, endOfYear, isWithinInterval, format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

const ESTADO_COLORS: Record<EstadoFactura, string> = {
  emitida: 'bg-blue-100 text-blue-700',
  pagada: 'bg-green-100 text-green-700',
  vencida: 'bg-red-100 text-red-700',
  anulada: 'bg-gray-100 text-gray-700',
};

const ESTADO_LABELS: Record<EstadoFactura, string> = {
  emitida: 'Emitida',
  pagada: 'Pagada',
  vencida: 'Vencida',
  anulada: 'Anulada',
};

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  link: 'Link',
  otro: 'Otro',
};

const METODO_PAGO_COLORS: Record<MetodoPago, string> = {
  efectivo: 'bg-green-100 text-green-700',
  transferencia: 'bg-blue-100 text-blue-700',
  tarjeta: 'bg-purple-100 text-purple-700',
  link: 'bg-indigo-100 text-indigo-700',
  otro: 'bg-gray-100 text-gray-700',
};

const FILTROS: { label: string; value: EstadoFactura | 'todas' }[] = [
  { label: 'Todas', value: 'todas' },
  { label: 'Emitida', value: 'emitida' },
  { label: 'Pagada', value: 'pagada' },
  { label: 'Vencida', value: 'vencida' },
  { label: 'Anulada', value: 'anulada' },
];

export default function Facturas() {
  const [loading, setLoading] = useState(true);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState<EstadoFactura | 'todas'>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [yearSelected, setYearSelected] = useState(new Date().getFullYear());

  const [form, setForm] = useState({
    clienteNombre: '',
    ordenNumero: '',
    notas: '',
    metodoPago: '' as MetodoPago | '',
    bancoDestino: '',
    items: [{ descripcion: '', cantidad: 1, precio: 0 }] as ItemCotizacion[],
  });

  // Real-time listener
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'facturas'), orderBy('createdAt', 'desc')),
      (snap) => {
        setFacturas(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            fechaEmision: data.fechaEmision?.toDate?.() || new Date(),
            fechaVencimiento: data.fechaVencimiento?.toDate?.() || null,
            fechaPago: data.fechaPago?.toDate?.() || null,
            createdAt: data.createdAt?.toDate?.() || new Date(),
          } as Factura;
        }));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const hoyInicio = startOfDay(now);
    const hoyFin = endOfDay(now);
    const mesInicio = startOfMonth(now);
    const anioInicio = startOfYear(new Date(yearSelected, 0, 1));
    const anioFin = endOfYear(new Date(yearSelected, 0, 1));

    const pagadasAnio = facturas.filter(f =>
      f.estado === 'pagada' &&
      f.fechaPago &&
      isWithinInterval(f.fechaPago, { start: anioInicio, end: anioFin })
    );
    const totalCobradoAnual = pagadasAnio.reduce((s, f) => s + f.total, 0);

    const emitidasHoy = facturas.filter(f =>
      isWithinInterval(f.fechaEmision, { start: hoyInicio, end: hoyFin })
    ).length;

    const emitidasMes = facturas.filter(f =>
      f.fechaEmision >= mesInicio
    ).length;

    const pagadasMes = facturas.filter(f =>
      f.estado === 'pagada' && f.fechaPago && f.fechaPago >= mesInicio
    );
    const totalPagadasMes = pagadasMes.reduce((s, f) => s + f.total, 0);

    return { totalCobradoAnual, emitidasHoy, emitidasMes, pagadasMesCount: pagadasMes.length, totalPagadasMes };
  }, [facturas, yearSelected]);

  // Filtered list
  const facturasFiltradas = useMemo(() => {
    let lista = facturas;
    if (filtro !== 'todas') {
      lista = lista.filter(f => f.estado === filtro);
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      lista = lista.filter(f =>
        f.clienteNombre.toLowerCase().includes(q) ||
        f.numero.toLowerCase().includes(q)
      );
    }
    return lista;
  }, [facturas, filtro, busqueda]);

  // Form helpers
  const total = form.items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { descripcion: '', cantidad: 1, precio: 0 }] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, field: keyof ItemCotizacion, value: any) => {
    setForm(f => ({
      ...f,
      items: f.items.map((item, idx) => idx === i ? { ...item, [field]: value } : item),
    }));
  };

  const resetForm = () => setForm({
    clienteNombre: '', ordenNumero: '', notas: '',
    metodoPago: '', bancoDestino: '',
    items: [{ descripcion: '', cantidad: 1, precio: 0 }],
  });

  // Generate unique number via Firestore counter
  const getNextNumero = async (): Promise<string> => {
    const counterRef = doc(db, 'counters', 'facturas');
    let newCount = 0;
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (counterDoc.exists()) {
        newCount = (counterDoc.data().count || 0) + 1;
        transaction.update(counterRef, { count: newCount });
      } else {
        newCount = 1;
        transaction.set(counterRef, { count: newCount });
      }
    });
    return generateNumeroFactura(newCount - 1);
  };

  // Create factura
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre.trim()) { toast.error('El nombre del cliente es requerido'); return; }
    if (form.items.some(i => !i.descripcion.trim())) { toast.error('Completa la descripción de todos los items'); return; }
    if (total <= 0) { toast.error('El total debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      const numero = await getNextNumero();
      const docData: Record<string, unknown> = {
        numero,
        clienteNombre: form.clienteNombre.trim(),
        ordenNumero: form.ordenNumero.trim() || null,
        items: form.items,
        total,
        estado: 'emitida' as EstadoFactura,
        fechaEmision: Timestamp.now(),
        notas: form.notas.trim() || null,
        createdAt: Timestamp.now(),
      };
      if (form.metodoPago) docData.metodoPago = form.metodoPago;
      if (form.metodoPago === 'transferencia' && form.bancoDestino.trim()) {
        docData.bancoDestino = form.bancoDestino.trim();
      }
      await addDoc(collection(db, 'facturas'), docData);
      toast.success(`Factura ${numero} creada`);
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al crear la factura');
    } finally {
      setSaving(false);
    }
  };

  // Mark as paid
  const handleMarcarPagada = async (factura: Factura) => {
    try {
      await updateDoc(doc(db, 'facturas', factura.id), {
        estado: 'pagada',
        fechaPago: Timestamp.now(),
      });
      toast.success(`Factura ${factura.numero} marcada como pagada`);
    } catch {
      toast.error('Error al actualizar la factura');
    }
  };

  // Mark as voided
  const handleAnular = async (factura: Factura) => {
    if (!confirm(`¿Anular la factura ${factura.numero}?`)) return;
    try {
      await updateDoc(doc(db, 'facturas', factura.id), {
        estado: 'anulada',
      });
      toast.success(`Factura ${factura.numero} anulada`);
    } catch {
      toast.error('Error al anular la factura');
    }
  };

  // Delete
  const handleDelete = async (factura: Factura) => {
    if (!confirm(`¿Eliminar la factura ${factura.numero}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'facturas', factura.id));
      toast.success('Factura eliminada');
    } catch {
      toast.error('Error al eliminar la factura');
    }
  };

  // Print
  const handlePrint = (factura: Factura) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Factura ${factura.numero}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f3460; padding-bottom: 20px; margin-bottom: 25px; }
        .header h1 { color: #0f3460; font-size: 24px; margin-bottom: 4px; }
        .header .company { font-size: 13px; color: #666; }
        .header .factura-info { text-align: right; }
        .header .factura-num { font-size: 20px; font-weight: bold; color: #0f3460; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
        .meta-section { background: #f8f9fa; padding: 15px; border-radius: 8px; }
        .meta-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
        .meta-section p { font-size: 14px; margin-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #0f3460; color: white; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { border-bottom: 1px solid #eee; padding: 10px 12px; font-size: 13px; }
        tr:last-child td { border-bottom: none; }
        .text-right { text-align: right; }
        .total-row { background: #f0f7ff; }
        .total-row td { font-weight: bold; font-size: 16px; color: #0f3460; padding: 14px 12px; }
        .notas { margin-top: 25px; padding: 15px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 13px; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
        .estado { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }
        .estado-emitida { background: #dbeafe; color: #1d4ed8; }
        .estado-pagada { background: #dcfce7; color: #16a34a; }
        .estado-vencida { background: #fee2e2; color: #dc2626; }
        .estado-anulada { background: #f3f4f6; color: #6b7280; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <div>
          <h1>Mister Service RD</h1>
          <p class="company">Reparación de Electrodomésticos</p>
          <p class="company">Santo Domingo, República Dominicana</p>
        </div>
        <div class="factura-info">
          <p class="factura-num">${factura.numero}</p>
          <span class="estado estado-${factura.estado}">${ESTADO_LABELS[factura.estado]}</span>
        </div>
      </div>
      <div class="meta">
        <div class="meta-section">
          <h3>Cliente</h3>
          <p><strong>${factura.clienteNombre}</strong></p>
          ${factura.ordenNumero ? `<p>Orden: ${factura.ordenNumero}</p>` : ''}
        </div>
        <div class="meta-section">
          <h3>Detalles</h3>
          <p>Emisión: ${formatFechaCorta(factura.fechaEmision)}</p>
          ${factura.fechaVencimiento ? `<p>Vencimiento: ${formatFechaCorta(factura.fechaVencimiento)}</p>` : ''}
          ${factura.fechaPago ? `<p>Pagada: ${formatFechaCorta(factura.fechaPago)}</p>` : ''}
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Descripción</th><th class="text-right">Cant.</th><th class="text-right">Precio Unit.</th><th class="text-right">Subtotal</th></tr>
        </thead>
        <tbody>
          ${factura.items.map(i => `
            <tr>
              <td>${i.descripcion}</td>
              <td class="text-right">${i.cantidad}</td>
              <td class="text-right">RD$${i.precio.toLocaleString('es-DO')}</td>
              <td class="text-right">RD$${(i.cantidad * i.precio).toLocaleString('es-DO')}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="3" class="text-right">TOTAL</td>
            <td class="text-right">RD$${factura.total.toLocaleString('es-DO')}</td>
          </tr>
        </tbody>
      </table>
      ${factura.notas ? `<div class="notas"><strong>Notas:</strong> ${factura.notas}</div>` : ''}
      <div class="footer">
        <p>Mister Service RD &middot; Santo Domingo, República Dominicana</p>
        <p>Gracias por su preferencia</p>
      </div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  // Year options for dropdown
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  }, []);

  if (loading) return <LoadingSpinner fullPage text="Cargando facturas..." />;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Facturas</h1>
          <p className="text-gray-500 text-sm">{facturas.length} facturas</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={18} /> Nueva Factura
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total cobrado anual */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <DollarSign size={18} className="text-green-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cobrado Anual</span>
            </div>
            <select
              value={yearSelected}
              onChange={e => setYearSelected(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a5fa8]"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <p className="text-xl font-bold text-[#0f3460]">{formatMoneda(stats.totalCobradoAnual)}</p>
        </div>

        {/* Emitidas hoy */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <CalendarDays size={18} className="text-blue-600" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Emitidas Hoy</span>
          </div>
          <p className="text-xl font-bold text-[#0f3460]">{stats.emitidasHoy}</p>
        </div>

        {/* Emitidas mes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <FileText size={18} className="text-purple-600" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Emitidas Mes</span>
          </div>
          <p className="text-xl font-bold text-[#0f3460]">{stats.emitidasMes}</p>
        </div>

        {/* Pagadas mes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <TrendingUp size={18} className="text-emerald-600" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pagadas Mes</span>
          </div>
          <p className="text-xl font-bold text-[#0f3460]">{stats.pagadasMesCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatMoneda(stats.totalPagadasMes)}</p>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {FILTROS.map(f => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filtro === f.value
                  ? 'bg-[#0f3460] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
        </div>
      </div>

      {/* Table */}
      {facturasFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">
            {busqueda || filtro !== 'todas' ? 'No se encontraron facturas con los filtros aplicados' : 'Sin facturas registradas'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">#Factura</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orden</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto (RD$)</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha Emisión</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha Pago</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturasFiltradas.map(factura => (
                  <tr key={factura.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-sm font-bold text-[#0f3460]">{factura.numero}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-gray-900">{factura.clienteNombre}</span>
                        {factura.metodoPago && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full w-fit ${METODO_PAGO_COLORS[factura.metodoPago]}`}>
                            {METODO_PAGO_LABELS[factura.metodoPago]}
                            {factura.metodoPago === 'transferencia' && factura.bancoDestino ? ` · ${factura.bancoDestino}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {factura.ordenNumero ? (
                        <span className="font-mono text-xs text-gray-600">{factura.ordenNumero}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-semibold text-gray-900">{formatMoneda(factura.total)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${ESTADO_COLORS[factura.estado]}`}>
                        {ESTADO_LABELS[factura.estado]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {formatFechaCorta(factura.fechaEmision)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {factura.fechaPago ? formatFechaCorta(factura.fechaPago) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {factura.estado === 'emitida' && (
                          <button
                            onClick={() => handleMarcarPagada(factura)}
                            title="Marcar como pagada"
                            className="flex items-center gap-1 px-2 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                          >
                            <Check size={13} /> Pagada
                          </button>
                        )}
                        <button
                          onClick={() => handlePrint(factura)}
                          title="Imprimir"
                          className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
                        >
                          <Printer size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(factura)}
                          title="Eliminar"
                          className="flex items-center gap-1 px-2 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title="Nueva Factura"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <input
                type="text"
                value={form.clienteNombre}
                onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
                placeholder="Nombre del cliente"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orden de Servicio</label>
              <input
                type="text"
                value={form.ordenNumero}
                onChange={e => setForm(f => ({ ...f, ordenNumero: e.target.value }))}
                placeholder="Ej: OS-0001 (opcional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Items</label>
              <button type="button" onClick={addItem} className="text-xs text-[#1a5fa8] hover:underline font-medium">
                + Agregar item
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={item.descripcion}
                    onChange={e => updateItem(i, 'descripcion', e.target.value)}
                    placeholder="Descripción del servicio o pieza"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                  <input
                    type="number"
                    value={item.cantidad}
                    onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value) || 0)}
                    min={1}
                    className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                  <input
                    type="number"
                    value={item.precio}
                    onChange={e => updateItem(i, 'precio', parseFloat(e.target.value) || 0)}
                    placeholder="RD$"
                    className="w-28 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                  />
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="p-2 hover:bg-red-50 rounded-lg text-red-500">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Column labels */}
            <div className="flex gap-2 mt-1 text-[10px] text-gray-400 px-1">
              <span className="flex-1">Descripción</span>
              <span className="w-16 text-center">Cant.</span>
              <span className="w-28 text-center">Precio</span>
              {form.items.length > 1 && <span className="w-[38px]"></span>}
            </div>
            <div className="text-right mt-3 pt-3 border-t border-gray-100">
              <span className="text-lg font-bold text-[#0f3460]">Total: {formatMoneda(total)}</span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
              <select
                value={form.metodoPago}
                onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value as MetodoPago | '' }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              >
                <option value="">Sin especificar</option>
                {(Object.keys(METODO_PAGO_LABELS) as MetodoPago[]).map(m => (
                  <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>
                ))}
              </select>
            </div>
            {form.metodoPago === 'transferencia' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banco destino</label>
                <input
                  type="text"
                  value={form.bancoDestino}
                  onChange={e => setForm(f => ({ ...f, bancoDestino: e.target.value }))}
                  placeholder="Ej: Banreservas, BHD, Popular..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={2}
              placeholder="Observaciones adicionales (opcional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
            >
              {saving ? 'Guardando...' : 'Crear Factura'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
