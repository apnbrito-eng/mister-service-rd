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
import { OrdenServicio, Cotizacion, ItemCotizacion, Usuario, PagoOrden } from '../types';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { crearRegistroAuditoria, formatFecha, parseOrden } from '../utils';
import { siguienteNumeroFactura } from '../services/contadores.service';
import { registrarComisionPorFactura, desglosarTotalConITBIS, calcularCostoPiezasDeItems } from '../utils/comisiones';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Inbox, Receipt, ArrowRight, Banknote, ArrowRightLeft, CreditCard, Trash2, Plus, Check } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtMonto(n: number): string {
  return `RD$${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface ItemEditable extends ItemCotizacion {
  _key: string;
}

export default function FacturacionPendiente() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [procesando, setProcesando] = useState<OrdenServicio | null>(null);

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

  if (loading) return <LoadingSpinner fullPage text="Cargando bandeja de facturación..." />;

  if (!puedeFacturar) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">
            No tienes permisos para procesar facturación. Contacta al administrador.
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
          <h1 className="text-2xl font-bold text-[#0f3460]">Facturación Pendiente</h1>
          <p className="text-gray-500 text-sm">
            Órdenes enviadas por las operarias listas para facturar.
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 bg-blue-50 text-[#0f3460] px-3 py-1 rounded-full text-sm font-semibold">
          {ordenes.length} pendientes
        </span>
      </div>

      {ordenes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Receipt size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            No hay órdenes pendientes de facturar. Cuando una operaria envíe una orden a facturación, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ordenes.map(o => {
            const total = Number(o.precioFinal || o.precioAprobado || o.precioSugerido || 0);
            const pagado = Number(o.montoPagado || 0);
            const pendiente = Math.max(0, total - pagado);
            return (
              <div key={o.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="font-mono text-sm font-bold text-[#0f3460]">
                      {o.numero || '#--'}
                    </span>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{o.clienteNombre}</p>
                    <p className="text-xs text-gray-500">{o.equipoTipo} · {o.equipoMarca || '—'}</p>
                  </div>
                  <button
                    onClick={() => setProcesando(o)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-xs font-semibold"
                  >
                    Procesar <ArrowRight size={12} />
                  </button>
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
        onClose={() => setProcesando(null)}
      />
    </div>
  );
}

/* ─────────────────────────────────────────── */
/* Modal de 2 pasos: Aprobar contenido + Confirmar pagos + generar factura */
/* ─────────────────────────────────────────── */
interface ModalProps {
  orden: OrdenServicio | null;
  userProfile: Usuario | null;
  onClose: () => void;
}

function ProcesarFacturacionModal({ orden, userProfile, onClose }: ModalProps) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [items, setItems] = useState<ItemEditable[]>([]);
  const [cargandoCotizacion, setCargandoCotizacion] = useState(false);
  const [generando, setGenerando] = useState(false);

  // Cargar items de la cotización vinculada (o crear uno por defecto)
  useEffect(() => {
    if (!orden) {
      setItems([]);
      setPaso(1);
      return;
    }
    setPaso(1);
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

      // Desglose fiscal (el total cobrado ya incluye ITBIS → desglosar)
      const desglose = desglosarTotalConITBIS(totalItems);
      const costoPiezas = calcularCostoPiezasDeItems(itemsLimpios as unknown as import('../types').ItemCotizacion[]);
      const gananciaNeta = Math.max(0, Math.round((desglose.subtotal - costoPiezas) * 100) / 100);

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
      };
      if (metodoPagoPrincipal) facturaPayload.metodoPago = metodoPagoPrincipal;
      if (bancoPrincipal) facturaPayload.bancoDestino = bancoPrincipal;
      if (orden.cotizacionId) facturaPayload.cotizacionId = orden.cotizacionId;
      if (totalPagado >= totalItems) facturaPayload.fechaPago = ahora;

      // Quitar undefined recursivamente
      const facturaLimpia = Object.fromEntries(
        Object.entries(facturaPayload).filter(([, v]) => v !== undefined),
      );

      const facturaRef = await addDoc(collection(db, 'facturas'), facturaLimpia);

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

      toast.success(`Factura ${numero} generada`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al generar la factura');
    } finally {
      setGenerando(false);
    }
  };

  if (!orden) return null;

  return (
    <Modal isOpen={!!orden} onClose={onClose} title={`Procesar facturación — ${orden.numero || ''}`} size="lg">
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
                Items que se incluirán en la factura. Edita lo que sea necesario.
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
              <span className="text-sm font-medium text-[#0f3460]">Total factura</span>
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
                Esta orden no tiene pagos registrados. La factura se generará igual con estado "Emitida" (pago pendiente).
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
                <div className="text-[11px] text-blue-700 uppercase">Total factura</div>
                <div className="text-base font-semibold text-[#0f3460]">{fmtMonto(totalItems)}</div>
              </div>
            </div>
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
                disabled={generando}
                className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                <Check size={14} />
                {generando ? 'Generando factura...' : 'Generar factura'}
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
