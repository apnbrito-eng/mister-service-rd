import { useState, useEffect, useMemo } from 'react';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PrestamoEmpleado, Personal } from '../types';
import { formatMoneda, formatFecha } from '../utils';
import { suscribirPrestamos, cancelarPrestamo } from '../services/prestamos.service';
import { useApp } from '../context/AppContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import {
  Wallet, Lock, ChevronDown, ChevronRight, XCircle, CheckCircle, AlertCircle,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';

type FiltroEstado = 'activos' | 'pagados' | 'cancelados' | 'todos';

export default function Prestamos() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador';
  const esCoord = userProfile?.rol === 'coordinadora';
  const puedeVer = esAdmin || esCoord;

  const [loading, setLoading] = useState(true);
  const [prestamos, setPrestamos] = useState<PrestamoEmpleado[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos');
  const [filtroPersonal, setFiltroPersonal] = useState<string>('');
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  // Modal cancelar préstamo
  const [showCancelarModal, setShowCancelarModal] = useState(false);
  const [prestamoCancelar, setPrestamoCancelar] = useState<PrestamoEmpleado | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    const unsub = suscribirPrestamos(items => {
      // Orden: activos primero, después por createdAt desc
      const ordenados = [...items].sort((a, b) => {
        if (a.estado === 'activo' && b.estado !== 'activo') return -1;
        if (a.estado !== 'activo' && b.estado === 'activo') return 1;
        const at = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const bt = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return bt - at;
      });
      setPrestamos(ordenados);
      setLoading(false);
    });
    const unsubP = onSnapshot(
      query(collection(db, 'personal'), where('activo', '==', true)),
      snap => setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal))),
    );
    return () => { unsub(); unsubP(); };
  }, []);

  const prestamosFiltrados = useMemo(() => {
    return prestamos.filter(p => {
      if (filtroEstado === 'activos' && p.estado !== 'activo') return false;
      if (filtroEstado === 'pagados' && p.estado !== 'pagado') return false;
      if (filtroEstado === 'cancelados' && p.estado !== 'cancelado') return false;
      if (filtroPersonal && p.personalId !== filtroPersonal) return false;
      return true;
    });
  }, [prestamos, filtroEstado, filtroPersonal]);

  const totales = useMemo(() => {
    const activos = prestamos.filter(p => p.estado === 'activo');
    return {
      cantidadActivos: activos.length,
      saldoActivoTotal: activos.reduce((s, p) => s + p.saldoPendiente, 0),
      cuotaQuincenalTotal: activos.reduce((s, p) => s + Math.min(p.montoCuota, p.saldoPendiente), 0),
    };
  }, [prestamos]);

  const toggleExpand = (id: string) => {
    setExpandido(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const abrirCancelar = (p: PrestamoEmpleado) => {
    setPrestamoCancelar(p);
    setMotivoCancelar('');
    setShowCancelarModal(true);
  };

  const handleCancelar = async () => {
    if (!prestamoCancelar || !userProfile) return;
    if (!motivoCancelar.trim()) {
      toast.error('El motivo es obligatorio');
      return;
    }
    setCancelando(true);
    try {
      await cancelarPrestamo(
        prestamoCancelar.id,
        motivoCancelar.trim(),
        userProfile.id,
        userProfile.nombre,
      );
      toast.success('Préstamo cancelado');
      setShowCancelarModal(false);
      setPrestamoCancelar(null);
      setMotivoCancelar('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar préstamo';
      toast.error(msg);
    } finally {
      setCancelando(false);
    }
  };

  const empleadosOpts = personal.filter(p =>
    ['tecnico', 'operaria', 'coordinadora', 'secretaria'].includes(p.rol)
  );

  if (loading) return <LoadingSpinner fullPage text="Cargando préstamos..." />;
  if (!puedeVer) {
    return (
      <div className="p-6 text-center">
        <Lock size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">No tienes permiso para ver los préstamos a empleados.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <Wallet size={24} /> Préstamos a empleados
          </h1>
          <p className="text-gray-500 text-sm">
            Préstamos programados que se descuentan automáticamente en cuotas quincenales.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Préstamos activos</p>
          <p className="text-2xl font-bold text-[#0f3460]">{totales.cantidadActivos}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Saldo total pendiente</p>
          <p className="text-2xl font-bold text-amber-600">{formatMoneda(totales.saldoActivoTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Cuota quincenal estimada</p>
          <p className="text-2xl font-bold text-blue-600">{formatMoneda(totales.cuotaQuincenalTotal)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value as FiltroEstado)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        >
          <option value="activos">Activos</option>
          <option value="pagados">Pagados</option>
          <option value="cancelados">Cancelados</option>
          <option value="todos">Todos</option>
        </select>
        <select
          value={filtroPersonal}
          onChange={e => setFiltroPersonal(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        >
          <option value="">Todos los empleados</option>
          {empleadosOpts.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {prestamosFiltrados.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Wallet size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay préstamos que coincidan con el filtro.</p>
          <p className="text-xs text-gray-400 mt-2">
            Para crear un préstamo, andá a /admin/nomina, abrí una liquidación y pulsá "+ Descuento" en una fila.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {prestamosFiltrados.map(p => {
            const expandido_ = expandido.has(p.id);
            const progreso = p.cuotasTotales > 0 ? (p.cuotasPagadas / p.cuotasTotales) : 0;
            return (
              <div key={p.id} className={`bg-white rounded-2xl border p-4 ${
                p.estado === 'activo' ? 'border-amber-200' :
                p.estado === 'pagado' ? 'border-green-200' :
                'border-gray-200 opacity-70'
              }`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{p.personalNombre}</h3>
                      <span className="text-xs text-gray-500 capitalize">· {p.personalRol}</span>
                      {p.estado === 'activo' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <AlertCircle size={10} /> Activo
                        </span>
                      )}
                      {p.estado === 'pagado' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          <CheckCircle size={10} /> Pagado
                        </span>
                      )}
                      {p.estado === 'cancelado' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          <XCircle size={10} /> Cancelado
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{p.motivo}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Creado por {p.creadoPorNombre} · {formatFecha(p.createdAt instanceof Date ? p.createdAt : new Date())}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-right text-xs">
                    <div>
                      <p className="text-gray-500">Monto total</p>
                      <p className="font-semibold text-gray-900">{formatMoneda(p.montoTotal)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Por cuota</p>
                      <p className="font-semibold text-gray-900">{formatMoneda(p.montoCuota)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Cuotas</p>
                      <p className="font-semibold text-gray-900">{p.cuotasPagadas}/{p.cuotasTotales}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Saldo pendiente</p>
                      <p className={`font-bold ${p.estado === 'activo' ? 'text-amber-600' : 'text-gray-700'}`}>
                        {formatMoneda(p.saldoPendiente)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      p.estado === 'pagado' ? 'bg-green-500' :
                      p.estado === 'cancelado' ? 'bg-gray-400' :
                      'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.round(progreso * 100))}%` }}
                  />
                </div>

                {/* Acciones */}
                <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-[#1a5fa8]"
                  >
                    {expandido_ ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Ver historial ({p.cuotasHistorial.length} cuota{p.cuotasHistorial.length !== 1 ? 's' : ''})
                  </button>
                  {p.estado === 'activo' && esAdmin && (
                    <button
                      type="button"
                      onClick={() => abrirCancelar(p)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
                    >
                      <XCircle size={12} /> Cancelar préstamo
                    </button>
                  )}
                </div>

                {expandido_ && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {p.cuotasHistorial.length === 0 ? (
                      <p className="text-xs text-gray-400">Aún no se ha aplicado ninguna cuota.</p>
                    ) : (
                      <div className="space-y-1">
                        {p.cuotasHistorial.map(c => (
                          <div key={`${c.numero}-${c.liquidacionId}`} className="flex items-center justify-between text-xs px-3 py-1.5 bg-gray-50 rounded">
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-semibold text-[#0f3460]">Cuota {c.numero}</span>
                              <span className="text-gray-700">{c.quincena}</span>
                              <span className="text-gray-400">{formatFecha(c.fechaAplicacion instanceof Date ? c.fechaAplicacion : new Date())}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-red-600">-{formatMoneda(c.monto)}</span>
                              <span className="text-gray-400">Saldo: {formatMoneda(c.saldoRestante)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {p.estado === 'cancelado' && p.motivoCancelacion && (
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2">
                        <p className="font-semibold text-gray-700">Cancelado:</p>
                        <p>{p.motivoCancelacion}</p>
                        {p.canceladoPorNombre && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            por {p.canceladoPorNombre}
                            {p.canceladoEn ? ` · ${formatFecha(p.canceladoEn instanceof Date ? p.canceladoEn : new Date())}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal cancelar préstamo */}
      <Modal
        isOpen={showCancelarModal}
        onClose={() => !cancelando && setShowCancelarModal(false)}
        title="Cancelar préstamo"
      >
        {prestamoCancelar && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
              Vas a cancelar el préstamo de <strong>{prestamoCancelar.personalNombre}</strong>.
              Saldo pendiente: <strong>{formatMoneda(prestamoCancelar.saldoPendiente)}</strong>.
              <br />
              <span className="text-xs">
                Las cuotas ya aplicadas a liquidaciones cerradas NO se afectan.
                Solo se previenen futuras cuotas.
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de cancelación *</label>
              <textarea
                rows={3}
                value={motivoCancelar}
                onChange={e => setMotivoCancelar(e.target.value)}
                placeholder="Ej: empleado salió de la empresa, condonación, error administrativo..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelarModal(false)}
                disabled={cancelando}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                disabled={cancelando}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {cancelando ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

