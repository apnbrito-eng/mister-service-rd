import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Cotizacion, ItemCotizacion, Usuario, PagoOrden, Factura, GarantiaInfo } from '../types';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { crearRegistroAuditoria, formatFecha, formatMoneda, parseOrden } from '../utils';
import { abrirWhatsApp, mensajeConduceGarantia } from '../utils/whatsapp';
import { iconoCondicion, iconoOrigen, etiquetaOrigen } from '../utils/piezas';
import { siguienteNumeroFactura } from '../services/contadores.service';
import { registrarComisionPorFactura, desglosarTotalConITBIS, calcularCostoPiezasDeItems } from '../utils/comisiones';
import { obtenerConfigFiscal } from '../services/configFiscal.service';
import { aprobarPiezasDeOrden } from '../services/piezas.service';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import ModalEditarPiezasOrden from '../components/cierre/ModalEditarPiezasOrden';
import ModalEditarOrdenAdmin from '../components/ordenes/ModalEditarOrdenAdmin';
import FiltroRangoFechas, { formatYYYYMMDDLocal } from '../components/admin/FiltroRangoFechas';
import {
  Inbox, Receipt, ArrowRight, Banknote, ArrowRightLeft, CreditCard, Trash2, Plus, Check,
  ChevronDown, ChevronUp, Pencil, Package,
} from 'lucide-react';
import toast from 'react-hot-toast';

