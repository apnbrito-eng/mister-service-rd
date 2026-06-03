import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate, Link } from 'react-router-dom';
import {
  TrendingUp, Wrench, XCircle, Wallet, Users, ArrowLeft,
} from 'lucide-react';
import {
  OrdenServicio, Factura, Personal,
} from '../types';
import {
  formatMoneda, parseOrden, getTecnicoColor,
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
// semana", "Nómina proyectada del mes". El Dashboard ahora queda con solo
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

  // ---- state ----
  const [loading, setLoading] = useState(true);
  const [ordenesRaw, setOrdenesRaw] = useState<OrdenServicio[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [comisionesPendientes, setComisionesPendientes] = useState<
    { tecnicoId: string; comisionMonto: number; quincenaAsignada?: string }[]
  >([]);

  // ---- real-time listeners ----
  // SPRINT-DISENO-I: misma estrategia que Dashboard — 3 colecciones que
  // checkLoaded suma a `loading=false`. Inventario no aplica acá (los 4
  // widgets no lo consumen). Comisiones no bloquea loading (no es crítico).
  useEffect(() => {
    let loadedCount = 0;
    const total = 3;
    const checkLoaded = () => { loadedCount++; if (loadedCount >= total) setLoading(false); };

    const unsubOrdenes = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const data = snap.docs.map(d => parseOrden(d.id, d.data()) as OrdenServicio);
      setOrdenesRaw(data);
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

    const unsubPersonal = onSnapshot(collection(db, 'personal'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal));
      setPersonal(data);
      checkLoaded();
    });

    // @safe-listener-sin-where: página gateada por sidebar `esAdminOCoord`.
    // Rule `comisiones` short-circuit `esAdminOCoord()`. Patrón espejo del
    // Dashboard (P-012 no infiere gating UI estáticamente).
    const unsubComisiones = onSnapshot(collection(db, 'comisiones'), (snap) => {
      setComisionesPendientes(snap.docs.map(d => {
        const raw = d.data();
        return {
          tecnicoId: raw.tecnicoId || '',
          comisionMonto: raw.comisionMonto || 0,
          quincenaAsignada: raw.quincenaAsignada,
          estadoLiquidacion: raw.estadoLiquidacion,
        };
      }).filter(c => (c as { estadoLiquidacion?: string }).estadoLiquidacion === 'pendiente'));
    });

    return () => { unsubOrdenes(); unsubFacturas(); unsubPersonal(); unsubComisiones(); };
  }, []);

  // ---- ordenes derived (excluir eliminadas, igual que Dashboard) ----
  const ordenes = useMemo(() => ordenesRaw.filter(o => !o.eliminada), [ordenesRaw]);

  // ---- permisos por widget (espejo de Dashboard.tsx pre-sprint) ----
  const puedeVerAnuladas = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const puedeVerNomina = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';

  // ---- tecnicos activos (sin filtro de operaria — esta página es admin/coord) ----
  const tecnicos = useMemo(
    () => personal.filter(p => p.rol === 'tecnico' && p.activo),
    [personal],
  );

  // ---- 1. Rendimiento por técnico ----
  // Replica idéntica de Dashboard.tsx pre-sprint líneas 569-584.
  const rendimientoTecnicos = useMemo(() => {
    return tecnicos.map(t => {
      // @safe-tecnicoid-id: OR explícito ya soporta pre/post c4be345 (tIdAuth || t.id).
      const tIdAuth = t.uid || t.id;
      const ordenesT = ordenes.filter(o => o.tecnicoId === tIdAuth || o.tecnicoId === t.id || o.tecnicoNombre === t.nombre);
      const total = ordenesT.length;
      const completadas = ordenesT.filter(o => ['trabajo_realizado', 'cerrado'].includes(o.fase)).length;
      const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
      const montoFacturado = facturas
        .filter(f => f.estado === 'pagada' && ordenesT.some(o => o.id === f.ordenId))
        .reduce((s, f) => s + (f.total || 0), 0);
      return { tecnico: t, total, completadas, pct, montoFacturado };
    }).sort((a, b) => b.pct - a.pct);
  }, [tecnicos, ordenes, facturas]);

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

  // ---- 3. Órdenes anuladas esta semana ----
  // Replica idéntica de Dashboard.tsx pre-sprint líneas 426-431.
  const anuladasSemana = useMemo(() => {
    const haceSieteDias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const eliminadas = ordenesRaw.filter(o => o.eliminada && o.fechaEliminacion && o.fechaEliminacion >= haceSieteDias).length;
    const canceladas = ordenesRaw.filter(o => !o.eliminada && o.fase === 'cancelado' && o.fechaCancelacion && o.fechaCancelacion >= haceSieteDias).length;
    return { eliminadas, canceladas, total: eliminadas + canceladas };
  }, [ordenesRaw]);

  // ---- 4. Nómina proyectada del mes ----
  // Replica idéntica de Dashboard.tsx pre-sprint líneas 468-500.
  const proyeccionNomina = useMemo(() => {
    const ahora = new Date();
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
    const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);
    const activos = personal.filter(p => p.activo && p.rol !== 'ayudante');
    const sueldos = activos.reduce((s, p) => s + (p.sueldoBase || 0), 0);
    const comisiones = comisionesPendientes.reduce((s, c) => s + c.comisionMonto, 0);

    // Bonos proyectados: operarias con desempeño >= 70% + secretarias por tiers
    let bonos = 0;
    for (const op of activos.filter(p => p.rol === 'operaria' || p.rol === 'coordinadora')) {
      const ordsMes = ordenesRaw.filter(o =>
        o.operariaId === (op.uid || op.id) && !o.eliminada &&
        ((o.fase === 'cerrado') || o.soloChequeo) &&
        o.updatedAt >= inicio && o.updatedAt <= fin,
      );
      const completadas = ordsMes.filter(o => o.fase === 'cerrado' && !o.soloChequeo).length;
      const atendidas = ordsMes.length;
      if (atendidas > 0 && (completadas / atendidas) >= 0.70) bonos += 5000;
    }
    const TIERS = [{ min: 400, b: 5000 }, { min: 300, b: 3500 }, { min: 200, b: 2000 }];
    for (const s of activos.filter(p => p.rol === 'secretaria')) {
      const agendadas = ordenesRaw.filter(o =>
        !o.eliminada && o.creadoPor === s.nombre &&
        o.createdAt >= inicio && o.createdAt <= fin,
      );
      const completadas = agendadas.filter(o => o.fase !== 'cancelado').length;
      const tier = TIERS.find(t => completadas >= t.min);
      if (tier) bonos += tier.b;
    }
    return { sueldos, comisiones, bonos, total: sueldos + comisiones + bonos };
  }, [personal, comisionesPendientes, ordenesRaw]);

  // Útil para futuro filtro/uso — referenciamos quincena actual en notas.
  // Se descarta vía `void` para no bloquear lint si no se renderiza.
  void calcularQuincenaActual;

  // ---- loading ----
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
                    Emitido: <span className="font-semibold text-gray-700">{formatMoneda(montoFacturado)}</span>
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
        {/* 3. Órdenes anuladas esta semana */}
        {puedeVerAnuladas && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <XCircle size={20} className="text-red-500" />
                <h2 className="text-lg font-semibold text-gray-900">Órdenes anuladas esta semana</h2>
              </div>
              <Link to="/admin/historial-anuladas" className="text-xs text-primary-medium hover:underline font-medium">
                Ver historial completo →
              </Link>
            </div>
            {anuladasSemana.total === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <XCircle size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin anulaciones esta semana</p>
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

        {/* 4. Nómina proyectada del mes (link a métricas mensuales) */}
        {puedeVerNomina && (
          <button
            type="button"
            onClick={() => navigate('/admin/metricas-mensuales')}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-primary-medium/30 transition-all group"
          >
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Wallet size={20} className="text-primary" />
                <h2 className="text-lg font-semibold text-gray-900 group-hover:text-primary-medium transition-colors">
                  Nómina proyectada del mes
                </h2>
              </div>
              <span className="text-xs text-primary-medium group-hover:underline font-medium">
                Ver detalle →
              </span>
            </div>
            <p className="text-2xl font-bold text-primary">
              {formatMoneda(proyeccionNomina.total)}
            </p>
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
                <p className="font-semibold">{formatMoneda(proyeccionNomina.bonos)}</p>
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
