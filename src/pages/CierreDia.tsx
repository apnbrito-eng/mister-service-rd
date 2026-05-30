import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Factura, Personal } from '../types';
import { formatMoneda, formatFecha, parseOrden, getAlertasFromOrdenes } from '../utils';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { ClipboardCheck, AlertTriangle, DollarSign, FileText, Truck, Lock, Check } from 'lucide-react';
import { format, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

export default function CierreDia() {
  const { userProfile } = useApp();
  const puedeCerrar = puede(userProfile, 'cierreDiaEjecutar');

  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [fechaSel, setFechaSel] = useState(format(new Date(), 'yyyy-MM-dd'));
  // Cierre del día actual (si existe)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cierreExistente, setCierreExistente] = useState<any | null>(null);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [marcandoEfectivoTec, setMarcandoEfectivoTec] = useState<string | null>(null);

  useEffect(() => {
    let loaded = 0;
    const checkLoaded = () => { loaded++; if (loaded >= 3) setLoading(false); };

    const unsubOrd = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>)));
      checkLoaded();
    });
    const unsubFac = onSnapshot(collection(db, 'facturas'), (snap) => {
      setFacturas(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          fechaEmision: raw.fechaEmision?.toDate?.() || new Date(),
          fechaPago: raw.fechaPago?.toDate?.() || null,
          fechaVencimiento: raw.fechaVencimiento?.toDate?.() || null,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        } as Factura;
      }));
      checkLoaded();
    });
    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
      checkLoaded();
    });

    return () => { unsubOrd(); unsubFac(); };
  }, []);

  // Cargar cierre existente del día seleccionado
  useEffect(() => {
    const fechaInicio = startOfDay(new Date(fechaSel + 'T00:00:00'));
    const fechaFin = endOfDay(new Date(fechaSel + 'T00:00:00'));
    getDocs(query(
      collection(db, 'cierres_dia'),
      where('fecha', '>=', Timestamp.fromDate(fechaInicio)),
      where('fecha', '<=', Timestamp.fromDate(fechaFin)),
    )).then(snap => {
      if (snap.empty) {
        setCierreExistente(null);
      } else {
        const d = snap.docs[0];
        const raw = d.data();
        setCierreExistente({
          id: d.id,
          ...raw,
          fecha: raw.fecha?.toDate?.() || new Date(),
          fechaCierre: raw.fechaCierre?.toDate?.() || new Date(),
        });
      }
    }).catch(err => {
      console.error(err);
      setCierreExistente(null);
    });
  }, [fechaSel]);

  const fechaInicio = useMemo(() => startOfDay(new Date(fechaSel + 'T00:00:00')), [fechaSel]);
  const fechaFin = useMemo(() => endOfDay(new Date(fechaSel + 'T00:00:00')), [fechaSel]);

  // Órdenes cerradas en el día (por fecha del cierreServicio o updatedAt si fase=cerrado)
  const ordenesCerradasHoy = useMemo(() => {
    return ordenes.filter(o => {
      if (o.eliminada) return false;
      if (!['cerrado', 'trabajo_realizado'].includes(o.fase)) return false;
      const fc = o.cierreServicio?.fechaCierre || o.updatedAt;
      return fc && fc >= fechaInicio && fc <= fechaFin;
    });
  }, [ordenes, fechaInicio, fechaFin]);

  const ordenesChequeoHoy = useMemo(() => {
    return ordenesCerradasHoy.filter(o => o.soloChequeo);
  }, [ordenesCerradasHoy]);

  const totalIngresos = useMemo(() => {
    return ordenesCerradasHoy.reduce((sum, o) => {
      if (o.soloChequeo) return sum + (o.precioChequeo || 0);
      return sum + (o.precioFinal || o.precioAprobado || 0);
    }, 0);
  }, [ordenesCerradasHoy]);

  const facturasHoy = useMemo(() => {
    return facturas.filter(f => f.fechaEmision && isSameDay(f.fechaEmision, fechaInicio));
  }, [facturas, fechaInicio]);

  // Efectivo por técnico
  const efectivoPorTecnico = useMemo(() => {
    const grupos: Record<string, { tecnicoNombre: string; tecnicoId: string; ordenes: OrdenServicio[]; monto: number; entregado: boolean }> = {};
    ordenesCerradasHoy
      .filter(o => o.metodoPagoCierre === 'efectivo')
      .forEach(o => {
        const id = o.tecnicoId || 'sin-asignar';
        const nombre = o.tecnicoNombre || 'Sin asignar';
        if (!grupos[id]) grupos[id] = { tecnicoId: id, tecnicoNombre: nombre, ordenes: [], monto: 0, entregado: true };
        grupos[id].ordenes.push(o);
        grupos[id].monto += o.soloChequeo ? (o.precioChequeo || 0) : (o.precioFinal || o.precioAprobado || 0);
        // entregado=true sólo si TODAS las órdenes del técnico están entregadas
        if (!o.efectivoEntregado) grupos[id].entregado = false;
      });
    return Object.values(grupos).sort((a, b) => b.monto - a.monto);
  }, [ordenesCerradasHoy]);

  const efectivoTotal = efectivoPorTecnico.reduce((sum, t) => sum + t.monto, 0);

  // Transferencias por banco
  const transferenciasPorBanco = useMemo(() => {
    const grupos: Record<string, { banco: string; cantidad: number; monto: number }> = {};
    ordenesCerradasHoy
      .filter(o => o.metodoPagoCierre === 'transferencia')
      .forEach(o => {
        const banco = o.bancoDestinoCierre || 'Sin banco';
        if (!grupos[banco]) grupos[banco] = { banco, cantidad: 0, monto: 0 };
        grupos[banco].cantidad++;
        grupos[banco].monto += o.soloChequeo ? (o.precioChequeo || 0) : (o.precioFinal || o.precioAprobado || 0);
      });
    return Object.values(grupos).sort((a, b) => b.monto - a.monto);
  }, [ordenesCerradasHoy]);

  const transferenciasTotal = transferenciasPorBanco.reduce((sum, t) => sum + t.monto, 0);

  // Órdenes activas al final del día (no cerradas, no canceladas, no eliminadas, fechaCita en o antes del día)
  const ordenesActivasHoy = useMemo(() => {
    return ordenes.filter(o =>
      !o.eliminada &&
      !['cerrado', 'cancelado'].includes(o.fase) &&
      o.fechaCita && o.fechaCita <= fechaFin
    );
  }, [ordenes, fechaFin]);

  const alertas = useMemo(() => getAlertasFromOrdenes(ordenes), [ordenes]);

  const handleMarcarEfectivoEntregado = async (tecnicoId: string, ordenesT: OrdenServicio[]) => {
    setMarcandoEfectivoTec(tecnicoId);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const ahora = Timestamp.now();
      await Promise.all(ordenesT.map(o =>
        updateDoc(doc(db, 'ordenes_servicio', o.id), {
          efectivoEntregado: true,
          efectivoEntregadoPor: usuario,
          efectivoEntregadoEn: ahora,
          updatedAt: ahora,
        }).catch(err => console.error('Error marcando efectivo en orden', o.id, err))
      ));
      toast.success(`Efectivo de ${ordenesT[0]?.tecnicoNombre || 'técnico'} marcado como entregado`);
    } finally {
      setMarcandoEfectivoTec(null);
    }
  };

  const handleConfirmarCierre = async () => {
    if (!puedeCerrar) {
      toast.error('No tienes permiso para cerrar el día');
      return;
    }
    setCerrando(true);
    try {
      const transferenciasMap: Record<string, number> = {};
      transferenciasPorBanco.forEach(t => { transferenciasMap[t.banco] = t.monto; });
      const data: Record<string, unknown> = {
        fecha: Timestamp.fromDate(fechaInicio),
        cerradoPor: userProfile?.nombre || 'Sistema',
        cerradoPorId: userProfile?.id || '',
        fechaCierre: Timestamp.now(),
        totalOrdenesCerradas: ordenesCerradasHoy.length,
        totalChequeos: ordenesChequeoHoy.length,
        totalIngresos,
        efectivoTotal,
        transferenciasTotal: transferenciasMap,
        ordenesActivasAlCierre: ordenesActivasHoy.map(o => o.id),
      };
      const docRef = await addDoc(collection(db, 'cierres_dia'), data);
      setCierreExistente({ id: docRef.id, ...data, fecha: fechaInicio, fechaCierre: new Date() });
      toast.success('Día cerrado correctamente');
      setShowConfirmar(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al cerrar el día');
    } finally {
      setCerrando(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando cierre del día..." />;

  if (!puedeCerrar) {
    return (
      <div className="p-6 text-center">
        <Lock size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">No tienes permiso para acceder al cierre del día.</p>
      </div>
    );
  }

  const fechaTextoLargo = format(fechaInicio, "EEEE dd 'de' MMMM yyyy", { locale: es });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <ClipboardCheck size={24} /> Cierre del Día
          </h1>
          <p className="text-gray-500 text-sm capitalize">{fechaTextoLargo}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={fechaSel}
            onChange={e => setFechaSel(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
          />
          {cierreExistente ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-300 rounded-xl text-sm text-green-800">
              <Lock size={14} />
              Día cerrado el {formatFecha(cierreExistente.fechaCierre)} por {cierreExistente.cerradoPor}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmar(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-medium text-white rounded-xl text-sm font-medium transition-colors"
            >
              <ClipboardCheck size={14} /> Cerrar día
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg"><FileText size={18} className="text-blue-600" /></div>
            <span className="text-xs font-medium text-gray-500 uppercase">Órdenes cerradas</span>
          </div>
          <p className="text-2xl font-bold text-primary">{ordenesCerradasHoy.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg"><AlertTriangle size={18} className="text-yellow-600" /></div>
            <span className="text-xs font-medium text-gray-500 uppercase">Solo chequeo</span>
          </div>
          <p className="text-2xl font-bold text-primary">{ordenesChequeoHoy.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-green-50 rounded-lg"><DollarSign size={18} className="text-green-600" /></div>
            <span className="text-xs font-medium text-gray-500 uppercase">Ingresos cobrados</span>
          </div>
          <p className="text-2xl font-bold text-primary">{formatMoneda(totalIngresos)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg"><FileText size={18} className="text-purple-600" /></div>
            <span className="text-xs font-medium text-gray-500 uppercase">Facturas emitidas</span>
          </div>
          <p className="text-2xl font-bold text-primary">{facturasHoy.length}</p>
        </div>
      </div>

      {/* Efectivo por técnico */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
            <Truck size={16} /> Efectivo a entregar a oficina
          </h2>
          <span className="text-sm font-bold text-primary">Total: {formatMoneda(efectivoTotal)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Técnico</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Órdenes</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Monto</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody>
              {efectivoPorTecnico.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Sin pagos en efectivo registrados</td></tr>
              ) : efectivoPorTecnico.map(t => {
                // SPRINT-132: (p.uid || p.id) — t.tecnicoId puede ser auth.uid post-c4be345.
                const tec = personal.find(p => (p.uid || p.id) === t.tecnicoId);
                return (
                  <tr key={t.tecnicoId} className="border-b border-gray-50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: tec?.color || '#0f3460' }}>
                          {t.tecnicoNombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="font-medium text-gray-900">{t.tecnicoNombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center text-gray-700">{t.ordenes.length}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{formatMoneda(t.monto)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {t.entregado ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <Check size={11} /> Entregado
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMarcarEfectivoEntregado(t.tecnicoId, t.ordenes)}
                          disabled={marcandoEfectivoTec === t.tecnicoId || !!cierreExistente}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-60"
                        >
                          {marcandoEfectivoTec === t.tecnicoId ? 'Marcando...' : 'Marcar como entregado'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transferencias por banco */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide">Transferencias recibidas</h2>
          <span className="text-sm font-bold text-primary">Total: {formatMoneda(transferenciasTotal)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Banco</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Cantidad</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Monto</th>
              </tr>
            </thead>
            <tbody>
              {transferenciasPorBanco.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-400">Sin transferencias registradas</td></tr>
              ) : transferenciasPorBanco.map(t => (
                <tr key={t.banco} className="border-b border-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{t.banco}</td>
                  <td className="px-5 py-3.5 text-center text-gray-700">{t.cantidad}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{formatMoneda(t.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Órdenes aún activas */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide">
            Órdenes aún activas ({ordenesActivasHoy.length})
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Considera marcarlas como pendientes para mañana o cerrarlas antes del cierre del día.
        </p>
        {ordenesActivasHoy.length === 0 ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
            No hay órdenes pendientes para hoy.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {ordenesActivasHoy.slice(0, 50).map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                <span className="font-mono font-semibold text-primary">{o.numero}</span>
                <span className="flex-1 mx-3 truncate text-gray-700">{o.clienteNombre} · {o.equipoTipo}</span>
                <span className="text-gray-500">{o.tecnicoNombre || 'Sin asignar'}</span>
              </div>
            ))}
            {ordenesActivasHoy.length > 50 && (
              <p className="text-[11px] text-gray-400 text-center mt-2">
                Mostrando 50 de {ordenesActivasHoy.length} — revisa el módulo de Órdenes para el detalle completo.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">
            Alertas sin resolver ({alertas.length})
          </h2>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {alertas.slice(0, 30).map(a => (
              <div key={a.id} className={`text-xs p-2 rounded-lg ${a.tipo === 'roja' ? 'bg-red-50 text-red-800' : 'bg-orange-50 text-orange-800'}`}>
                {a.mensaje}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal confirmar cierre */}
      <Modal
        isOpen={showConfirmar}
        onClose={() => setShowConfirmar(false)}
        title="Confirmar cierre del día"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Vas a cerrar el día <span className="font-semibold capitalize">{fechaTextoLargo}</span>.
            Después del cierre, este día queda registrado y no se puede marcar efectivo entregado en él.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1 text-gray-700">
            <div className="flex justify-between"><span>Órdenes cerradas</span><span className="font-semibold">{ordenesCerradasHoy.length}</span></div>
            <div className="flex justify-between"><span>Solo chequeo</span><span className="font-semibold">{ordenesChequeoHoy.length}</span></div>
            <div className="flex justify-between"><span>Ingresos totales</span><span className="font-semibold">{formatMoneda(totalIngresos)}</span></div>
            <div className="flex justify-between"><span>Efectivo</span><span className="font-semibold">{formatMoneda(efectivoTotal)}</span></div>
            <div className="flex justify-between"><span>Transferencias</span><span className="font-semibold">{formatMoneda(transferenciasTotal)}</span></div>
            <div className="flex justify-between"><span>Órdenes activas al cierre</span><span className="font-semibold">{ordenesActivasHoy.length}</span></div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowConfirmar(false)} disabled={cerrando}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">
              Cancelar
            </button>
            <button type="button" onClick={handleConfirmarCierre} disabled={cerrando}
              className="px-5 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2">
              <ClipboardCheck size={14} />
              {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
