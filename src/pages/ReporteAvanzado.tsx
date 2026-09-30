import { fechaFinanciera } from '../utils/fechaFinanciera';
import { diaCobroRD, OrdenCobrosCruda, proyectarCobrosCaja } from '../utils/movimientosCobros';
import { ordenMetrica, coberturaCreadores, identidadPersonal, fechaCierreMetrica, enPeriodo, rangoMesRD, comisionAjustada, calidadServicio } from '../utils/metricasNegocio';
import { calcularBonoSecretaria } from '../services/nomina.service';
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate, Link } from 'react-router-dom';
import {
  TrendingUp, Wrench, XCircle, Wallet, Users, ArrowLeft,
} from 'lucide-react';
import {
  OrdenServicio, Personal,
} from '../types';
import {
  formatMoneda, getTecnicoColor,
} from '../utils';
import { calcularQuincenaActual } from '../utils/comisiones';
import { SkeletonSectionBlock } from '../components/Skeleton';
import { useApp } from '../context/AppContext';

// ---------------------------------------------------------------------------
// ReporteAvanzado
// ---------------------------------------------------------------------------
// SPRINT-DISENO-I-DATA-SLOP (2026-06-03, pasada 58 autónomo post OK Jorge):
// Página dedicada para los 4 widgets analíticos que vivían en Dashboard.tsx
// (líneas 1078-1294 pre-sprint). Movidos sin borrar: "Rendimiento por
// Técnico", "Reparaciones por Tipo de Equipo", "Órdenes anuladas esta
// semana", "Proyección con salarios actuales". El Dashboard ahora queda con solo
// los KPIs operativos del día + link discreto a esta página.
//
// Decisión Jorge literal: "Dejá todos los números operativos del día como
// están, y mové a un reporte aparte (sin borrar nada, que queden a un clic)
// estos 4". Cada widget conserva sus permisos originales:
// - puedeVerAnuladas / puedeVerNomina: admin + coordinadora.
// - Rendimiento + Reparaciones: visible a todos los roles que ven Dashboard
//   (no tenían gate específico previo).
//
// El sidebar gatea la entrada con `esAdminOCoord` para uniformidad con
// "Métricas del Mes" (ítem hermano en sección Finanzas). Si más adelante
// hace falta abrir el reporte a operarias/secretarias, ajustar el `show:`
// del sidebar + (opcional) granularidad por widget aquí.
// ---------------------------------------------------------------------------