function fmtMonto(n: number): string {
  return `RD$${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface ItemEditable extends ItemCotizacion {
  _key: string;
}

export default function FacturacionPendiente() {
  const { userProfile, currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [procesando, setProcesando] = useState<OrdenServicio | null>(null);
  const [piezasExpandidas, setPiezasExpandidas] = useState<Set<string>>(new Set());
  const [editandoPiezasOrden, setEditandoPiezasOrden] = useState<OrdenServicio | null>(null);
  const [editandoOrdenAdmin, setEditandoOrdenAdmin] = useState<OrdenServicio | null>(null);
  const [aprobandoPiezasId, setAprobandoPiezasId] = useState<string | null>(null);

  // Filtro de rango de fechas sobre `enviadaAFacturacionAt`. Default: mes corriente.
  const [fechaDesde, setFechaDesde] = useState<string>(() => {
    const hoy = new Date();
    return formatYYYYMMDDLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  });
  const [fechaHasta, setFechaHasta] = useState<string>(() => formatYYYYMMDDLocal(new Date()));

  const esAdmin = userProfile?.rol === 'administrador';

  const puedeFacturar =
    puede(userProfile, 'facturasCerrar') ||
    puede(userProfile, 'facturasCrear') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  useEffect(() => {
    // Solo órdenes enviadas a facturación y aún no facturadas
    const q = query(
      collection(db, 'ordenes_servicio'),
      where('enviadaAFacturacion', '==', true),
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => parseOrden(d.id, d.data()))
        .filter(o => !o.facturada && !o.eliminada);
      // Más recientes primero por fecha de envío
      list.sort((a, b) => {
        const ta = a.enviadaAFacturacionAt instanceof Date ? a.enviadaAFacturacionAt.getTime() : 0;
        const tb = b.enviadaAFacturacionAt instanceof Date ? b.enviadaAFacturacionAt.getTime() : 0;
        return tb - ta;
      });
      setOrdenes(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const ordenesFiltradas = useMemo(() => {
    if (!fechaDesde && !fechaHasta) return ordenes;
    const desdeMs = fechaDesde ? new Date(fechaDesde + 'T00:00:00').getTime() : null;
    const hastaMs = fechaHasta ? new Date(fechaHasta + 'T23:59:59').getTime() : null;
    return ordenes.filter(o => {
      const fecha = o.enviadaAFacturacionAt;
      if (!(fecha instanceof Date)) return false;
      const t = fecha.getTime();
      if (desdeMs !== null && t < desdeMs) return false;
      if (hastaMs !== null && t > hastaMs) return false;
      return true;
    });
  }, [ordenes, fechaDesde, fechaHasta]);

  const limpiarFiltroFechas = () => {
    setFechaDesde('');
    setFechaHasta('');
  };

  const togglePiezas = (ordenId: string) => {
    setPiezasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(ordenId)) next.delete(ordenId);
      else next.add(ordenId);
      return next;
    });
  };

  const handleAprobarPiezas = async (o: OrdenServicio) => {
    if (!esAdmin) {
      toast.error('Solo el administrador puede aprobar piezas.');
      return;
    }
    if (!currentUser || !userProfile) return;
    const cs = o.cierreServicio;
    if (!cs || !cs.piezasUsadas || cs.piezasUsadas.length === 0) return;
    const cantidad = cs.piezasUsadas.length;
    if (!window.confirm(`¿Aprobar las ${cantidad} pieza${cantidad === 1 ? '' : 's'} registrada${cantidad === 1 ? '' : 's'} en ${o.numero}?`)) {
      return;
    }
    setAprobandoPiezasId(o.id);
    try {
      await aprobarPiezasDeOrden(o, {
        uid: currentUser.uid,
        nombre: userProfile.nombre || userProfile.email || 'Admin',
      });
      toast.success(`${cantidad} pieza${cantidad === 1 ? '' : 's'} aprobada${cantidad === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('[facturacion-pendiente] aprobar piezas error:', err);
      toast.error('No se pudieron aprobar las piezas. Reintenta.');
    } finally {
      setAprobandoPiezasId(null);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando bandeja de conduces..." />;

  if (!puedeFacturar) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">
            No tienes permisos para procesar conduces de garantía. Contacta al administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <Inbox size={20} className="text-[#0f3460]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">Conduces Pendientes</h1>
          <p className="text-gray-500 text-sm">
            Órdenes enviadas por las operarias listas para emitir conduce de garantía.
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 bg-blue-50 text-[#0f3460] px-3 py-1 rounded-full text-sm font-semibold">
          {ordenesFiltradas.length === ordenes.length
            ? `${ordenes.length} pendientes`
            : `${ordenesFiltradas.length} de ${ordenes.length} pendientes`}
        </span>
      </div>

      <FiltroRangoFechas
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
        onChange={(d, h) => { setFechaDesde(d); setFechaHasta(h); }}
        onLimpiar={limpiarFiltroFechas}
        totalSinFiltrar={ordenes.length}
        totalFiltrado={ordenesFiltradas.length}
        etiqueta="Enviadas a facturación:"
      />

      {ordenesFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Receipt size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {ordenes.length === 0
              ? 'No hay órdenes pendientes. Cuando una operaria envíe una orden para conduce de garantía, aparecerá aquí.'
              : 'No hay órdenes pendientes en el rango de fechas seleccionado.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ordenesFiltradas.map(o => {
            const total = Number(o.precioFinal || o.precioAprobado || o.precioSugerido || 0);
            const pagado = Number(o.montoPagado || 0);
            const pendiente = Math.max(0, total - pagado);
            const piezas = o.cierreServicio?.piezasUsadas || [];
            const tienePiezas = piezas.length > 0;
            const piezasValidadas = o.cierreServicio?.piezasValidadasPorAdmin === true;
            const costoPiezasTotal = piezas.reduce((acc, p) => acc + (Number(p.costoTotal) || 0), 0);
            const expandida = piezasExpandidas.has(o.id);
            return (
              <div key={o.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm font-bold text-[#0f3460]">
                      {o.numero || '#--'}
                    </span>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{o.clienteNombre}</p>
                    <p className="text-xs text-gray-500">{o.equipoTipo} · {o.equipoMarca || '—'}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    <button
                      onClick={() => setProcesando(o)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-xs font-semibold"
                    >
                      Procesar <ArrowRight size={12} />
                    </button>
                    {esAdmin && (
                      <button
                        onClick={() => setEditandoOrdenAdmin(o)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold"
                        title="Editar cualquier campo de la orden"
                      >
                        <Pencil size={12} /> Editar orden completa
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-3 bg-gray-50 rounded-lg p-2">
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase">Total</div>
                    <div className="font-semibold text-gray-900">{fmtMonto(total)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase">Pagado</div>
                    <div className="font-semibold text-green-600">{fmtMonto(pagado)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase">Pendiente</div>
                    <div className="font-semibold text-orange-600">{fmtMonto(pendiente)}</div>
                  </div>
                </div>

                {/* Sección de piezas utilizadas */}
                {tienePiezas && (
                  <div className="mt-3 border border-gray-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => togglePiezas(o.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-lg"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Package size={12} />
                        <span>📦 Piezas utilizadas</span>
                        <span className="text-gray-500 font-normal">
                          ({piezas.length} · {formatMoneda(costoPiezasTotal)})
                        </span>
                        {piezasValidadas ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium">
                            <Check size={10} /> Validadas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-medium">
                            ⏳ Pendientes de validar
                          </span>
                        )}
                      </span>
                      {expandida ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {expandida && (
                      <div className="border-t border-gray-100 p-3 space-y-1.5">
                        {piezas.map(p => (
                          <div
                            key={p.id}
                            className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 flex-wrap"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="font-medium text-gray-900 truncate">📦 {p.nombre}</span>
                              {p.marca && <span className="text-gray-500">· {p.marca}</span>}
                              <span className="text-gray-500">
                                {iconoCondicion(p.condicion)} {p.condicion === 'nueva' ? 'Nueva' : 'Usada'}
                              </span>
                              <span className="text-gray-500">
                                {iconoOrigen(p.origen)} {etiquetaOrigen(p.origen)}
                              </span>
                            </div>
                            <span className="text-gray-700 font-medium">
                              {p.cantidad} × {formatMoneda(p.costoUnitario)} = {formatMoneda(p.costoTotal)}
                            </span>
                          </div>
                        ))}
                        {!piezasValidadas && esAdmin && (
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setEditandoPiezasOrden(o)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil size={11} /> Editar piezas
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAprobarPiezas(o)}
                              disabled={aprobandoPiezasId === o.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                            >
                              <Check size={11} />
                              {aprobandoPiezasId === o.id ? 'Aprobando...' : 'Aprobar piezas'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {o.enviadaAFacturacionAt && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    Enviada por {o.enviadaAFacturacionPorNombre || '—'} · {formatFecha(o.enviadaAFacturacionAt)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ProcesarFacturacionModal
        orden={procesando}
        userProfile={userProfile}
        currentUserUid={currentUser?.uid || ''}
        onClose={() => setProcesando(null)}
      />

      {/* Modal para editar piezas (reutiliza el existente en OrdenDetalle / PiezasPendientes) */}
      <ModalEditarPiezasOrden
        orden={editandoPiezasOrden}
        onClose={() => setEditandoPiezasOrden(null)}
      />

      {/* Modal para editar la orden completa (nuevo — B1) */}
      {editandoOrdenAdmin && (
        <ModalEditarOrdenAdmin
          orden={editandoOrdenAdmin}
          onGuardado={() => {
            // Las ordenes vienen de onSnapshot → el refresh es automático.
            // No necesitamos mutar el state local.
          }}
          onCerrar={() => setEditandoOrdenAdmin(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── */
/* Modal de 2 pasos: Aprobar contenido + Confirmar pagos + generar factura */
/* ─────────────────────────────────────────── */
interface ModalProps {
  orden: OrdenServicio | null;
  userProfile: Usuario | null;
  currentUserUid: string;
  onClose: () => void;
}

/** Presets de tiempo de garantía. El selector exige que se elija uno
 *  antes de poder emitir el conduce. */
const GARANTIA_PRESETS: Array<{ dias: number; label: string }> = [
  { dias: 30, label: '30 días' },
  { dias: 60, label: '60 días' },
  { dias: 90, label: '90 días' },
  { dias: 180, label: '6 meses' },
  { dias: 365, label: '1 año' },
];

function ProcesarFacturacionModal({ orden, userProfile, currentUserUid, onClose }: ModalProps) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [items, setItems] = useState<ItemEditable[]>([]);
  const [cargandoCotizacion, setCargandoCotizacion] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [tiempoGarantiaDias, setTiempoGarantiaDias] = useState<number | null>(null);

  const puedeConfigurarGarantia =
    userProfile?.rol === 'coordinadora' || userProfile?.rol === 'administrador';

  // Cargar items de la cotización vinculada (o crear uno por defecto)
  useEffect(() => {
    if (!orden) {
      setItems([]);
      setPaso(1);
      setTiempoGarantiaDias(null);
      return;
    }
    setPaso(1);
    setTiempoGarantiaDias(null);
    const cargar = async () => {
      setCargandoCotizacion(true);
      try {
        if (orden.cotizacionId) {
          const snap = await getDoc(doc(db, 'cotizaciones', orden.cotizacionId));
          if (snap.exists()) {
            const cot = snap.data() as Cotizacion;
            const its = (cot.items || []).map((it, idx) => ({
              ...it,
              _key: `it_${idx}_${Date.now()}`,
            }));
            setItems(its.length > 0 ? its : [defaultItem(orden)]);
            setCargandoCotizacion(false);
            return;
          }
        }
        setItems([defaultItem(orden)]);
      } finally {
        setCargandoCotizacion(false);
      }
    };
    cargar();
  }, [orden]);

  const totalItems = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio || 0), 0),
    [items],
  );

  const pagosPrevios = useMemo<PagoOrden[]>(() => {
    return Array.isArray(orden?.pagos) ? (orden!.pagos as PagoOrden[]) : [];
  }, [orden]);
  const totalPagado = useMemo(
    () => pagosPrevios.reduce((acc, p) => acc + Number(p.monto || 0), 0),
    [pagosPrevios],
  );

  const actualizarItem = (key: string, cambios: Partial<ItemEditable>) => {
    setItems(prev => prev.map(it => (it._key === key ? { ...it, ...cambios } : it)));
  };

  const eliminarItem = (key: string) => {
    setItems(prev => prev.filter(it => it._key !== key));
  };

  const agregarItem = () => {
    setItems(prev => [
      ...prev,
      {
        descripcion: '',
        cantidad: 1,
        precio: 0,
        tipoItem: 'manual',
        _key: `it_new_${Date.now()}`,
      },
    ]);
  };

  const handleGenerar = async () => {
    if (!orden) return;
    if (items.length === 0) {
      toast.error('Agrega al menos un item');
      return;
    }
    if (items.some(it => !it.descripcion.trim())) {
      toast.error('Todos los items necesitan descripción');
      return;
    }
    if (puedeConfigurarGarantia && !tiempoGarantiaDias) {
      toast.error('Selecciona un tiempo de garantía antes de emitir el conduce');
      return;
    }
    setGenerando(true);
    try {
      const numero = await siguienteNumeroFactura();
      const ahora = Timestamp.now();
      const usuario = userProfile?.nombre || 'Sistema';
      const usuarioId = userProfile?.id || '';

      // Determinar método de pago principal (el del último pago, o el más usado)
      const ultimoPago = pagosPrevios[pagosPrevios.length - 1];
      const metodoPagoPrincipal = ultimoPago?.metodo;
      const bancoPrincipal = ultimoPago?.bancoNombre;

      // Construir doc de factura
      const itemsLimpios = items.map(({ _key: _, ...rest }) => {
        // Quitar campos undefined
        const obj: Record<string, unknown> = {
          descripcion: rest.descripcion.trim(),
          cantidad: Number(rest.cantidad) || 0,
          precio: Number(rest.precio) || 0,
        };
        if (rest.tipoItem) obj.tipoItem = rest.tipoItem;
        if (rest.servicioPrecioId) obj.servicioPrecioId = rest.servicioPrecioId;
        if (rest.piezaInventarioId) obj.piezaInventarioId = rest.piezaInventarioId;
        if (typeof rest.costoCompra === 'number') obj.costoCompra = rest.costoCompra;
        return obj;
      });

      // Leer tasa ITBIS actual (configurable)
      const configFiscal = await obtenerConfigFiscal();
      const itbisPct = configFiscal.itbisPorcentaje;

      // Desglose fiscal (el total cobrado ya incluye ITBIS → desglosar)
      const desglose = desglosarTotalConITBIS(totalItems, itbisPct);
      const costoPiezas = calcularCostoPiezasDeItems(itemsLimpios as unknown as import('../types').ItemCotizacion[]);
      const gananciaNeta = Math.max(0, Math.round((desglose.subtotal - costoPiezas) * 100) / 100);

      // Construir bloque de garantía si la coord/admin configuró tiempo
      let garantia: GarantiaInfo | null = null;
      if (puedeConfigurarGarantia && tiempoGarantiaDias) {
        const inicioMs = Date.now();
        const finMs = inicioMs + tiempoGarantiaDias * 86400 * 1000;
        const token = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : `tok_${inicioMs}_${Math.random().toString(36).slice(2)}`;
        garantia = {
          tiempoDias: tiempoGarantiaDias,
          inicioFecha: Timestamp.fromMillis(inicioMs),
          finFecha: Timestamp.fromMillis(finMs),
          token,
          estado: 'vigente',
        };
      }

      // Snapshot de orden / equipo para que el endpoint público pueda leer
      // todo desde el doc factura sin tocar otras colecciones.
      const fechaServicio: Timestamp | undefined = (() => {
        const fc = orden.cierreServicio?.fechaCierre;
        if (fc instanceof Date) return Timestamp.fromDate(fc);
        if (orden.fechaCita instanceof Date) return Timestamp.fromDate(orden.fechaCita);
        return undefined;
      })();

      const facturaPayload: Record<string, unknown> = {
        numero,
        clienteId: orden.clienteId,
        clienteNombre: orden.clienteNombre,
        ordenId: orden.id,
        ordenNumero: orden.numero,
        items: itemsLimpios,
        total: totalItems,
        subtotal: desglose.subtotal,
        itbisPorcentaje: desglose.itbisPorcentaje,
        itbisMonto: desglose.itbis,
        costoPiezas,
        gananciaNeta,
        estado: totalPagado >= totalItems ? 'pagada' : 'emitida',
        fechaEmision: ahora,
        createdAt: ahora,
        emitidaPorId: usuarioId,
        emitidaPorNombre: usuario,
        // Origen: distingue conduces emitidos automáticamente al cerrar
        // una orden de los conduces manuales creados desde /admin/facturas.
        origen: 'post-cierre' as const,
      };
      if (metodoPagoPrincipal) facturaPayload.metodoPago = metodoPagoPrincipal;
      if (bancoPrincipal) facturaPayload.bancoDestino = bancoPrincipal;
      if (orden.cotizacionId) facturaPayload.cotizacionId = orden.cotizacionId;
      // Denormalizar tipoCierre desde la orden — necesario para que
      // `obtenerCostoPiezasDeOrden` distinga la factura del chequeo previo
      // (CG, sin piezas) de la factura de la reparación (con piezas) en
      // órdenes reactivadas post-chequeo.
      if (orden.tipoCierre) facturaPayload.tipoCierre = orden.tipoCierre;
      else if (orden.soloChequeo) facturaPayload.tipoCierre = 'solo_chequeo';
      else facturaPayload.tipoCierre = 'reparacion_completa';
      if (totalPagado >= totalItems) facturaPayload.fechaPago = ahora;
      // Denormalización para el endpoint público de garantía
      if (orden.clienteTelefono) facturaPayload.clienteTelefono = orden.clienteTelefono;
      if (orden.equipoTipo) facturaPayload.equipoTipo = orden.equipoTipo;
      if (orden.equipoMarca) facturaPayload.equipoMarca = orden.equipoMarca;
      if (orden.equipoModelo) facturaPayload.equipoModelo = orden.equipoModelo;
      if (orden.tecnicoId) facturaPayload.tecnicoId = orden.tecnicoId;
      if (orden.tecnicoNombre) facturaPayload.tecnicoNombre = orden.tecnicoNombre;
      if (fechaServicio) facturaPayload.fechaServicio = fechaServicio;
      if (garantia) facturaPayload.garantia = garantia;

      // Quitar undefined recursivamente
      const facturaLimpia = Object.fromEntries(
        Object.entries(facturaPayload).filter(([, v]) => v !== undefined),
      );

      const facturaRef = await addDoc(collection(db, 'facturas'), facturaLimpia);

      // Audit log de emisión de garantía (no bloquea si falla)
      if (garantia) {
        try {
          await addDoc(collection(db, 'auditoria_admin'), {
            accion: 'emitir_garantia',
            solicitanteUid: currentUserUid,
            solicitanteNombre: usuario,
            objetivoTipo: 'factura',
            objetivoId: facturaRef.id,
            conduceNumero: numero,
            ordenId: orden.id,
            ordenNumero: orden.numero,
            garantia: {
              tiempoDias: garantia.tiempoDias,
              finFecha: garantia.finFecha,
              token: (garantia.token || '').substring(0, 8) + '...',
            },
            timestamp: Timestamp.now(),
          });
        } catch (err) {
          console.warn('[facturacion-pendiente] audit emitir_garantia falló (no bloquea):', err);
        }
      }

      // Registrar/actualizar comisión del técnico sobre ganancia neta
      let comisionInfo: Awaited<ReturnType<typeof registrarComisionPorFactura>> | null = null;
      try {
        comisionInfo = await registrarComisionPorFactura({
          orden,
          facturaId: facturaRef.id,
          facturaNumero: numero,
          totalFactura: totalItems,
          items: itemsLimpios as unknown as import('../types').ItemCotizacion[],
          userProfile,
          itbisPorcentaje: itbisPct,
        });
        // Denormalizar los datos de comisión en el doc de factura
        if (comisionInfo && comisionInfo.comisionId && comisionInfo.tecnicoId) {
          await updateDoc(doc(db, 'facturas', facturaRef.id), {
            comisionRegistroId: comisionInfo.comisionId,
            comisionTecnicoId: comisionInfo.tecnicoId,
            comisionTecnicoNombre: comisionInfo.tecnicoNombre,
            comisionTecnicoPorcentaje: comisionInfo.porcentaje,
            comisionTecnicoMonto: comisionInfo.comisionMonto,
          });
        }
      } catch (err) {
        console.warn('Error registrando comisión por factura:', err);
      }

      // Marcar la orden
      const registro = crearRegistroAuditoria(
        usuario,
        'editar',
        `Factura generada ${numero} (${fmtMonto(totalItems)})`,
        'facturada',
        'no',
        'sí',
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        facturada: true,
        facturaId: facturaRef.id,
        facturaNumero: numero,
        facturadaAt: ahora,
        facturadaPorId: usuarioId,
        facturadaPorNombre: usuario,
        auditoria: arrayUnion(registro),
        updatedAt: ahora,
      });

      // Toast con CTA de WhatsApp si tenemos teléfono y se generó garantía
      const telefono = orden.clienteTelefono || '';
      if (garantia && telefono) {
        // Construimos un objeto Factura mínimo en memoria para alimentar el
        // helper de mensaje (no se relee Firestore).
        const facturaParaMensaje: Factura = {
          id: facturaRef.id,
          numero,
          clienteNombre: orden.clienteNombre,
          clienteTelefono: telefono,
          items: itemsLimpios as unknown as ItemCotizacion[],
          total: totalItems,
          estado: totalPagado >= totalItems ? 'pagada' : 'emitida',
          fechaEmision: ahora.toDate(),
          equipoTipo: orden.equipoTipo,
          equipoMarca: orden.equipoMarca,
          equipoModelo: orden.equipoModelo,
          tecnicoId: orden.tecnicoId,
          tecnicoNombre: orden.tecnicoNombre,
          fechaServicio: fechaServicio?.toDate(),
          garantia,
          createdAt: ahora.toDate(),
        };
        toast.custom(
          t => (
            <div
              className={`bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 flex items-center gap-3 ${t.visible ? 'animate-enter' : 'animate-leave'}`}
            >
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">
                  Conduce {numero} generado
                </div>
                <div className="text-xs text-gray-500">
                  Enviá el conduce y link de garantía al cliente.
                </div>
              </div>
              <button
                onClick={() => {
                  abrirWhatsApp(telefono, mensajeConduceGarantia(facturaParaMensaje));
                  toast.dismiss(t.id);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
              >
                Enviar por WhatsApp
              </button>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                Cerrar
              </button>
            </div>
          ),
          { duration: 8000 },
        );
      } else {
        toast.success(`Conduce ${numero} generado`);
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el conduce de garantía');
    } finally {
      setGenerando(false);
    }
  };

  if (!orden) return null;

  return (
    <Modal isOpen={!!orden} onClose={onClose} title={`Emitir conduce de garantía — ${orden.numero || ''}`} size="lg">
      <div className="space-y-5">
        {/* Stepper */}
        <div className="flex items-center gap-2">
          <StepDot active={paso === 1} done={paso > 1} num={1} label="Aprobar contenido" />
          <div className="flex-1 h-0.5 bg-gray-200" />
          <StepDot active={paso === 2} done={false} num={2} label="Confirmar pagos" />
        </div>

        {paso === 1 && (
          <div className="space-y-3">
            {cargandoCotizacion && <p className="text-sm text-gray-500">Cargando cotización...</p>}
            <div>
              <p className="text-xs text-gray-600 mb-2">
                Items que se incluirán en el conduce de garantía. Edita lo que sea necesario.
              </p>
              <div className="space-y-2">
                {items.map(it => (
                  <div key={it._key} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={it.descripcion}
                      onChange={e => actualizarItem(it._key, { descripcion: e.target.value })}
                      placeholder="Descripción"
                      className="col-span-6 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      value={it.cantidad}
                      onChange={e => actualizarItem(it._key, { cantidad: Number(e.target.value) || 0 })}
                      placeholder="Cant"
                      className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      value={it.precio}
                      onChange={e => actualizarItem(it._key, { precio: Number(e.target.value) || 0 })}
                      placeholder="Precio"
                      className="col-span-3 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => eliminarItem(it._key)}
                      className="col-span-1 p-1.5 text-red-500 hover:bg-red-50 rounded"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={agregarItem}
                className="mt-2 inline-flex items-center gap-1 text-xs text-[#1a5fa8] hover:underline"
              >
                <Plus size={12} /> Agregar item
              </button>
            </div>
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg p-3">
              <span className="text-sm font-medium text-[#0f3460]">Total conduce</span>
              <span className="text-lg font-bold text-[#0f3460]">{fmtMonto(totalItems)}</span>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setPaso(2)}
                disabled={items.length === 0}
                className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                Siguiente: Confirmar pagos
              </button>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600">
              Pagos registrados por la operaria. Si necesitas agregar o modificar algún pago, hazlo desde la orden antes de continuar.
            </p>
            {pagosPrevios.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Esta orden no tiene pagos registrados. El conduce de garantía se generará igual con estado "Emitido" (pago pendiente).
              </div>
            ) : (
              <div className="space-y-2">
                {pagosPrevios.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {p.metodo === 'efectivo' && <Banknote size={14} className="text-green-600" />}
                      {p.metodo === 'transferencia' && <ArrowRightLeft size={14} className="text-blue-600" />}
                      {p.metodo === 'tarjeta' && <CreditCard size={14} className="text-purple-600" />}
                      <div>
                        <span className="font-medium text-gray-900">{fmtMonto(p.monto)}</span>
                        <span className="text-gray-500 ml-2 capitalize">{p.metodo}</span>
                        {p.metodo === 'efectivo' && p.recibidoPorNombre && (
                          <span className="text-gray-500"> · {p.recibidoPorNombre}</span>
                        )}
                        {(p.metodo === 'transferencia' || p.metodo === 'tarjeta') && p.bancoNombre && (
                          <span className="text-gray-500"> → {p.bancoNombre}</span>
                        )}
                        {p.referencia && <span className="text-gray-500"> · Ref {p.referencia}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <div>
                <div className="text-[11px] text-blue-700 uppercase">Total pagado</div>
                <div className="text-base font-semibold text-green-600">{fmtMonto(totalPagado)}</div>
              </div>
              <div>
                <div className="text-[11px] text-blue-700 uppercase">Total conduce</div>
                <div className="text-base font-semibold text-[#0f3460]">{fmtMonto(totalItems)}</div>
              </div>
            </div>

            {/* Selector de tiempo de garantía (sólo coord/admin, requerido para emitir) */}
            {puedeConfigurarGarantia && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="text-sm font-semibold text-amber-900">
                    Tiempo de Garantía
                  </div>
                  {tiempoGarantiaDias === null && (
                    <span className="text-[11px] text-red-600 font-medium">
                      Requerido para emitir
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-amber-800 mb-3">
                  Define cuántos días tendrá vigencia la garantía. El cliente recibirá un link único para consultar el estado y reclamar.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {GARANTIA_PRESETS.map(p => {
                    const activo = tiempoGarantiaDias === p.dias;
                    return (
                      <button
                        key={p.dias}
                        type="button"
                        onClick={() => setTiempoGarantiaDias(p.dias)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                          activo
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPaso(1)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleGenerar}
                disabled={generando || (puedeConfigurarGarantia && tiempoGarantiaDias === null)}
                className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                title={puedeConfigurarGarantia && tiempoGarantiaDias === null ? 'Selecciona un tiempo de garantía' : ''}
              >
                <Check size={14} />
                {generando ? 'Generando conduce...' : 'Generar conduce de garantía'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StepDot({ active, done, num, label }: { active: boolean; done: boolean; num: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          done
            ? 'bg-green-500 text-white'
            : active
              ? 'bg-[#0f3460] text-white'
              : 'bg-gray-200 text-gray-500'
        }`}
      >
        {done ? <Check size={14} /> : num}
      </div>
      <span className={`text-xs font-medium ${active ? 'text-[#0f3460]' : 'text-gray-500'}`}>{label}</span>
    </div>
  );
}

function defaultItem(orden: OrdenServicio): ItemEditable {
  // Solo Chequeo: el item es el chequeo del equipo, no el servicio completo.
  if (orden.soloChequeo) {
    const precioCheq = Number(orden.precioChequeo || orden.precioFinal || 0);
    const descCheq = `Chequeo de ${orden.equipoTipo || 'equipo'}${orden.equipoMarca ? ` ${orden.equipoMarca}` : ''} (sin reparación)`;
    return {
      descripcion: descCheq.substring(0, 200),
      cantidad: 1,
      precio: precioCheq,
      tipoItem: 'servicio',
      _key: `it_default_chequeo_${Date.now()}`,
    };
  }
  const precio = Number(orden.precioFinal || orden.precioAprobado || orden.precioSugerido || 0);
  const desc = `${orden.equipoTipo}${orden.equipoMarca ? ` ${orden.equipoMarca}` : ''} — ${orden.descripcionFalla || 'Servicio'}`;
  return {
    descripcion: desc.substring(0, 200),
    cantidad: 1,
    precio,
    tipoItem: 'servicio',
    _key: `it_default_${Date.now()}`,
  };
}
