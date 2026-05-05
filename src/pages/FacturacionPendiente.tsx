import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, ServicioPrecio, PiezaInventario, Personal } from '../types';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import { formatFecha, formatMoneda, formatMonedaPrecisa, parseOrden, parseServicioPrecio, parsePiezaInventario } from '../utils';
import { iconoCondicion, iconoOrigen, etiquetaOrigen } from '../utils/piezas';
import { aprobarPiezasDeOrden } from '../services/piezas.service';
import LoadingSpinner from '../components/LoadingSpinner';
import ModalEditarPiezasOrden from '../components/cierre/ModalEditarPiezasOrden';
import ModalEditarOrdenAdmin from '../components/ordenes/ModalEditarOrdenAdmin';
import FiltroAvanzadoFinanzas from '../components/admin/FiltroAvanzadoFinanzas';
import ProcesarFacturacionModal from '../components/facturacion-pendiente/ProcesarFacturacionModal';
import {
  Inbox, Receipt, ArrowRight, Check,
  ChevronDown, ChevronUp, Pencil, Package,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function FacturacionPendiente() {
  const { userProfile, currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [procesando, setProcesando] = useState<OrdenServicio | null>(null);
  const [piezasExpandidas, setPiezasExpandidas] = useState<Set<string>>(new Set());
  const [editandoPiezasOrden, setEditandoPiezasOrden] = useState<OrdenServicio | null>(null);
  const [editandoOrdenAdmin, setEditandoOrdenAdmin] = useState<OrdenServicio | null>(null);
  const [aprobandoPiezasId, setAprobandoPiezasId] = useState<string | null>(null);

  const [ordenesFiltradas, setOrdenesFiltradas] = useState<OrdenServicio[]>([]);

  // Catálogos + técnicos para el ProcesarFacturacionModal (C4b: vendedor por
  // línea + selector modalidad). Listeners viven acá; el modal es presentacional.
  const [catalogoServicios, setCatalogoServicios] = useState<ServicioPrecio[]>([]);
  const [catalogoPiezas, setCatalogoPiezas] = useState<PiezaInventario[]>([]);
  const [tecnicos, setTecnicos] = useState<Personal[]>([]);

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

    // Catálogos para el ProcesarFacturacionModal.
    const unsubServicios = onSnapshot(
      query(collection(db, 'precios_servicios'), orderBy('marca')),
      snapServicios => {
        setCatalogoServicios(snapServicios.docs.map(d => parseServicioPrecio(d.id, d.data())));
      },
    );
    const unsubPiezas = onSnapshot(
      query(collection(db, 'piezas_inventario'), orderBy('nombre')),
      snapPiezas => {
        setCatalogoPiezas(snapPiezas.docs.map(d => parsePiezaInventario(d.id, d.data())));
      },
    );
    // Personal: filtramos client-side a `rol === 'tecnico'` para no introducir
    // un índice compuesto. La cantidad de personal es pequeña.
    const unsubPersonal = onSnapshot(
      query(collection(db, 'personal'), orderBy('nombre')),
      snapPersonal => {
        const todos = snapPersonal.docs.map(d => ({ id: d.id, ...d.data() } as Personal));
        setTecnicos(todos.filter(p => p.rol === 'tecnico' && p.activo !== false));
      },
    );

    return () => {
      unsub();
      unsubServicios();
      unsubPiezas();
      unsubPersonal();
    };
  }, []);

  // Adapta órdenes al shape ItemFiltrable: usa `enviadaAFacturacionAt`
  // como fecha de "emisión" (la única fecha relevante en esta vista).
  const ordenesFiltrables = useMemo(() => {
    return ordenes.map(o => ({
      ...o,
      fechaEmision: o.enviadaAFacturacionAt instanceof Date
        ? o.enviadaAFacturacionAt
        : null,
    }));
  }, [ordenes]);

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

      <FiltroAvanzadoFinanzas
        pagina="facturacion-pendiente"
        items={ordenesFiltrables}
        etiquetaFechas="Enviadas a facturación"
        onChange={(filtrados) => {
          setOrdenesFiltradas(filtrados);
        }}
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
                    <div className="font-semibold text-gray-900">{formatMonedaPrecisa(total)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase">Pagado</div>
                    <div className="font-semibold text-green-600">{formatMonedaPrecisa(pagado)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase">Pendiente</div>
                    <div className="font-semibold text-orange-600">{formatMonedaPrecisa(pendiente)}</div>
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
        catalogoServicios={catalogoServicios}
        catalogoPiezas={catalogoPiezas}
        tecnicos={tecnicos}
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