export default function ReporteAvanzado() {
  const navigate = useNavigate();
  const { userProfile } = useApp();

  const autorizado = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const [error, setError] = useState('');
  const [mes, setMes] = useState(diaCobroRD(new Date()).slice(0, 7));
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const rango = useMemo(() => desde && hasta ? { inicio: fechaFinanciera(desde) || new Date(NaN), fin: new Date((fechaFinanciera(hasta)?.getTime() ?? NaN) + 86400000 - 1) } : rangoMesRD(mes), [desde, hasta, mes]);
  const rangoValido = Number.isFinite(rango.inicio.getTime()) && Number.isFinite(rango.fin.getTime()) && rango.inicio <= rango.fin;
  const [crudas, setCrudas] = useState<OrdenCobrosCruda[]>([]);
  // ---- state ----
  const [loading, setLoading] = useState(true);
  const [ordenesRaw, setOrdenesRaw] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [comisionesDevengadas, setComisionesDevengadas] = useState<
    { tecnicoId: string; comisionMonto: number; fechaCobro: unknown; descuentoPorGarantia?: { monto: number }; estaAnulada?: boolean; estadoLiquidacion?: string; quincenaAsignada?: string }[]
  >([]);

  // ---- real-time listeners ----
  // SPRINT-DISENO-I: misma estrategia que Dashboard — 3 colecciones que
  // checkLoaded suma a `loading=false`. Inventario no aplica acá (los 4
  // widgets no lo consumen). Comisiones no bloquea loading (no es crítico).
  useEffect(() => {
    if (!autorizado) return;
    setLoading(true); setError('');
    const loaded = new Set<string>();
    const checkLoaded = (key: string) => { loaded.add(key); if (loaded.size === 3) setLoading(false); };
    const fail = () => { setError('No se pudieron cargar todas las fuentes.'); setLoading(false); };
    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const data = snap.docs.map(d => ordenMetrica(d.id, d.data()) as OrdenServicio);
      setOrdenesRaw(data);
      setCrudas(snap.docs.map(d => ({ id: d.id, datos: d.data() })));
      checkLoaded('ordenes');
    }, fail);

    const unsubPersonal = onSnapshot(collection(db, 'personal'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id } as Personal));
      setPersonal(data);
      checkLoaded('personal');
    }, fail);

    // @safe-listener-sin-where: página gateada por sidebar `esAdminOCoord`.
    // Rule `comisiones` short-circuit `esAdminOCoord()`. Patrón espejo del
    // Dashboard (P-012 no infiere gating UI estáticamente).
    const unsubComisiones = onSnapshot(collection(db, 'comisiones'), (snap) => {
      setComisionesDevengadas(snap.docs.map(d => {
        const raw = d.data();
        return {
          tecnicoId: raw.tecnicoId || '',
          comisionMonto: raw.comisionMonto || 0, fechaCobro: raw.fechaCobro, descuentoPorGarantia: raw.descuentoPorGarantia, estaAnulada: raw.estaAnulada,
          quincenaAsignada: raw.quincenaAsignada,
          estadoLiquidacion: raw.estadoLiquidacion,
        };
      }));
      checkLoaded('comisiones');
    }, fail);

    return () => { unsubOrdenes(); unsubPersonal(); unsubComisiones(); };
  }, [autorizado]);

  // ---- ordenes derived (excluir eliminadas, igual que Dashboard) ----
  const ordenes = useMemo(() => ordenesRaw.filter(o => !o.eliminada && enPeriodo(o.createdAt, rango.inicio, rango.fin)), [ordenesRaw, rango.inicio, rango.fin]);

  // ---- permisos por widget (espejo de Dashboard.tsx pre-sprint) ----
  const puedeVerAnuladas = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const puedeVerNomina = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';

  // ---- tecnicos activos (sin filtro de operaria — esta página es admin/coord) ----
  const tecnicos = useMemo(
    () => personal.filter(p => p.rol === 'tecnico'),
    [personal],
  );

  // ---- 1. Rendimiento por técnico ----
  // Replica idéntica de Dashboard.tsx pre-sprint líneas 569-584.
  const rendimientoTecnicos = useMemo(() => {
    return tecnicos.map(t => {
      // @safe-tecnicoid-id: OR explícito ya soporta pre/post c4be345 (tIdAuth || t.id).
      const ordenesT = ordenes.filter(o => identidadPersonal(o.tecnicoId, personal)?.id === t.id);
      const total = ordenesT.length;
      const completadas = ordenesT.filter(o => ['trabajo_realizado', 'cerrado'].includes(o.fase)).length;
      const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
      const caja = proyectarCobrosCaja(crudas, undefined, rangoValido ? diaCobroRD(rango.inicio) : '9999-01-01', rangoValido ? diaCobroRD(rango.fin) : '0001-01-01');
      const montoFacturado = caja.movimientos.filter(m => m.confirmado && identidadPersonal(ordenesRaw.find(o => o.id === m.ordenId)?.tecnicoId, personal)?.id === t.id).reduce((s, m) => s + m.monto, 0);
      return { tecnico: t, total, completadas, pct, montoFacturado };
    }).sort((a, b) => b.pct - a.pct);
  }, [tecnicos, ordenes, crudas, personal, ordenesRaw, rango.inicio, rango.fin, rangoValido]);

  // ---- 2. Reparaciones por tipo de equipo ----
  // Replica idéntica de Dashboard.tsx pre-sprint líneas 587-597.
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

  // ---- 3. Órdenes anuladas en el período ----
  // Replica idéntica de Dashboard.tsx pre-sprint líneas 426-431.
  const anuladasSemana = useMemo(() => {
    const eliminadas = ordenesRaw.filter(o => o.eliminada && o.fechaEliminacion && enPeriodo(o.fechaEliminacion, rango.inicio, rango.fin)).length;
    const canceladas = ordenesRaw.filter(o => !o.eliminada && o.fase === 'cancelado' && o.fechaCancelacion && enPeriodo(o.fechaCancelacion, rango.inicio, rango.fin)).length;
    return { eliminadas, canceladas, total: eliminadas + canceladas };
  }, [ordenesRaw, rango.inicio, rango.fin]);

  // ---- 4. Proyección con salarios actuales ----
  // Replica idéntica de Dashboard.tsx pre-sprint líneas 468-500.
  const proyeccionNomina = useMemo(() => {
    const inicio = rango.inicio;
    const fin = rango.fin;
    const activos = personal.filter(p => p.activo);
    const sueldos = activos.reduce((s, p) => s + (p.sueldoBase || 0), 0);
    const comisiones = comisionesDevengadas.filter(c => enPeriodo(c.fechaCobro, inicio, fin)).reduce((s, c) => s + comisionAjustada(c), 0);

    // Bonos proyectados: operarias con desempeño >= 70% + secretarias por tiers
    let bonos = 0;
    for (const op of activos.filter(p => p.rol === 'operaria' || p.rol === 'coordinadora')) {
      const ordsMes = ordenesRaw.filter(o =>
        identidadPersonal(o.operariaId, personal)?.id === op.id && !o.eliminada &&
        ((o.fase === 'cerrado') || o.soloChequeo) &&
        enPeriodo(fechaCierreMetrica(o), inicio, fin),
      );
      const completadas = ordsMes.filter(o => o.fase === 'cerrado' && !o.soloChequeo).length;
      const atendidas = ordsMes.length;
      if (atendidas > 0 && (completadas / atendidas) >= 0.70) bonos += 5000;
    }
    for (const s of activos.filter(p => p.rol === 'secretaria')) {
      const agendadas = ordenesRaw.filter(o =>
        !o.eliminada && identidadPersonal(o.creadoPor, personal)?.id === s.id &&
        o.createdAt >= inicio && o.createdAt <= fin,
      );
      const completadas = agendadas.filter(o => o.fase !== 'cancelado').length;
      bonos += calcularBonoSecretaria(completadas);
    }
    return { sueldos, comisiones, bonos, total: sueldos + comisiones + bonos };
  }, [personal, comisionesDevengadas, ordenesRaw, rango.inicio, rango.fin]);

  // Útil para futuro filtro/uso — referenciamos quincena actual en notas.
  // Se descarta vía `void` para no bloquear lint si no se renderiza.
  void calcularQuincenaActual;

  // ---- loading ----
  const creadoresSinId = coberturaCreadores(ordenesRaw, personal, rango.inicio, rango.fin);
  const calidad = calidadServicio(crudas, rango.inicio, rango.fin);
  if (!autorizado) return <p className="p-6">Acceso restringido a administración y coordinación.</p>;
  if (error) return <p role="alert" className="p-6 text-red-700">{error}</p>;
  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reporte avanzado</h1>
          <p className="text-sm text-gray-500 mt-1">Cargando datos…</p>
        </div>
        <SkeletonSectionBlock />
        <SkeletonSectionBlock />
      </div>
    );
  }

  // ---- render ----
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header con back link */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigate('/admin/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm text-primary-medium hover:underline font-medium"
        >
          <ArrowLeft size={16} />
          Volver al dashboard
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Reporte avanzado</h1>
        <p className="text-sm text-gray-500">
          Análisis comparativos y proyecciones. Si querés ver los números operativos del día, andá al{' '}
          <Link to="/admin/dashboard" className="text-primary-medium hover:underline font-medium">
            dashboard
          </Link>
          .
        </p>
      </div>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3"><label>Mes <input type="month" value={mes} onChange={e => { if (e.target.value) setMes(e.target.value); setDesde(''); setHasta(''); }} /></label><label>Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label><label>Hasta <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label></div>
        {!!desde !== !!hasta && <p>Completa ambas fechas para aplicar el rango; se muestra el mes seleccionado.</p>}
        {!rangoValido && <p role="alert">Rango inválido.</p>}
        <p className="text-sm">Órdenes por creación; cobros confirmados por fecha del pago. La proyección mensual usa configuración salarial actual, no pagos históricos. Comisiones devengadas del período (pendientes y liquidadas; excluye anuladas), igual que Métricas Mensuales. Sin fecha de comisión: {comisionesDevengadas.filter(c => !fechaFinanciera(c.fechaCobro)).length}. Sin técnico identificable: {ordenes.filter(o => !identidadPersonal(o.tecnicoId, personal)).length}.</p>
        <h2 className="font-semibold">Evaluación del servicio: {calidad.evaluaciones.length} respuestas</h2>
        <div className="flex flex-wrap gap-4">{calidad.promedios.map(c => <span key={c.categoria}>{c.categoria}: {c.promedio === null ? 'Sin respuestas' : `${c.promedio.toFixed(1)} / 5`}</span>)}</div>
        <Link to="/admin/feedback" className="text-primary underline">Ver opiniones y responsables de las órdenes</Link>
      </section>
      {/* ======== 1. RENDIMIENTO POR TECNICO + 2. REPARACIONES POR TIPO ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Rendimiento por tecnico */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={20} className="text-primary-medium" />
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
                      <span className="text-sm font-bold text-primary">{pct}%</span>
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
                    Cobrado: <span className="font-semibold text-gray-700">{formatMoneda(montoFacturado)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Reparaciones por tipo de equipo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={20} className="text-primary-medium" />
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
                      <span className="text-sm font-bold text-primary ml-2">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
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

      {/* ======== 3. ANULADAS SEMANA + 4. NOMINA PROYECTADA ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3. Órdenes anuladas en el período */}
        {puedeVerAnuladas && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <XCircle size={20} className="text-red-500" />
                <h2 className="text-lg font-semibold text-gray-900">Órdenes anuladas en el período</h2>
              </div>
              <Link to="/admin/historial-anuladas" className="text-xs text-primary-medium hover:underline font-medium">
                Ver historial completo →
              </Link>
            </div>
            {anuladasSemana.total === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <XCircle size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin anulaciones en el período</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase font-medium text-red-700">Eliminadas</p>
                  <p className="text-2xl font-bold text-red-900">{anuladasSemana.eliminadas}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase font-medium text-amber-700">Canceladas</p>
                  <p className="text-2xl font-bold text-amber-900">{anuladasSemana.canceladas}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase font-medium text-gray-700">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{anuladasSemana.total}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. Proyección con salarios actuales (link a métricas mensuales) */}
        {puedeVerNomina && !desde && !hasta && (
          <button
            type="button"
            onClick={() => navigate('/admin/metricas-mensuales')}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-primary-medium/30 transition-all group"
          >
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Wallet size={20} className="text-primary" />
                <h2 className="text-lg font-semibold text-gray-900 group-hover:text-primary-medium transition-colors">
                  Proyección con salarios actuales
                </h2>
              </div>
              <span className="text-xs text-primary-medium group-hover:underline font-medium">
                Ver detalle →
              </span>
            </div>
            <p className="text-2xl font-bold text-primary">
              {creadoresSinId ? 'Cálculo incompleto' : formatMoneda(proyeccionNomina.total)}
            </p>
            {creadoresSinId > 0 && <p className="text-sm text-amber-800">{creadoresSinId} órdenes sin creador identificable: bonos de secretaría y total pendientes de conciliación.</p>}
            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] text-gray-600">
              <div>
                <p className="text-[9px] uppercase text-gray-400">Sueldos</p>
                <p className="font-semibold">{formatMoneda(proyeccionNomina.sueldos)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-400">Comisiones</p>
                <p className="font-semibold">{formatMoneda(proyeccionNomina.comisiones)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-400">Bonos</p>
                <p className="font-semibold">{creadoresSinId ? 'Cálculo incompleto' : formatMoneda(proyeccionNomina.bonos)}</p>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Nota inferior si NO ve ninguno de los 2 gateados */}
      {!puedeVerAnuladas && !puedeVerNomina && (
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 text-center">
          <Users size={28} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-500">
            Tu rol no tiene acceso a los reportes de anulaciones o nómina.
          </p>
        </div>
      )}
    </div>
  );
}
