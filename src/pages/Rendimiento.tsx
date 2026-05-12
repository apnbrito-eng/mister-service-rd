import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal, Factura } from '../types';
import { formatMoneda, parseOrden } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
// SPRINT-149: cleanup imports legacy unused (BarChart3, isWithinInterval, format, parseISO, es)
// detectados al stagear el archivo en el fix de operariaId. No afectan render.
import { TrendingUp, Users, CheckCircle, XCircle, Clock, Calendar, RefreshCw, UserPlus, Award } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calcularQuincenaActual, listarUltimasQuincenas, rangoQuincena } from '../utils/comisiones';
import { differenceInMinutes, startOfWeek, startOfMonth, startOfDay } from 'date-fns';

export default function Rendimiento() {
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [filtroCoord, setFiltroCoord] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<'hoy' | 'semana' | 'mes' | 'rango'>('mes');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => parseOrden(d.id, d.data())));
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'personal'), (snap) => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
    const unsub3 = onSnapshot(collection(db, 'facturas'), (snap) => {
      setFacturas(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        fechaEmision: d.data().fechaEmision?.toDate?.() || new Date(),
        fechaPago: d.data().fechaPago?.toDate?.() || null,
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
      } as Factura)));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (filtroFecha === 'hoy') return { start: startOfDay(now), end: now };
    if (filtroFecha === 'semana') return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
    if (filtroFecha === 'mes') return { start: startOfMonth(now), end: now };
    if (filtroFecha === 'rango' && fechaInicio && fechaFin) {
      return { start: new Date(fechaInicio), end: new Date(fechaFin + 'T23:59:59') };
    }
    return { start: startOfMonth(now), end: now };
  }, [filtroFecha, fechaInicio, fechaFin]);

  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      if (o.eliminada) return false;
      const inRange = o.createdAt >= dateRange.start && o.createdAt <= dateRange.end;
      const matchCoord = !filtroCoord || o.creadoPor === filtroCoord || o.responsableNombre === filtroCoord;
      return inRange && matchCoord;
    });
  }, [ordenes, dateRange, filtroCoord]);

  const coordinadores = useMemo(() => {
    const secretarias = personal.filter(p => (p.rol === 'secretaria' || p.rol === 'operaria') && p.activo);
    return secretarias;
  }, [personal]);

  const kpis = useMemo(() => {
    const total = ordenesFiltradas.length;
    const confirmadas = ordenesFiltradas.filter(o => ['agendado', 'en_diagnostico', 'en_cotizacion', 'aprobado', 'trabajo_realizado', 'cerrado'].includes(o.fase)).length;
    const canceladas = ordenesFiltradas.filter(o => o.fase === 'cancelado').length;
    const reagendadas = ordenesFiltradas.filter(o => o.reagendada).length;

    // New clients (unique clienteId in period)
    const clienteIds = new Set(ordenesFiltradas.map(o => o.clienteId).filter(Boolean));
    const clientesPrevios = new Set(ordenes.filter(o => o.createdAt < dateRange.start).map(o => o.clienteId).filter(Boolean));
    const nuevosClientes = [...clienteIds].filter(id => !clientesPrevios.has(id)).length;

    const tasaConfirmacion = total > 0 ? (confirmadas / total * 100) : 0;

    // Avg response time
    const tiempos: number[] = [];
    ordenesFiltradas.forEach(o => {
      const lead = o.historialFases.find(h => h.fase === 'nuevo_lead');
      const gestion = o.historialFases.find(h => h.fase === 'en_gestion');
      if (lead && gestion) tiempos.push(differenceInMinutes(gestion.timestamp, lead.timestamp));
    });
    const avgRespuesta = tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;

    const completadasSemana = ordenes.filter(o => o.fase === 'cerrado' && o.updatedAt >= startOfWeek(new Date(), { weekStartsOn: 1 })).length;
    const completadasMes = ordenes.filter(o => o.fase === 'cerrado' && o.updatedAt >= startOfMonth(new Date())).length;

    // By coordinator
    const byCoord: Record<string, { nombre: string; confirmadas: number; canceladas: number; reagendadas: number; nuevosClientes: number; total: number }> = {};
    coordinadores.forEach(c => {
      byCoord[c.nombre] = { nombre: c.nombre, confirmadas: 0, canceladas: 0, reagendadas: 0, nuevosClientes: 0, total: 0 };
    });
    ordenesFiltradas.forEach(o => {
      const coord = o.creadoPor || o.responsableNombre || 'Sin asignar';
      if (!byCoord[coord]) byCoord[coord] = { nombre: coord, confirmadas: 0, canceladas: 0, reagendadas: 0, nuevosClientes: 0, total: 0 };
      byCoord[coord].total++;
      if (['agendado', 'en_diagnostico', 'en_cotizacion', 'aprobado', 'trabajo_realizado', 'cerrado'].includes(o.fase)) byCoord[coord].confirmadas++;
      if (o.fase === 'cancelado') byCoord[coord].canceladas++;
      if (o.reagendada) byCoord[coord].reagendadas++;
    });

    // By technician
    const byTecnico: Record<string, { nombre: string; pendientes: number; enProceso: number; completados: number; total: number; montoFacturado: number }> = {};
    const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo);
    tecnicos.forEach(t => {
      byTecnico[t.nombre] = { nombre: t.nombre, pendientes: 0, enProceso: 0, completados: 0, total: 0, montoFacturado: 0 };
    });
    ordenesFiltradas.forEach(o => {
      if (!o.tecnicoNombre || !byTecnico[o.tecnicoNombre]) return;
      byTecnico[o.tecnicoNombre].total++;
      if (['nuevo_lead', 'en_gestion', 'aprobado', 'agendado'].includes(o.fase)) byTecnico[o.tecnicoNombre].pendientes++;
      if (['en_diagnostico', 'en_cotizacion'].includes(o.fase)) byTecnico[o.tecnicoNombre].enProceso++;
      if (['trabajo_realizado', 'cerrado'].includes(o.fase)) byTecnico[o.tecnicoNombre].completados++;
    });
    // Monto facturado per técnico (approximate from facturas)
    facturas.filter(f => f.estado === 'pagada').forEach(f => {
      // Match by clienteNombre roughly
      const orden = ordenes.find(o => o.numero === f.ordenNumero || o.clienteNombre === f.clienteNombre);
      if (orden?.tecnicoNombre && byTecnico[orden.tecnicoNombre]) {
        byTecnico[orden.tecnicoNombre].montoFacturado += f.total;
      }
    });

    return { total, confirmadas, canceladas, reagendadas, nuevosClientes, tasaConfirmacion, avgRespuesta, completadasSemana, completadasMes, byCoord, byTecnico };
  }, [ordenesFiltradas, ordenes, personal, facturas, coordinadores, dateRange]);

  if (loading) return <LoadingSpinner fullPage text="Cargando rendimiento..." />;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[#0f3460]">Rendimiento / KPIs</h1>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <span className="text-sm text-gray-500">Período:</span>
        </div>
        {(['hoy', 'semana', 'mes'] as const).map(f => (
          <button key={f} onClick={() => setFiltroFecha(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroFecha === f ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'hoy' ? 'Hoy' : f === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
        <button onClick={() => setFiltroFecha('rango')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroFecha === 'rango' ? 'bg-[#0f3460] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Rango
        </button>
        {filtroFecha === 'rango' && (
          <>
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
            <span className="text-gray-400">—</span>
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </>
        )}
        <div className="ml-auto">
          <select value={filtroCoord} onChange={e => setFiltroCoord(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">Todos los coordinadores</option>
            {coordinadores.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Confirmadas" value={kpis.confirmadas} icon={<CheckCircle size={18} />} color="bg-green-500" />
        <KpiCard title="Canceladas" value={kpis.canceladas} icon={<XCircle size={18} />} color="bg-red-500" />
        <KpiCard title="Reagendadas" value={kpis.reagendadas} icon={<RefreshCw size={18} />} color="bg-yellow-500" />
        <KpiCard title="Nuevos Clientes" value={kpis.nuevosClientes} icon={<UserPlus size={18} />} color="bg-purple-500" />
        <KpiCard title="Resp. Promedio" value={`${kpis.avgRespuesta} min`} icon={<Clock size={18} />} color="bg-blue-500" />
      </div>

      {/* Tasa de confirmación global */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Tasa de Confirmación Global</h2>
          <span className="text-2xl font-bold text-[#0f3460]">{kpis.tasaConfirmacion.toFixed(1)}%</span>
        </div>
        <div className="bg-gray-200 rounded-full h-4">
          <div className="bg-gradient-to-r from-[#0f3460] to-[#1a5fa8] h-4 rounded-full transition-all"
            style={{ width: `${Math.min(kpis.tasaConfirmacion, 100)}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Completadas semana: {kpis.completadasSemana}</span>
          <span>Completadas mes: {kpis.completadasMes}</span>
        </div>
      </div>

      {/* Rendimiento por Coordinador */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Rendimiento por Coordinador</h2>
        </div>
        <div className="space-y-4">
          {Object.values(kpis.byCoord).filter(c => c.total > 0).map((stats) => {
            const tasa = stats.total > 0 ? (stats.confirmadas / stats.total * 100) : 0;
            return (
              <div key={stats.nombre} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-900">{stats.nombre}</span>
                  <span className="text-sm text-gray-500">{stats.total} órdenes</span>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{stats.confirmadas}</p>
                    <p className="text-[10px] text-gray-500">Confirmadas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-600">{stats.canceladas}</p>
                    <p className="text-[10px] text-gray-500">Canceladas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-yellow-600">{stats.reagendadas}</p>
                    <p className="text-[10px] text-gray-500">Reagendadas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-purple-600">{stats.nuevosClientes}</p>
                    <p className="text-[10px] text-gray-500">Nuevos</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 min-w-[100px]">Tasa confirmación</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                    <div className="bg-[#1a5fa8] h-2.5 rounded-full" style={{ width: `${Math.min(tasa, 100)}%` }} />
                  </div>
                  <span className="text-sm font-bold text-[#0f3460] min-w-[50px] text-right">{tasa.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
          {Object.values(kpis.byCoord).filter(c => c.total > 0).length === 0 && (
            <p className="text-center text-gray-400 py-4 text-sm">Sin datos para el período seleccionado</p>
          )}
        </div>
      </div>

      {/* Rendimiento por Técnico */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Rendimiento por Técnico</h2>
        </div>
        <div className="space-y-4">
          {Object.values(kpis.byTecnico).map(t => {
            const pctCompletadas = t.total > 0 ? (t.completados / t.total * 100) : 0;
            return (
              <div key={t.nombre} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">{t.nombre}</span>
                  <span className="text-sm font-medium text-[#0f3460]">{formatMoneda(t.montoFacturado)}</span>
                </div>
                <div className="flex gap-3 mb-2 text-xs">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Pendientes: {t.pendientes}</span>
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">En proceso: {t.enProceso}</span>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Completados: {t.completados}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 min-w-[80px]">% Completadas</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                    <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${pctCompletadas}%` }} />
                  </div>
                  <span className="text-sm font-bold text-green-600 min-w-[50px] text-right">{pctCompletadas.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DesempenoOperariasSection ordenes={ordenes} personal={personal} />
    </div>
  );
}

const UMBRAL_BONO = 0.70;
const BONO_MONTO = 5000;

function DesempenoOperariasSection({ ordenes, personal }: { ordenes: OrdenServicio[]; personal: Personal[] }) {
  const { userProfile } = useApp();
  const esAdminOCoord = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const [quincena, setQuincena] = useState<string>(calcularQuincenaActual(new Date()));
  const quincenas = useMemo(() => listarUltimasQuincenas(12), []);
  const operarias = useMemo(() => personal.filter(p => p.activo && (p.rol === 'operaria' || p.rol === 'coordinadora')), [personal]);

  const datos = useMemo(() => {
    const { inicio, fin } = rangoQuincena(quincena);
    return operarias.map(op => {
      // SPRINT-149 (P-006 variante operariaId): `o.operariaId` post-SPRINT-105
      // persiste auth.uid; fallback a `op.id` para operarias pre-onboarding sin
      // doc espejo en usuarios/{uid}.
      const ordenesEnRango = ordenes.filter(o =>
        o.operariaId === (op.uid || op.id) &&
        !o.eliminada &&
        ((o.fase === 'cerrado') || o.soloChequeo) &&
        o.updatedAt >= inicio && o.updatedAt <= fin
      );
      const chequeos = ordenesEnRango.filter(o => o.soloChequeo).length;
      const completadas = ordenesEnRango.filter(o => o.fase === 'cerrado' && !o.soloChequeo).length;
      const atendidas = chequeos + completadas;
      const pct = atendidas > 0 ? completadas / atendidas : 0;
      const bono = pct >= UMBRAL_BONO ? BONO_MONTO : 0;
      return { operaria: op, atendidas, completadas, chequeos, pct, bono };
    }).sort((a, b) => b.pct - a.pct);
  }, [operarias, ordenes, quincena]);

  if (!esAdminOCoord) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Award size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Desempeño de Operarias</h2>
        </div>
        <select value={quincena} onChange={e => setQuincena(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
          {quincenas.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>
      <p className="text-xs text-gray-500">
        Bono fijo de RD$ {BONO_MONTO.toLocaleString('es-DO')} si desempeño ≥ {(UMBRAL_BONO * 100).toFixed(0)}%
        (órdenes completadas / órdenes atendidas; los chequeos cuentan como atendidas).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {datos.length === 0 ? (
          <p className="text-sm text-gray-400 col-span-full text-center py-6">Sin operarias activas</p>
        ) : datos.map(d => (
          <div key={d.operaria.id} className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: d.operaria.color || '#0f3460' }}>
                {d.operaria.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <p className="text-sm font-semibold text-gray-900">{d.operaria.nombre}</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Atendidas</span><span className="font-semibold">{d.atendidas}</span></div>
              <div className="flex justify-between"><span className="text-green-700">Completadas</span><span className="font-semibold text-green-700">{d.completadas}</span></div>
              <div className="flex justify-between"><span className="text-amber-700">Solo chequeo</span><span className="font-semibold text-amber-700">{d.chequeos}</span></div>
              <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                <span className="text-gray-700 font-medium">% desempeño</span>
                <span className={`font-bold ${d.pct >= UMBRAL_BONO ? 'text-emerald-700' : 'text-gray-700'}`}>
                  {(d.pct * 100).toFixed(0)}%
                </span>
              </div>
              <div className={`mt-2 px-2 py-1.5 rounded-lg text-center text-sm font-bold ${d.bono > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                Bono: RD$ {d.bono.toLocaleString('es-DO')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon, color }: { title: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className={`${color} text-white rounded-xl p-2 w-fit mb-2`}>{icon}</div>
      <p className="text-xs text-gray-500 font-medium">{title}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
