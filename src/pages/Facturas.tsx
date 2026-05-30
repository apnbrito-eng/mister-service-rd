import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Factura, EstadoFactura, OrdenServicio, Personal, ServicioPrecio, PiezaInventario } from '../types';
import { formatMoneda, formatFechaCorta, parseOrden, parseFactura, parseServicioPrecio, parsePiezaInventario } from '../utils';
import { METODO_PAGO_LABELS, METODO_PAGO_COLORS } from '../utils/factura';
import { abrirWhatsApp, mensajeConduceGarantia } from '../utils/whatsapp';
import { useClientesEnVivo } from '../hooks/useClientesEnVivo';
import { eliminarComisionesDeFactura } from '../utils/comisiones';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import EliminarOrdenButton from '../components/ordenes/EliminarOrdenButton';
import FacturaCrearModal from '../components/facturas/FacturaCrearModal';
import OrdenResumenLectura from '../components/facturas/OrdenResumenLectura';
import FiltroAvanzadoFinanzas, {
  type FiltroAvanzadoFinanzasRef,
  type FiltroActivo,
} from '../components/admin/FiltroAvanzadoFinanzas';
import { Plus, FileText, Trash2, Check, Printer, DollarSign, CalendarDays, TrendingUp, Shield } from 'lucide-react';
import { startOfMonth, startOfDay, endOfDay, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';

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

export default function Facturas() {
  const { userProfile } = useApp();
  const puedeCrear = puede(userProfile, 'facturasCrear');
  const puedeModificar = puede(userProfile, 'facturasModificar');
  const puedeEliminar = puede(userProfile, 'facturasEliminar');
  const [loading, setLoading] = useState(true);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [ordenesVinculadas, setOrdenesVinculadas] = useState<Record<string, OrdenServicio>>({});
  const [showModal, setShowModal] = useState(false);
  const [yearSelected, setYearSelected] = useState(new Date().getFullYear());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Catálogos + técnicos + clientes para el FacturaCrearModal (patrón "padre
  // gordo, hijo presentacional"): el padre tiene los listeners; el hijo recibe
  // por props. Los clientes vienen del hook `useClientesEnVivo`, los demás
  // viven en useEffect porque ya estaban acá pre-C3b.
  const [catalogoServicios, setCatalogoServicios] = useState<ServicioPrecio[]>([]);
  const [catalogoPiezas, setCatalogoPiezas] = useState<PiezaInventario[]>([]);
  const [tecnicos, setTecnicos] = useState<Personal[]>([]);
  const { clientes, clientesSinTipoDefinido } = useClientesEnVivo();
  // Set local de comisiones N>1 expandidas en el panel detail.
  const [comisionExpandedId, setComisionExpandedId] = useState<string | null>(null);

  // Filtro avanzado: el componente maneja estado, persistencia y URL sync.
  // Acá solo recibimos los items filtrados via callback.
  const filtroRef = useRef<FiltroAvanzadoFinanzasRef>(null);
  const [facturasFiltradas, setFacturasFiltradas] = useState<Factura[]>([]);
  const [filtroActivo, setFiltroActivo] = useState<FiltroActivo | null>(null);

  // ─── Marcar como garantía manual ───
  const [showGarantiaManualModal, setShowGarantiaManualModal] = useState(false);
  const [facturaGarantiaManual, setFacturaGarantiaManual] = useState<Factura | null>(null);
  const [garantiaManualRazon, setGarantiaManualRazon] = useState('');
  const [savingGarantiaManual, setSavingGarantiaManual] = useState(false);
  const puedeMarcarGarantia = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';

  // Real-time listener
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'facturas'), orderBy('createdAt', 'desc')),
      (snap) => {
        setFacturas(snap.docs.map(d => parseFactura(d.id, d.data() as Record<string, unknown>)));
        setLoading(false);
      }
    );
    // Precargar órdenes vinculadas para el botón Eliminar
    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const map: Record<string, OrdenServicio> = {};
      snap.docs.forEach(d => {
        map[d.id] = parseOrden(d.id, d.data() as Record<string, unknown>);
      });
      setOrdenesVinculadas(map);
    });

    // Catálogos + técnicos para el FacturaCrearModal (C3b: vendedor por línea
    // y selector de modalidad/inventario). Los listeners viven acá para que
    // el modal sea presentacional.
    const unsubServicios = onSnapshot(
      query(collection(db, 'precios_servicios'), orderBy('marca')),
      (snap) => {
        setCatalogoServicios(snap.docs.map(d => parseServicioPrecio(d.id, d.data())));
      },
    );
    const unsubPiezas = onSnapshot(
      query(collection(db, 'piezas_inventario'), orderBy('nombre')),
      (snap) => {
        setCatalogoPiezas(snap.docs.map(d => parsePiezaInventario(d.id, d.data())));
      },
    );
    const unsubPersonal = onSnapshot(
      query(collection(db, 'personal'), orderBy('nombre')),
      (snap) => {
        setTecnicos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
      },
    );

    return () => {
      unsub();
      unsubOrdenes();
      unsubServicios();
      unsubPiezas();
      unsubPersonal();
    };
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

  // Estados de la lista para los tabs (live).
  const estadosFiltro = useMemo(() => ([
    { value: 'Todas', label: 'Todas' },
    { value: 'emitida', label: 'Emitida' },
    { value: 'pagada', label: 'Pagada' },
    { value: 'vencida', label: 'Vencida' },
    { value: 'anulada', label: 'Anulada' },
  ]), []);

  // Mark as paid
  const handleMarcarPagada = async (factura: Factura) => {
    try {
      await updateDoc(doc(db, 'facturas', factura.id), {
        estado: 'pagada',
        fechaPago: Timestamp.now(),
      });
      toast.success(`Conduce ${factura.numero} marcado como pagado`);
    } catch {
      toast.error('Error al actualizar el conduce de garantía');
    }
  };

  // Mark as voided — preservado para uso futuro, sin caller actual (eslint allowed via prefijo _)
  const _handleAnular = async (factura: Factura) => {
    if (!confirm(`¿Anular la factura ${factura.numero}?`)) return;
    try {
      await updateDoc(doc(db, 'facturas', factura.id), {
        estado: 'anulada',
      });
      toast.success(`Conduce ${factura.numero} anulado`);
    } catch {
      toast.error('Error al anular el conduce de garantía');
    }
  };

  // Delete
  const handleDelete = async (factura: Factura) => {
    if (!puedeEliminar) {
      toast.error('No tienes permiso para eliminar conduces de garantía');
      return;
    }
    if (!confirm(`¿Eliminar la factura ${factura.numero}? Esta acción no se puede deshacer.`)) return;
    try {
      // Cascade: borrar/obsoletar comisiones asociadas ANTES de borrar la
      // factura. Pendientes → delete real; liquidadas → preservar +
      // marcar `obsoletaPorEliminacionFactura: true`.
      //
      // N1 cleanup post-Conduces SIBS: el catch interno previo permitía que
      // `deleteDoc(factura)` se ejecutara aunque el helper fallara con
      // `permission-denied` o cualquier error no-transient. Eso dejaba
      // comisiones huérfanas en producción. Ahora distinguimos:
      //  - Transient (red/Firestore intermitente): seguimos y avisamos.
      //  - No-transient (permisos, datos inválidos): ABORTAMOS.
      try {
        await eliminarComisionesDeFactura({
          facturaId: factura.id,
          motivoEliminacion: `Conduce ${factura.numero} eliminado desde /admin/facturas`,
          solicitanteUid: userProfile?.id,
          solicitanteNombre: userProfile?.nombre,
        });
      } catch (cascErr) {
        console.error('[handleDelete] cascade comisiones falló:', cascErr);
        const code = (cascErr as { code?: string } | null)?.code || '';
        // Codes Firestore considerados transient (retry/intermitencia tiene sentido).
        // Resto = no-transient (permisos, lógica, datos inválidos): no podemos
        // garantizar consistencia, abortamos el delete factura.
        const TRANSIENT_CODES = new Set([
          'unavailable',
          'deadline-exceeded',
          'aborted',
          'cancelled',
          'internal',
        ]);
        const esTransient = TRANSIENT_CODES.has(code);
        if (!esTransient) {
          toast.error(
            'No se pudieron procesar las comisiones asociadas. Eliminación cancelada — revisá nómina manualmente.',
            { duration: 7000 },
          );
          return;
        }
        // Transient: continúa pero avisa. Estilo distinto a error/success
        // porque el delete sí va a ocurrir; el user solo debe verificar.
        toast(
          'Conduce eliminado, pero las comisiones se procesaron parcialmente. Revisá nómina.',
          { duration: 7000, icon: '!' },
        );
      }
      await deleteDoc(doc(db, 'facturas', factura.id));
      toast.success('Factura eliminada');
    } catch {
      toast.error('Error al eliminar el conduce de garantía');
    }
  };

  // ─── Marcar como garantía manual (admin / coord) ───
  const handleAbrirGarantiaManual = (factura: Factura) => {
    setFacturaGarantiaManual(factura);
    setGarantiaManualRazon('');
    setShowGarantiaManualModal(true);
  };

  const handleConfirmarGarantiaManual = async () => {
    if (!facturaGarantiaManual) return;
    const razon = garantiaManualRazon.trim();
    if (razon.length < 10) {
      toast.error('La razón debe tener al menos 10 caracteres');
      return;
    }
    if (!facturaGarantiaManual.garantia || facturaGarantiaManual.garantia.estado !== 'vigente') {
      toast.error('Solo se puede marcar manualmente una garantía vigente');
      return;
    }
    setSavingGarantiaManual(true);
    const ahoraTs = Timestamp.now();
    try {
      // FIX CRÍTICO: envolver update factura + creación de cita en una transacción
      // para evitar que dos admins simultáneos creen citas duplicadas.
      await runTransaction(db, async (tx) => {
        const facturaRef = doc(db, 'facturas', facturaGarantiaManual.id);
        const facturaSnap = await tx.get(facturaRef);
        const data = facturaSnap.data();
        if (!data || data.garantia?.estado !== 'vigente') {
          throw new Error('GARANTIA_YA_RECLAMADA');
        }

        // 1) Update factura: garantía pasa a reclamada con origen manual_admin
        tx.update(facturaRef, {
          'garantia.estado': 'reclamada',
          'garantia.reclamadaEn': ahoraTs,
          'garantia.problemaDescripcion': razon,
          'garantia.origen': 'manual_admin',
        });

        // 2) Crear cita_por_confirmar con tipo 'garantia' (mismo tx)
        const citaPayload: Record<string, unknown> = {
          tipo: 'garantia',
          esGarantia: true,
          referenciaFacturaId: facturaGarantiaManual.id,
          referenciaConduce: facturaGarantiaManual.numero || '',
          referenciaOrdenId: facturaGarantiaManual.ordenId || '',
          clienteId: facturaGarantiaManual.clienteId,
          clienteNombre: facturaGarantiaManual.clienteNombre,
          clienteTelefono: facturaGarantiaManual.clienteTelefono,
          telefono: facturaGarantiaManual.clienteTelefono,
          equipoTipo: facturaGarantiaManual.equipoTipo,
          equipoMarca: facturaGarantiaManual.equipoMarca,
          equipoModelo: facturaGarantiaManual.equipoModelo,
          servicio: 'Reclamo de garantía (manual)',
          falla: razon,
          descripcionProblema: razon,
          tecnicoOriginalUid: facturaGarantiaManual.tecnicoId,
          tecnicoOriginalNombre: facturaGarantiaManual.tecnicoNombre,
          origen: 'manual_admin',
          origenGarantia: 'manual_admin',
          estado: 'pendiente',
          createdAt: ahoraTs,
        };
        const citaLimpia = Object.fromEntries(
          Object.entries(citaPayload).filter(([, v]) => v !== undefined),
        );
        const nuevaCitaRef = doc(collection(db, 'citas_por_confirmar'));
        tx.set(nuevaCitaRef, citaLimpia);
      });

      // 3) Audit log — best-effort, FUERA de la transacción.
      try {
        const auditPayload: Record<string, unknown> = {
          accion: 'marcar_garantia_admin',
          solicitanteUid: userProfile?.id || null,
          solicitanteNombre: userProfile?.nombre || null,
          objetivoTipo: 'factura',
          objetivoId: facturaGarantiaManual.id,
          conduceNumero: facturaGarantiaManual.numero || null,
          ordenId: facturaGarantiaManual.ordenId || null,
          razon,
          timestamp: ahoraTs,
        };
        await addDoc(collection(db, 'auditoria_admin'),
          Object.fromEntries(Object.entries(auditPayload).filter(([, v]) => v !== undefined)),
        );
      } catch (auditErr) {
        console.warn('Audit log marcar_garantia_admin falló:', auditErr);
      }

      toast.success('Garantía marcada manualmente. Cita creada.');
      setShowGarantiaManualModal(false);
      setFacturaGarantiaManual(null);
      setGarantiaManualRazon('');
    } catch (err) {
      console.error('Error marcando garantía manual:', err);
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'GARANTIA_YA_RECLAMADA') {
        toast.error('Esta garantía ya fue reclamada por otro admin. Refrescá la página.');
        // Cerrar el modal: la UI se refresca sola por el onSnapshot de facturas.
        setShowGarantiaManualModal(false);
        setFacturaGarantiaManual(null);
        setGarantiaManualRazon('');
      } else {
        toast.error('Error al marcar la garantía');
      }
    } finally {
      setSavingGarantiaManual(false);
    }
  };

  // Print
  const handlePrint = (factura: Factura) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Conduce de Garantía ${factura.numero}</title>
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
          <p style="font-size:14px;font-weight:700;color:#0f3460;letter-spacing:2px;margin:0 0 4px;">CONDUCE DE GARANTÍA</p>
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
          <h1 className="text-2xl font-bold text-primary">Conduces de Garantía</h1>
          <p className="text-gray-500 text-sm">
            {facturasFiltradas.length === facturas.length
              ? `${facturas.length} facturas`
              : `Mostrando ${facturasFiltradas.length} de ${facturas.length} facturas`}
          </p>
        </div>
        {puedeCrear && (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-medium text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={18} /> Nuevo Conduce de Garantía
        </button>
        )}
      </div>

      {/* Summary Cards (clickeables: drilldown a filtro) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total cobrado anual */}
        <button
          type="button"
          onClick={() => filtroRef.current?.aplicarPreset('cobradoAnual')}
          title="Click para filtrar por pagadas del año seleccionado"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:border-primary-medium hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-medium"
        >
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
              onClick={e => e.stopPropagation()}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-medium"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <p className="text-xl font-bold text-primary">{formatMoneda(stats.totalCobradoAnual)}</p>
        </button>

        {/* Emitidas hoy */}
        <button
          type="button"
          onClick={() => filtroRef.current?.aplicarPreset('emitidasHoy')}
          title="Click para filtrar emitidas hoy"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:border-primary-medium hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-medium"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <CalendarDays size={18} className="text-blue-600" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Emitidas Hoy</span>
          </div>
          <p className="text-xl font-bold text-primary">{stats.emitidasHoy}</p>
        </button>

        {/* Emitidas mes */}
        <button
          type="button"
          onClick={() => filtroRef.current?.aplicarPreset('emitidasMes')}
          title="Click para filtrar emitidas del mes"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:border-primary-medium hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-medium"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <FileText size={18} className="text-purple-600" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Emitidas Mes</span>
          </div>
          <p className="text-xl font-bold text-primary">{stats.emitidasMes}</p>
        </button>

        {/* Pagadas mes */}
        <button
          type="button"
          onClick={() => filtroRef.current?.aplicarPreset('pagadasMes')}
          title="Click para filtrar pagadas del mes"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:border-primary-medium hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-medium"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <TrendingUp size={18} className="text-emerald-600" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pagadas Mes</span>
          </div>
          <p className="text-xl font-bold text-primary">{stats.pagadasMesCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatMoneda(stats.totalPagadasMes)}</p>
        </button>
      </div>

      {/* Filtro avanzado */}
      <FiltroAvanzadoFinanzas
        ref={filtroRef}
        pagina="facturas"
        items={facturas}
        estados={estadosFiltro}
        permiteCampoFecha
        yearCobradoAnual={yearSelected}
        onChange={(filtrados, activo) => {
          setFacturasFiltradas(filtrados);
          setFiltroActivo(activo);
        }}
      />

      {/* Table */}
      {facturasFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">
            {filtroActivo && filtroActivo.filtrosActivosCount > 0
              ? 'No se encontraron conduces con los filtros aplicados'
              : 'Sin conduces de garantía registrados'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">#Conduce</th>
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
                <>
                  <tr
                    key={factura.id}
                    onClick={() => setExpandedId(id => id === factura.id ? null : factura.id)}
                    className={`border-b border-gray-50 transition-colors cursor-pointer ${expandedId === factura.id ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}`}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-sm font-bold text-primary">{factura.numero}</span>
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
                        {factura.estado === 'emitida' && puedeModificar && (
                          <button
                            onClick={() => handleMarcarPagada(factura)}
                            title="Marcar como pagada"
                            className="flex items-center gap-1 px-2 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                          >
                            <Check size={13} /> Pagada
                          </button>
                        )}
                        {factura.garantia?.token && factura.clienteTelefono && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirWhatsApp(factura.clienteTelefono || '', mensajeConduceGarantia(factura));
                            }}
                            title="Enviar conduce y link de garantía por WhatsApp"
                            className="flex items-center gap-1 px-2 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
                          >
                            WhatsApp
                          </button>
                        )}
                        {factura.garantia?.estado === 'vigente' && puedeMarcarGarantia && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAbrirGarantiaManual(factura);
                            }}
                            title="Marcar como garantía (sin reclamo del cliente)"
                            className="flex items-center gap-1 px-2 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
                          >
                            <Shield size={13} /> Marcar garantía
                          </button>
                        )}
                        <button
                          onClick={() => handlePrint(factura)}
                          title="Imprimir"
                          className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
                        >
                          <Printer size={13} />
                        </button>
                        {puedeEliminar && (
                          <button
                            onClick={() => handleDelete(factura)}
                            title="Eliminar conduce de garantía"
                            className="flex items-center gap-1 px-2 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        {factura.ordenId && ordenesVinculadas[factura.ordenId] && (
                          <EliminarOrdenButton
                            orden={ordenesVinculadas[factura.ordenId]}
                            variant="icon"
                            size="sm"
                            className="bg-amber-50 text-amber-600 hover:bg-amber-100"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === factura.id && (
                    <tr key={`${factura.id}-detail`} className="bg-blue-50/30 border-b border-gray-100">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Subtotal</div>
                            <div className="text-sm font-bold text-gray-900">
                              {typeof factura.subtotal === 'number' ? formatMoneda(factura.subtotal) : <span className="text-gray-400">— (sin desglose)</span>}
                            </div>
                            {typeof factura.subtotal === 'number' && (
                              <div className="text-[10px] text-gray-500 mt-0.5">Base imponible</div>
                            )}
                          </div>

                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">ITBIS (ref. interna)</div>
                            <div className="text-sm font-bold text-orange-600">
                              {typeof factura.itbisMonto === 'number' ? formatMoneda(factura.itbisMonto) : <span className="text-gray-400">—</span>}
                            </div>
                            {typeof factura.itbisPorcentaje === 'number' && (
                              <div className="text-[10px] text-gray-500 mt-0.5">{factura.itbisPorcentaje}% · no fiscal</div>
                            )}
                          </div>

                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Costo piezas</div>
                            <div className="text-sm font-bold text-red-600">
                              {typeof factura.costoPiezas === 'number' ? `-${formatMoneda(factura.costoPiezas)}` : <span className="text-gray-400">—</span>}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">De items del inventario</div>
                          </div>

                          <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                            <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">Ganancia neta</div>
                            <div className="text-base font-bold text-green-700">
                              {typeof factura.gananciaNeta === 'number' ? formatMoneda(factura.gananciaNeta) : <span className="text-gray-400">—</span>}
                            </div>
                            <div className="text-[10px] text-green-700 mt-0.5">Subtotal − piezas</div>
                          </div>
                        </div>

                        {/* Bloque de comisión del técnico — N>1 (vendedor por línea) o N=1 (legacy) */}
                        {(() => {
                          const tieneVendedorPorLinea = Array.isArray(factura.items)
                            && factura.items.some(i => !!i.tecnicoId);

                          if (tieneVendedorPorLinea) {
                            // Agrupar items por tecnicoId. Mostramos sólo agregado
                            // (los montos por técnico viven en colección `comisiones`,
                            // acá no recalculamos para no romper si el % del técnico
                            // cambió desde la emisión). En el desglose mostramos:
                            // RD$ del item × cantidad por técnico.
                            const porTecnico = new Map<string, { nombre: string; lineas: number; subtotal: number }>();
                            for (const it of factura.items) {
                              if (!it.tecnicoId) continue;
                              const ent = porTecnico.get(it.tecnicoId) || {
                                nombre: it.tecnicoNombre || 'Técnico',
                                lineas: 0,
                                subtotal: 0,
                              };
                              ent.lineas += 1;
                              ent.subtotal += it.cantidad * it.precio;
                              porTecnico.set(it.tecnicoId, ent);
                            }
                            const entries = Array.from(porTecnico.entries());
                            const expandido = comisionExpandedId === factura.id;
                            return (
                              <div className="mt-3 bg-white rounded-xl p-3 border border-gray-100">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setComisionExpandedId(id => id === factura.id ? null : factura.id);
                                  }}
                                  className="w-full flex items-center justify-between flex-wrap gap-2 text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                                      {entries.length}
                                    </div>
                                    <div>
                                      <div className="text-xs font-semibold text-gray-900">
                                        {entries.length} técnico{entries.length !== 1 ? 's' : ''} · vendedor por línea
                                      </div>
                                      <div className="text-[11px] text-gray-500">
                                        {expandido ? 'Click para colapsar' : 'Click para ver desglose'}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-base font-bold text-emerald-600">
                                      {typeof factura.comisionTecnicoMonto === 'number'
                                        ? formatMoneda(factura.comisionTecnicoMonto)
                                        : '—'}
                                    </div>
                                    <div className="text-[10px] text-gray-400">comisión total</div>
                                  </div>
                                </button>
                                {expandido && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                                    {entries.map(([tid, ent]) => (
                                      <div key={tid} className="flex items-center justify-between text-xs">
                                        <span className="text-gray-700">
                                          <strong>{ent.nombre}</strong>
                                          <span className="text-gray-400 ml-1">· {ent.lineas} línea{ent.lineas !== 1 ? 's' : ''}</span>
                                        </span>
                                        <span className="text-gray-600">{formatMoneda(ent.subtotal)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          // Fallback legacy N=1
                          if (factura.comisionTecnicoId && typeof factura.comisionTecnicoMonto === 'number') {
                            return (
                              <div className="mt-3 bg-white rounded-xl p-3 border border-gray-100">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                                      {(factura.comisionTecnicoNombre || 'T').split(' ').map(s => s[0]).join('').slice(0, 2)}
                                    </div>
                                    <div>
                                      <div className="text-xs font-semibold text-gray-900">
                                        Comisión técnico · {factura.comisionTecnicoNombre}
                                      </div>
                                      <div className="text-[11px] text-gray-500">
                                        {factura.comisionTecnicoPorcentaje}% sobre ganancia neta
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-base font-bold text-emerald-600">
                                      {formatMoneda(factura.comisionTecnicoMonto)}
                                    </div>
                                    <div className="text-[10px] text-gray-400">ganancia técnico</div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Items detallados */}
                        {Array.isArray(factura.items) && factura.items.length > 0 && (
                          <div className="mt-3 bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 px-3 py-1.5">
                              Items ({factura.items.length})
                            </div>
                            <div className="divide-y divide-gray-50">
                              {factura.items.map((item, i) => (
                                <div key={i} className="px-3 py-1.5 flex items-center justify-between text-xs">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-gray-900">{item.descripcion}</span>
                                    {item.tipoItem === 'pieza' && (
                                      <span className="ml-1 text-[10px] bg-red-50 text-red-700 px-1.5 rounded-full">pieza</span>
                                    )}
                                    {item.tipoItem === 'servicio' && (
                                      <span className="ml-1 text-[10px] bg-blue-50 text-blue-700 px-1.5 rounded-full">servicio</span>
                                    )}
                                  </div>
                                  <div className="text-gray-500 mx-2">{item.cantidad} × {formatMoneda(item.precio)}</div>
                                  <div className="font-semibold text-gray-900 w-20 text-right">
                                    {formatMoneda(item.cantidad * item.precio)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* SPRINT-148 — Contexto de la orden original (read-only) */}
                        {factura.ordenId && (
                          <div className="border-t border-gray-100 mt-4 pt-4">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                              Orden original
                            </h4>
                            <OrdenResumenLectura
                              orden={ordenesVinculadas[factura.ordenId] ?? null}
                              variant="compacto"
                              factura={factura}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <FacturaCrearModal
        open={showModal}
        onClose={() => setShowModal(false)}
        catalogoServicios={catalogoServicios}
        catalogoPiezas={catalogoPiezas}
        tecnicos={tecnicos}
        clientes={clientes}
        clientesSinTipoDefinido={clientesSinTipoDefinido}
      />

      {/* Modal: marcar como garantía manual */}
      <Modal
        isOpen={showGarantiaManualModal}
        onClose={() => {
          if (savingGarantiaManual) return;
          setShowGarantiaManualModal(false);
          setFacturaGarantiaManual(null);
          setGarantiaManualRazon('');
        }}
        title="Marcar como garantía manual"
        size="lg"
      >
        {facturaGarantiaManual && (
          <div className="space-y-4">
            {/* SPRINT-148 — Contexto de la orden original arriba del form */}
            {facturaGarantiaManual.ordenId && (
              <OrdenResumenLectura
                orden={ordenesVinculadas[facturaGarantiaManual.ordenId] ?? null}
                variant="completo"
                factura={facturaGarantiaManual}
              />
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <p className="font-semibold mb-1">¿Iniciar trabajo de garantía sin reclamo del cliente?</p>
              <p className="text-xs">
                Esto creará una entrada en <strong>Citas por Confirmar</strong> referenciando el
                Conduce <strong>{facturaGarantiaManual.numero}</strong>. La garantía pasará a
                estado <strong>"reclamada"</strong> sin necesidad de que el cliente la reclame
                remotamente.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Razón <span className="text-red-600">*</span>
                <span className="ml-2 text-[10px] text-gray-400 font-normal">(mínimo 10 caracteres)</span>
              </label>
              <textarea
                value={garantiaManualRazon}
                onChange={e => setGarantiaManualRazon(e.target.value)}
                rows={4}
                placeholder="Describe el motivo por el cual se inicia esta garantía manualmente..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                {garantiaManualRazon.trim().length}/10 mínimo
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={savingGarantiaManual}
                onClick={() => {
                  setShowGarantiaManualModal(false);
                  setFacturaGarantiaManual(null);
                  setGarantiaManualRazon('');
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarGarantiaManual}
                disabled={savingGarantiaManual || garantiaManualRazon.trim().length < 10}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                <Shield size={14} />
                {savingGarantiaManual ? 'Creando...' : 'Crear cita de garantía'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
