import { useState, useEffect, useMemo, Fragment } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LiquidacionNomina, LiquidacionEmpleado, ComisionRegistro } from '../types';
import { formatMoneda, formatFecha } from '../utils';
import { calcularQuincenaActual, listarUltimasQuincenas } from '../utils/comisiones';
import { generarLiquidacion, cerrarLiquidacion, marcarEmpleadoPagado, parseLiquidacion } from '../services/nomina.service';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Wallet, Plus, Lock, Download, ChevronDown, ChevronRight, Check, AlertTriangle, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Nomina() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador';
  const esCoord = userProfile?.rol === 'coordinadora';
  const puedeVer = esAdmin || esCoord;

  const [loading, setLoading] = useState(true);
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionNomina[]>([]);
  const [comisionesAll, setComisionesAll] = useState<ComisionRegistro[]>([]);
  const [filtroQuincena, setFiltroQuincena] = useState<string>(calcularQuincenaActual(new Date()));
  const [generando, setGenerando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [empleadosExpandidos, setEmpleadosExpandidos] = useState<Set<string>>(new Set());

  // Modal pago
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoTarget, setPagoTarget] = useState<{ liqId: string; emp: LiquidacionEmpleado } | null>(null);
  const [pagoForm, setPagoForm] = useState<{ metodo: 'efectivo' | 'transferencia' | 'cheque'; banco: string; notas: string }>({
    metodo: 'transferencia', banco: '', notas: '',
  });
  const [pagoSaving, setPagoSaving] = useState(false);

  // Modal confirmar cierre
  const [showCierreModal, setShowCierreModal] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'liquidaciones_nomina'), orderBy('fechaGeneracion', 'desc')),
      (snap) => {
        setLiquidaciones(snap.docs.map(d => parseLiquidacion(d.id, d.data() as Record<string, unknown>)));
        setLoading(false);
      }
    );
    const unsubC = onSnapshot(collection(db, 'comisiones'), (snap) => {
      setComisionesAll(snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          tecnicoId: raw.tecnicoId || '',
          tecnicoNombre: raw.tecnicoNombre || '',
          ordenId: raw.ordenId || '',
          ordenNumero: raw.ordenNumero || '',
          clienteNombre: raw.clienteNombre || '',
          fechaCobro: raw.fechaCobro?.toDate?.() || new Date(),
          precioFinal: raw.precioFinal || 0,
          costoPiezas: raw.costoPiezas || 0,
          basePendienteComision: raw.basePendienteComision || 0,
          comisionPorcentaje: raw.comisionPorcentaje || 0,
          comisionMonto: raw.comisionMonto || 0,
          estadoLiquidacion: raw.estadoLiquidacion || 'pendiente',
          quincenaAsignada: raw.quincenaAsignada,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        } as ComisionRegistro;
      }));
    });
    return () => { unsub(); unsubC(); };
  }, []);

  const quincenasDisponibles = useMemo(() => listarUltimasQuincenas(12), []);
  const liqActual = useMemo(
    () => liquidaciones.find(l => l.quincena === filtroQuincena) || null,
    [liquidaciones, filtroQuincena]
  );

  const handleGenerar = async () => {
    if (!userProfile) return;
    setGenerando(true);
    try {
      await generarLiquidacion(filtroQuincena, userProfile);
      toast.success(`Liquidación de ${filtroQuincena} generada`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al generar liquidación';
      toast.error(msg);
    } finally {
      setGenerando(false);
    }
  };

  const handleCerrar = async () => {
    if (!liqActual || !userProfile) return;
    setCerrando(true);
    try {
      await cerrarLiquidacion(liqActual.id, userProfile);
      toast.success('Liquidación cerrada. Comisiones marcadas como liquidadas.');
      setShowCierreModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cerrar';
      toast.error(msg);
    } finally {
      setCerrando(false);
    }
  };

  const abrirPago = (liqId: string, emp: LiquidacionEmpleado) => {
    setPagoTarget({ liqId, emp });
    setPagoForm({ metodo: 'transferencia', banco: '', notas: '' });
    setShowPagoModal(true);
  };

  const cerrarPago = () => {
    setShowPagoModal(false);
    setPagoTarget(null);
    setPagoSaving(false);
  };

  const handleConfirmarPago = async () => {
    if (!pagoTarget || !userProfile) return;
    setPagoSaving(true);
    try {
      await marcarEmpleadoPagado(
        pagoTarget.liqId,
        pagoTarget.emp.personalId,
        pagoForm.metodo,
        userProfile,
        pagoForm.metodo === 'transferencia' ? pagoForm.banco : undefined,
      );
      toast.success(`${pagoTarget.emp.personalNombre} marcado como pagado`);
      cerrarPago();
    } catch (err) {
      console.error(err);
      toast.error('Error al marcar pagado');
    } finally {
      setPagoSaving(false);
    }
  };

  const toggleEmpleado = (id: string) => {
    setEmpleadosExpandidos(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const exportarCSV = () => {
    if (!liqActual) return;
    const headers = 'Personal,Rol,Sueldo Base,Comisiones,Bono,Total Devengado,Pagado,Método de Pago\n';
    const rows = liqActual.empleados.map(e =>
      [
        `"${e.personalNombre}"`,
        e.rol,
        e.sueldoBase,
        e.totalComisiones,
        e.bono || 0,
        e.totalDevengado,
        e.pagado ? 'Sí' : 'No',
        e.metodoPago || '',
      ].join(',')
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomina_${liqActual.quincena}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando nómina..." />;
  if (!puedeVer) {
    return (
      <div className="p-6 text-center">
        <Lock size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">No tienes permiso para acceder a la nómina.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <Wallet size={24} /> Nómina Quincenal
          </h1>
          <p className="text-gray-500 text-sm">Quincena {filtroQuincena}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filtroQuincena} onChange={e => setFiltroQuincena(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
            {quincenasDisponibles.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          {liqActual ? (
            <>
              <button type="button" onClick={exportarCSV}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                <Download size={14} /> Exportar CSV
              </button>
              {liqActual.estado === 'abierta' && esAdmin && (
                <button type="button" onClick={() => setShowCierreModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl">
                  <Lock size={14} /> Cerrar liquidación
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={handleGenerar} disabled={generando}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0f3460] hover:bg-[#1a5fa8] rounded-xl disabled:opacity-60">
              <Plus size={14} /> {generando ? 'Generando...' : 'Generar liquidación'}
            </button>
          )}
        </div>
      </div>

      {liqActual && (
        <>
          {/* Banner estado */}
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
            liqActual.estado === 'cerrada' ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'
          }`}>
            {liqActual.estado === 'cerrada' ? <Lock size={18} className="text-gray-600 mt-0.5" /> : <AlertTriangle size={18} className="text-blue-600 mt-0.5" />}
            <div className="text-xs text-gray-700">
              <p className="font-semibold">
                {liqActual.estado === 'cerrada' ? 'Liquidación cerrada' : 'Liquidación abierta (recalculable)'}
              </p>
              <p>Generada por {liqActual.generadaPor} · {formatFecha(liqActual.fechaGeneracion)}</p>
              {liqActual.estado === 'cerrada' && liqActual.cerradaPor && (
                <p>Cerrada por {liqActual.cerradaPor}{liqActual.fechaCierre ? ` · ${formatFecha(liqActual.fechaCierre)}` : ''}</p>
              )}
            </div>
            <p className="ml-auto text-xl font-bold text-[#0f3460]">{formatMoneda(liqActual.totalNomina)}</p>
          </div>

          {/* Tabla empleados */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Personal</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Sueldo base</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Comisiones</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Bono</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Total devengado</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Pago</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {liqActual.empleados.map(emp => {
                    const expand = empleadosExpandidos.has(emp.personalId);
                    const sueldoSolo = emp.totalDevengado === 0;
                    return (
                      <Fragment key={emp.personalId}>
                        <tr className={`border-b border-gray-50 hover:bg-gray-50 ${sueldoSolo && emp.sueldoBase === 0 ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => toggleEmpleado(emp.personalId)}
                              className="flex items-center gap-2 text-left hover:text-[#1a5fa8]">
                              {emp.comisionesIds.length > 0
                                ? (expand ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />)
                                : <span className="w-[14px]" />}
                              <span className="font-medium text-gray-900">{emp.personalNombre}</span>
                            </button>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 capitalize">{emp.rol}</td>
                          <td className="px-3 py-3 text-right text-gray-700">{formatMoneda(emp.sueldoBase)}</td>
                          <td className="px-3 py-3 text-right">
                            {emp.totalComisiones > 0 ? (
                              <div>
                                <p className="font-semibold text-emerald-700">{formatMoneda(emp.totalComisiones)}</p>
                                <p className="text-[10px] text-gray-400">{emp.cantidadOrdenesConComision} orden(es)</p>
                              </div>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {emp.bono ? (
                              <div>
                                <p className="font-semibold text-emerald-700">{formatMoneda(emp.bono)}</p>
                                {emp.desempenoPorcentaje !== undefined && (
                                  <p className="text-[10px] text-gray-400">{(emp.desempenoPorcentaje * 100).toFixed(0)}% desempeño</p>
                                )}
                              </div>
                            ) : emp.desempenoPorcentaje !== undefined ? (
                              <span className="text-xs text-gray-400">{(emp.desempenoPorcentaje * 100).toFixed(0)}% (no aplica)</span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-[#0f3460]">{formatMoneda(emp.totalDevengado)}</td>
                          <td className="px-3 py-3 text-center">
                            {emp.pagado ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                <Check size={10} /> Pagado · {emp.metodoPago}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {!emp.pagado && emp.totalDevengado > 0 && (
                              <button type="button" onClick={() => abrirPago(liqActual.id, emp)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                                <DollarSign size={12} /> Marcar pagado
                              </button>
                            )}
                          </td>
                        </tr>
                        {expand && emp.comisionesIds.length > 0 && (
                          <tr className="bg-gray-50/50">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold text-gray-600 uppercase mb-1">Comisiones incluidas</p>
                                {comisionesAll
                                  .filter(c => emp.comisionesIds.includes(c.id))
                                  .map(c => (
                                    <div key={c.id} className="flex items-center justify-between text-xs px-3 py-1.5 bg-white rounded border border-gray-100">
                                      <div className="flex items-center gap-3">
                                        <span className="font-mono font-semibold text-[#0f3460]">{c.ordenNumero}</span>
                                        <span className="text-gray-700">{c.clienteNombre}</span>
                                        <span className="text-gray-400">{formatFecha(c.fechaCobro)}</span>
                                      </div>
                                      <span className="font-semibold text-emerald-700">{formatMoneda(c.comisionMonto)}</span>
                                    </div>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={5} className="px-3 py-3 text-right text-sm font-semibold text-gray-700">TOTAL</td>
                    <td className="px-3 py-3 text-right text-lg font-bold text-[#0f3460]">{formatMoneda(liqActual.totalNomina)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {!liqActual && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Wallet size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-2">Aún no hay liquidación generada para {filtroQuincena}</p>
          <p className="text-xs text-gray-400">Pulsa "Generar liquidación" para crear el cálculo de esta quincena.</p>
        </div>
      )}

      {/* Modal pago */}
      <Modal isOpen={showPagoModal} onClose={cerrarPago}
        title={pagoTarget ? `Marcar pago: ${pagoTarget.emp.personalNombre}` : 'Marcar pago'}>
        {pagoTarget && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-900">
              Total a pagar: <span className="font-bold">{formatMoneda(pagoTarget.emp.totalDevengado)}</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago *</label>
              <select value={pagoForm.metodo}
                onChange={e => setPagoForm(f => ({ ...f, metodo: e.target.value as 'efectivo' | 'transferencia' | 'cheque' }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {pagoForm.metodo === 'transferencia' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Banco destino (opcional)</label>
                <input type="text" value={pagoForm.banco}
                  onChange={e => setPagoForm(f => ({ ...f, banco: e.target.value }))}
                  placeholder="Banreservas, Popular, BHD..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
              <textarea rows={2} value={pagoForm.notas}
                onChange={e => setPagoForm(f => ({ ...f, notas: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={cerrarPago} disabled={pagoSaving}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={handleConfirmarPago} disabled={pagoSaving}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {pagoSaving ? 'Guardando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal cierre */}
      <Modal isOpen={showCierreModal} onClose={() => setShowCierreModal(false)} title="Cerrar liquidación">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Al cerrar, las {liqActual?.empleados.reduce((s, e) => s + e.comisionesIds.length, 0) || 0} comisión(es)
              de esta quincena quedarán marcadas como liquidadas y NO se podrán re-asignar a otra quincena.
            </span>
          </div>
          <p className="text-sm text-gray-700">
            Total a liquidar: <span className="font-bold">{formatMoneda(liqActual?.totalNomina || 0)}</span>
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCierreModal(false)} disabled={cerrando}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60">Cancelar</button>
            <button type="button" onClick={handleCerrar} disabled={cerrando}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
