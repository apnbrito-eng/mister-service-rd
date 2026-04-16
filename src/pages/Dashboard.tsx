import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Bell, Clock, DollarSign, AlertTriangle,
  ChevronRight, Calendar, User, TrendingUp, Wrench,
  FileText, Receipt, BarChart3, Users, Timer, Package
} from 'lucide-react';
import { differenceInDays, startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  OrdenServicio, StandbyPieza, Factura, Cotizacion, Personal, Gasto, FaseOrden
} from '../types';
import {
  faseLabel, faseBgColor, faseColor, formatMoneda, formatHora,
  getAlertasFromOrdenes, getStandbyAlertas, tiempoTranscurrido,
  estadoSimpleLabel, parseOrden, getTecnicoColor, TIPOS_EQUIPO
} from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import Badge from '../components/Badge';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FASES_EMBUDO: FaseOrden[] = [
  'nuevo_lead', 'en_gestion', 'en_diagnostico', 'en_cotizacion',
  'aprobado', 'agendado', 'trabajo_realizado', 'cerrado', 'cancelado',
];

type PeriodoVentas = 'hoy' | 'semana' | 'mes' | 'año';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const navigate = useNavigate();

  // ---- state ----
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [standbyItems, setStandbyItems] = useState<StandbyPieza[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [periodoVentas, setPeriodoVentas] = useState<PeriodoVentas>('mes');

  // ---- real-time listeners ----
  useEffect(() => {
    let loadedCount = 0;
    const total = 6;
    const checkLoaded = () => { loadedCount++; if (loadedCount >= total) setLoading(false); };

    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const data = snap.docs.map(d => parseOrden(d.id, d.data()) as OrdenServicio);
      setOrdenes(data);
      checkLoaded();
    });

    const unsubStandby = onSnapshot(collection(db, 'standby_piezas'), (snap) => {
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        fechaInicio: d.data().fechaInicio?.toDate?.() || new Date(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
      } as StandbyPieza));
      setStandbyItems(data);
      checkLoaded();
    });

    const unsubFacturas = onSnapshot(collection(db, 'facturas'), (snap) => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          fechaEmision: raw.fechaEmision?.toDate?.() || new Date(),
          fechaPago: raw.fechaPago?.toDate?.() || null,
          fechaVencimiento: raw.fechaVencimiento?.toDate?.() || null,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        } as Factura;
      });
      setFacturas(data);
      checkLoaded();
    });

    const unsubCotizaciones = onSnapshot(collection(db, 'cotizaciones'), (snap) => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          createdAt: raw.createdAt?.toDate?.() || new Date(),
          updatedAt: raw.updatedAt?.toDate?.() || new Date(),
        } as Cotizacion;
      });
      setCotizaciones(data);
      checkLoaded();
    });

    const unsubGastos = onSnapshot(collection(db, 'gastos'), (snap) => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          fecha: raw.fecha?.toDate?.() || new Date(),
          createdAt: raw.createdAt?.toDate?.() || new Date(),
        } as Gasto;
      });
      setGastos(data);
      checkLoaded();
    });

    const unsubPersonal = onSnapshot(collection(db, 'personal'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal));
      setPersonal(data);
      checkLoaded();
    });

    return () => {
      unsubOrdenes(); unsubStandby(); unsubFacturas();
      unsubCotizaciones(); unsubGastos(); unsubPersonal();
    };
  }, []);

  // ---- derived data ----
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const inicioMes = startOfMonth(now);

  // KPI 1 - Cotizaciones pendientes
  const cotizacionesPendientes = useMemo(
    () => cotizaciones.filter(c => c.estado === 'borrador' || c.estado === 'enviada'),
    [cotizaciones]
  );
  const totalCotizacionesPendientes = useMemo(
    () => cotizacionesPendientes.reduce((s, c) => s + (c.total || 0), 0),
    [cotizacionesPendientes]
  );

  // KPI 2 - Ordenes activas hoy
  const ordenesActivasHoy = useMemo(
    () => ordenes.filter(o => o.estado === 'activo' && !['cerrado', 'cancelado'].includes(o.fase)),
    [ordenes]
  );

  // KPI 3 - Facturas emitidas
  const facturasEmitidas = useMemo(
    () => facturas.filter(f => f.estado === 'emitida'),
    [facturas]
  );
  const totalFacturasEmitidas = useMemo(
    () => facturasEmitidas.reduce((s, f) => s + (f.total || 0), 0),
    [facturasEmitidas]
  );

  // KPI 4 - Ingresos mes
  const facturasPagadasMes = useMemo(
    () => facturas.filter(f => f.estado === 'pagada' && f.fechaPago && f.fechaPago >= inicioMes),
    [facturas, inicioMes]
  );
  const ingresosMes = useMemo(
    () => facturasPagadasMes.reduce((s, f) => s + (f.total || 0), 0),
    [facturasPagadasMes]
  );

  // Ordenes atrasadas (>24h SLA)
  const ordenesAtrasadas = useMemo(() => {
    return ordenes
      .filter(o => {
        if (o.estado !== 'activo') return false;
        if (['cerrado', 'cancelado', 'trabajo_realizado'].includes(o.fase)) return false;
        const dias = differenceInDays(now, o.createdAt);
        return dias >= 1;
      })
      .map(o => ({ ...o, diasAtraso: differenceInDays(now, o.createdAt) }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [ordenes]);

  // Embudo conteo
  const faseConteo = useMemo(() => {
    const conteo: Record<string, number> = {};
    FASES_EMBUDO.forEach(f => { conteo[f] = ordenes.filter(o => o.fase === f).length; });
    return conteo;
  }, [ordenes]);

  // Alertas
  const alertasOrdenes = useMemo(() => getAlertasFromOrdenes(ordenes), [ordenes]);
  const alertasStandby = useMemo(() => getStandbyAlertas(standbyItems), [standbyItems]);
  const todasAlertas = useMemo(() => [...alertasOrdenes, ...alertasStandby], [alertasOrdenes, alertasStandby]);

  const alertasRojas = todasAlertas.filter(a => a.tipo === 'roja');
  const alertasNaranjas = todasAlertas.filter(a => a.tipo === 'naranja');

  // Ventas vs Gastos por periodo
  const periodoRange = useMemo(() => {
    switch (periodoVentas) {
      case 'hoy': return { start: today, end: tomorrow };
      case 'semana': return { start: startOfWeek(now, { locale: es }), end: tomorrow };
      case 'mes': return { start: inicioMes, end: tomorrow };
      case 'año': return { start: startOfYear(now), end: tomorrow };
    }
  }, [periodoVentas, now]);

  const ingresosPeriodo = useMemo(() => {
    return facturas
      .filter(f => f.estado === 'pagada' && f.fechaPago && f.fechaPago >= periodoRange.start && f.fechaPago < periodoRange.end)
      .reduce((s, f) => s + (f.total || 0), 0);
  }, [facturas, periodoRange]);

  const gastosPeriodo = useMemo(() => {
    return gastos
      .filter(g => g.fecha >= periodoRange.start && g.fecha < periodoRange.end)
      .reduce((s, g) => s + (g.monto || 0), 0);
  }, [gastos, periodoRange]);

  const maxVentasGastos = Math.max(ingresosPeriodo, gastosPeriodo, 1);

  // Balance pendiente
  const facturasPendientes = useMemo(() => facturas.filter(f => f.estado === 'emitida' || f.estado === 'vencida'), [facturas]);
  const pendientesMenos30 = useMemo(() => {
    return facturasPendientes.filter(f => differenceInDays(now, f.fechaEmision) < 30);
  }, [facturasPendientes]);
  const pendientesMas30 = useMemo(() => {
    return facturasPendientes.filter(f => differenceInDays(now, f.fechaEmision) >= 30);
  }, [facturasPendientes]);

  // Tecnicos activos
  const tecnicos = useMemo(() => personal.filter(p => p.rol === 'tecnico' && p.activo), [personal]);

  // Estado de casos por tecnico
  const casosPorTecnico = useMemo(() => {
    return tecnicos.map(t => {
      const ordenesT = ordenes.filter(o => o.tecnicoId === t.id || o.tecnicoNombre === t.nombre);
      const pendientes = ordenesT.filter(o => ['nuevo_lead', 'en_gestion', 'aprobado', 'agendado'].includes(o.fase) && o.estado === 'activo').length;
      const enProceso = ordenesT.filter(o => ['en_diagnostico', 'en_cotizacion'].includes(o.fase) && o.estado === 'activo').length;
      const completados = ordenesT.filter(o => ['trabajo_realizado', 'cerrado'].includes(o.fase)).length;
      return { tecnico: t, pendientes, enProceso, completados, total: pendientes + enProceso + completados };
    });
  }, [tecnicos, ordenes]);

  // Rendimiento por tecnico
  const rendimientoTecnicos = useMemo(() => {
    return tecnicos.map(t => {
      const ordenesT = ordenes.filter(o => o.tecnicoId === t.id || o.tecnicoNombre === t.nombre);
      const total = ordenesT.length;
      const completadas = ordenesT.filter(o => ['trabajo_realizado', 'cerrado'].includes(o.fase)).length;
      const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
      const montoFacturado = facturas
        .filter(f => f.estado === 'pagada' && ordenesT.some(o => o.id === f.ordenId))
        .reduce((s, f) => s + (f.total || 0), 0);
      return { tecnico: t, total, completadas, pct, montoFacturado };
    }).sort((a, b) => b.pct - a.pct);
  }, [tecnicos, ordenes, facturas]);

  // Reparaciones por tipo equipo
  const reparacionesPorTipo = useMemo(() => {
    const conteo: Record<string, number> = {};
    ordenes.forEach(o => {
      const tipo = o.equipoTipo || 'Otro';
      conteo[tipo] = (conteo[tipo] || 0) + 1;
    });
    return Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [ordenes]);
  const maxReparaciones = reparacionesPorTipo.length > 0 ? reparacionesPorTipo[0][1] : 1;

  // Agenda del dia
  const agendaHoy = useMemo(() => {
    return ordenes
      .filter(o => {
        const fc = o.fechaCita instanceof Date ? o.fechaCita : null;
        return fc && fc >= today && fc < tomorrow && o.estado === 'activo';
      })
      .sort((a, b) => (a.fechaCita?.getTime() || 0) - (b.fechaCita?.getTime() || 0));
  }, [ordenes]);

  // ---- loading ----
  if (loading) return <LoadingSpinner fullPage text="Cargando dashboard..." />;

  // ---- render ----
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f3460]">Dashboard</h1>
        <p className="text-gray-500 text-sm">
          {now.toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ======== 1. KPI CARDS ======== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Cotizaciones Pendientes"
          value={formatMoneda(totalCotizacionesPendientes)}
          subtitle={`${cotizacionesPendientes.length} pendiente${cotizacionesPendientes.length !== 1 ? 's' : ''}`}
          icon={<FileText size={22} />}
          color="bg-orange-500"
          onClick={() => navigate('/admin/cotizaciones')}
        />
        <KpiCard
          title="Órdenes Activas"
          value={ordenesActivasHoy.length}
          subtitle="activas hoy"
          icon={<ClipboardList size={22} />}
          color="bg-blue-500"
          onClick={() => navigate('/admin/ordenes')}
        />
        <KpiCard
          title="Facturas Emitidas"
          value={formatMoneda(totalFacturasEmitidas)}
          subtitle={`${facturasEmitidas.length} factura${facturasEmitidas.length !== 1 ? 's' : ''}`}
          icon={<Receipt size={22} />}
          color="bg-purple-500"
          onClick={() => navigate('/admin/facturas')}
        />
        <KpiCard
          title="Ingresos del Mes"
          value={formatMoneda(ingresosMes)}
          subtitle={`${facturasPagadasMes.length} pagada${facturasPagadasMes.length !== 1 ? 's' : ''}`}
          icon={<DollarSign size={22} />}
          color="bg-green-500"
          onClick={() => navigate('/admin/facturas')}
        />
      </div>

      {/* ======== 2. ORDENES ATRASADAS ======== */}
      {ordenesAtrasadas.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Timer size={20} className="text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">Órdenes Atrasadas (SLA &gt;24h)</h2>
            <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {ordenesAtrasadas.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 pr-4 font-medium">Número</th>
                  <th className="pb-2 pr-4 font-medium">Cliente</th>
                  <th className="pb-2 pr-4 font-medium">Fase</th>
                  <th className="pb-2 pr-4 font-medium">Técnico</th>
                  <th className="pb-2 font-medium text-right">Días de Atraso</th>
                </tr>
              </thead>
              <tbody>
                {ordenesAtrasadas.slice(0, 10).map(orden => (
                  <tr
                    key={orden.id}
                    onClick={() => navigate(`/admin/ordenes/${orden.id}`)}
                    className="border-b border-gray-50 hover:bg-red-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-4 font-mono font-medium text-[#0f3460]">
                      #{orden.numero}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-900">{orden.clienteNombre}</td>
                    <td className="py-2.5 pr-4"><Badge fase={orden.fase} /></td>
                    <td className="py-2.5 pr-4 text-gray-600">{orden.tecnicoNombre || 'Sin asignar'}</td>
                    <td className="py-2.5 text-right">
                      <span className={`font-bold ${orden.diasAtraso >= 3 ? 'text-red-600' : 'text-orange-600'}`}>
                        {orden.diasAtraso} día{orden.diasAtraso !== 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======== 3. EMBUDO VISUAL HORIZONTAL ======== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Embudo de Servicio</h2>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-1 min-w-max items-center">
            {FASES_EMBUDO.map((fase, index) => (
              <div key={fase} className="flex items-center">
                <button
                  onClick={() => navigate(`/admin/ordenes?fase=${fase}`)}
                  className="relative px-4 py-3 rounded-xl text-white text-center cursor-pointer hover:opacity-90 hover:scale-105 transition-all min-w-[110px]"
                  style={{ backgroundColor: faseBgColor(fase) }}
                >
                  <div className="text-2xl font-bold">{faseConteo[fase]}</div>
                  <div className="text-xs mt-0.5 opacity-90 leading-tight">{faseLabel(fase)}</div>
                </button>
                {index < FASES_EMBUDO.length - 1 && (
                  <ChevronRight size={18} className="text-gray-300 mx-0.5 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ======== 4. ALERTAS + 5. VENTAS/COMPRAS ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4. Alertas en tiempo real */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className="text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">Alertas en Tiempo Real</h2>
            {todasAlertas.length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {todasAlertas.length}
              </span>
            )}
          </div>

          {todasAlertas.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin alertas activas</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {/* Red alerts first */}
              {alertasRojas.length > 0 && (
                <div className="mb-1">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">Urgentes</p>
                  {alertasRojas.map(alerta => (
                    <div
                      key={alerta.id}
                      onClick={() => alerta.ordenId && navigate(`/admin/ordenes/${alerta.ordenId}`)}
                      className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-opacity bg-red-50 border border-red-100 mb-1.5"
                    >
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-red-500 animate-pulse" />
                      <p className="text-sm text-red-700">{alerta.mensaje}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Orange alerts */}
              {alertasNaranjas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1.5">Atención</p>
                  {alertasNaranjas.map(alerta => (
                    <div
                      key={alerta.id}
                      onClick={() => alerta.ordenId && navigate(`/admin/ordenes/${alerta.ordenId}`)}
                      className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-opacity bg-orange-50 border border-orange-100 mb-1.5"
                    >
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-orange-500" />
                      <p className="text-sm text-orange-700">{alerta.mensaje}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. Ventas / Compras */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={20} className="text-[#1a5fa8]" />
              <h2 className="text-lg font-semibold text-gray-900">Ingresos vs Gastos</h2>
            </div>
            <div className="flex gap-1">
              {(['hoy', 'semana', 'mes', 'año'] as PeriodoVentas[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodoVentas(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    periodoVentas === p
                      ? 'bg-[#0f3460] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 mt-6">
            {/* Ingresos bar */}
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">Ingresos</span>
                <span className="font-bold text-green-600">{formatMoneda(ingresosPeriodo)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max((ingresosPeriodo / maxVentasGastos) * 100, 2)}%` }}
                >
                  {ingresosPeriodo > 0 && (
                    <span className="text-xs font-bold text-white drop-shadow">
                      {formatMoneda(ingresosPeriodo)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Gastos bar */}
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">Gastos</span>
                <span className="font-bold text-red-600">{formatMoneda(gastosPeriodo)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max((gastosPeriodo / maxVentasGastos) * 100, 2)}%` }}
                >
                  {gastosPeriodo > 0 && (
                    <span className="text-xs font-bold text-white drop-shadow">
                      {formatMoneda(gastosPeriodo)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Balance */}
            <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-sm text-gray-500 font-medium">Balance</span>
              <span className={`text-lg font-bold ${ingresosPeriodo - gastosPeriodo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {ingresosPeriodo - gastosPeriodo >= 0 ? '+' : ''}{formatMoneda(ingresosPeriodo - gastosPeriodo)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======== 6. BALANCE PENDIENTE + 7. ESTADO CASOS POR TECNICO ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 6. Balance pendiente */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={20} className="text-[#1a5fa8]" />
            <h2 className="text-lg font-semibold text-gray-900">Balance Pendiente</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <p className="text-xs text-yellow-700 font-medium mb-1">&lt; 30 días</p>
              <p className="text-2xl font-bold text-yellow-800">{pendientesMenos30.length}</p>
              <p className="text-sm font-semibold text-yellow-700 mt-1">
                {formatMoneda(pendientesMenos30.reduce((s, f) => s + (f.total || 0), 0))}
              </p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-xs text-red-700 font-medium mb-1">&gt; 30 días</p>
              <p className="text-2xl font-bold text-red-800">{pendientesMas30.length}</p>
              <p className="text-sm font-semibold text-red-700 mt-1">
                {formatMoneda(pendientesMas30.reduce((s, f) => s + (f.total || 0), 0))}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-500">Total pendiente</span>
            <span className="text-lg font-bold text-[#0f3460]">
              {formatMoneda(facturasPendientes.reduce((s, f) => s + (f.total || 0), 0))}
            </span>
          </div>
        </div>

        {/* 7. Estado de casos por tecnico */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={20} className="text-[#1a5fa8]" />
            <h2 className="text-lg font-semibold text-gray-900">Estado de Casos por Técnico</h2>
          </div>
          {casosPorTecnico.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin técnicos registrados</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {casosPorTecnico.map(({ tecnico, pendientes, enProceso, completados }) => (
                <div key={tecnico.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: tecnico.color || getTecnicoColor(tecnico.nombre) }}
                  >
                    {tecnico.nombre.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tecnico.nombre}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                        {enProceso} en proceso
                      </span>
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        {completados} completado{completados !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ======== 8. RENDIMIENTO POR TECNICO + 9. REPARACIONES POR TIPO ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 8. Rendimiento por tecnico */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={20} className="text-[#1a5fa8]" />
            <h2 className="text-lg font-semibold text-gray-900">Rendimiento por Técnico</h2>
          </div>
          {rendimientoTecnicos.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin datos de rendimiento</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {rendimientoTecnicos.map(({ tecnico, pct, completadas, total, montoFacturado }) => (
                <div key={tecnico.id}>
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: tecnico.color || getTecnicoColor(tecnico.nombre) }}
                      >
                        {tecnico.nombre.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{tecnico.nombre}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-[#0f3460]">{pct}%</span>
                      <span className="text-xs text-gray-400 ml-1">({completadas}/{total})</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        backgroundColor: tecnico.color || getTecnicoColor(tecnico.nombre),
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Facturado: <span className="font-semibold text-gray-700">{formatMoneda(montoFacturado)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 9. Reparaciones por tipo de equipo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={20} className="text-[#1a5fa8]" />
            <h2 className="text-lg font-semibold text-gray-900">Reparaciones por Tipo de Equipo</h2>
          </div>
          {reparacionesPorTipo.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Wrench size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin reparaciones registradas</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {reparacionesPorTipo.map(([tipo, count], index) => (
                <div key={tipo} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400 w-5 text-right">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{tipo}</span>
                      <span className="text-sm font-bold text-[#0f3460] ml-2">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#0f3460] to-[#1a5fa8] rounded-full transition-all duration-500"
                        style={{ width: `${(count / maxReparaciones) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ======== 10. AGENDA DEL DIA ======== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Agenda del Día</h2>
          <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {agendaHoy.length}
          </span>
        </div>

        {agendaHoy.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin citas programadas para hoy</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agendaHoy.map(orden => (
              <div
                key={orden.id}
                onClick={() => navigate(`/admin/ordenes/${orden.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer border border-gray-100 transition-colors"
              >
                <div className="text-center bg-[#0f3460]/10 rounded-lg px-2.5 py-1.5 min-w-[56px]">
                  <span className="text-sm font-bold text-[#0f3460]">
                    {formatHora(orden.fechaCita)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{orden.clienteNombre}</p>
                  <p className="text-xs text-gray-500 truncate">{orden.equipoTipo} {orden.equipoMarca ? `· ${orden.equipoMarca}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge fase={orden.fase} />
                  {orden.tecnicoNombre && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <User size={10} />
                      <span className="truncate max-w-[70px]">{orden.tecnicoNombre.split(' ')[0]}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card component
// ---------------------------------------------------------------------------

function KpiCard({
  title, value, subtitle, icon, color, onClick,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  const isText = typeof value === 'string';
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left hover:shadow-md transition-shadow flex flex-col gap-3 w-full"
    >
      <div className={`${color} text-white rounded-xl p-2.5 w-fit`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{title}</p>
        <p className={`font-bold text-gray-900 ${isText ? 'text-lg' : 'text-3xl'} mt-0.5`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </button>
  );
}
