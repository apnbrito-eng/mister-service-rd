import { fechaFinanciera } from '../utils/fechaFinanciera';
import { OrdenCobrosCruda, diaCobroRD } from '../utils/movimientosCobros';
import { rangoMesRD, periodoValido, coberturaCreadores, ordenMetrica, identidadPersonal, fechaCierreMetrica, enPeriodo, comisionAjustada, resumenNegocio, calidadServicio } from '../utils/metricasNegocio';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal, ComisionRegistro } from '../types';
import {
  formatMoneda, getTecnicoColor,
} from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import AnalisisFunnel from '../components/AnalisisFunnel';
import MetricasPlantillas from '../components/inbox/MetricasPlantillas';
import { useApp } from '../context/AppContext';
import {
  TIERS_BONO_SECRETARIA, calcularBonoSecretaria,
} from '../services/nomina.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TrendingUp, DollarSign, Award, Users, CheckCircle, Target, ArrowLeft,
} from 'lucide-react';

const UMBRAL_BONO = 0.70;
const BONO_OPERARIA = 5000;

export default function MetricasMensuales() {
  const navigate = useNavigate();
  // SPRINT-149: userProfile preservado para futuras tarjetas personalizadas
  // por rol logueado. Hoy no se usa en el render, prefix _ silencia el warning.
  const { userProfile } = useApp();
  const autorizado = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const [error, setError] = useState('');
  const [crudas, setCrudas] = useState<OrdenCobrosCruda[]>([]);
  const [ponches, setPonches] = useState<{ personalId?: string; fechaRD?: string; tipo?: string }[]>([]);
  const [asistenciaLista, setAsistenciaLista] = useState(false);
  const [errorAsistencia, setErrorAsistencia] = useState('');
  const [gastos, setGastos] = useState<{ fecha?: unknown; monto?: unknown }[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [comisiones, setComisiones] = useState<ComisionRegistro[]>([]);

  const hoy = new Date();
  const [mesStr, setMesStr] = useState(diaCobroRD(hoy).slice(0, 7));

  const rango = useMemo(() => rangoMesRD(mesStr), [mesStr]);
  const rangoPrev = useMemo(() => {
    const [y, m] = mesStr.split('-').map(Number);
    const prevM = m - 1 === 0 ? 12 : m - 1;
    const prevY = m - 1 === 0 ? y - 1 : y;
    return rangoMesRD(`${prevY}-${String(prevM).padStart(2, '0')}`);
  }, [mesStr]);

  useEffect(() => {
    if (!autorizado) return;
    setLoading(true); setError('');
    const loaded = new Set<string>();
    const checkLoaded = (key: string) => { loaded.add(key); if (loaded.size === 4) setLoading(false); };
    const fail = () => { setError('No se pudieron cargar todas las fuentes. No se muestran totales parciales.'); setLoading(false); };
    const unsubOrd = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      setOrdenes(snap.docs.map(d => ordenMetrica(d.id, d.data()) as OrdenServicio));
      setCrudas(snap.docs.map(d => ({ id: d.id, datos: d.data() })));
      checkLoaded('ordenes');
    }, fail);
    const unsubPers = onSnapshot(collection(db, 'personal'), (snap) => {
      setPersonal(snap.docs.map(d => ({ ...d.data(), id: d.id } as Personal)));
      checkLoaded('personal');
    }, fail);
    // @safe-listener-sin-where: MetricasMensuales gateada por permiso
    // admin/coord. Rule `comisiones` short-circuit con `esAdminOCoord()`.
    const unsubCom = onSnapshot(collection(db, 'comisiones'), (snap) => {
      setComisiones(snap.docs.map(d => ({ ...d.data(), id: d.id, fechaCobro: fechaFinanciera(d.data().fechaCobro) || new Date(NaN) } as ComisionRegistro)));
      checkLoaded('comisiones');
    }, fail);
    const unsubGastos = onSnapshot(collection(db, 'gastos'), snap => { setGastos(snap.docs.map(d => d.data())); checkLoaded('gastos'); }, fail);
    return () => { unsubOrd(); unsubPers(); unsubCom(); unsubGastos(); };
  }, [autorizado]);

  useEffect(() => {
    if (!autorizado || !periodoValido(rango.inicio, rango.fin)) return;
    setAsistenciaLista(false); setErrorAsistencia('');
    const q = query(collection(db, 'ponches'), where('fechaRD', '>=', diaCobroRD(rango.inicio)), where('fechaRD', '<=', diaCobroRD(rango.fin)));
    return onSnapshot(q, snap => { setPonches(snap.docs.map(d => d.data())); setAsistenciaLista(true); }, () => { setErrorAsistencia('No se pudo cargar la asistencia.'); setAsistenciaLista(false); });
  }, [autorizado, rango.inicio, rango.fin]);

  const operarias = useMemo(
    () => personal.filter(p => (p.rol === 'operaria' || p.rol === 'coordinadora') && p.activo),
    [personal],
  );
  const secretarias = useMemo(
    () => personal.filter(p => p.rol === 'secretaria' && p.activo),
    [personal],
  );
  const tecnicos = useMemo(
    () => personal.filter(p => p.rol === 'tecnico'),
    [personal],
  );

  // Desempeño operaria en el mes
  const operariasData = useMemo(() => {
    return operarias.map(op => {
      // SPRINT-149 (P-006 variante operariaId): `o.operariaId` post-SPRINT-105 persiste
      // auth.uid; fallback a `op.id` para operarias legacy pre-onboarding sin uid.
      const ordsMes = ordenes.filter(o =>
        identidadPersonal(o.operariaId, personal)?.id === op.id &&
        !o.eliminada &&
        ((o.fase === 'cerrado') || o.soloChequeo) &&
        enPeriodo(fechaCierreMetrica(o), rango.inicio, rango.fin),
      );
      const chequeos = ordsMes.filter(o => o.soloChequeo).length;
      const completadas = ordsMes.filter(o => o.fase === 'cerrado' && !o.soloChequeo).length;
      const atendidas = chequeos + completadas;
      const pct = atendidas > 0 ? completadas / atendidas : 0;
      const bonoAsegurado = pct >= UMBRAL_BONO;
      // ¿Cuántas órdenes completadas adicionales necesita para cruzar el umbral?
      // completadas / atendidas >= 0.70 → completadas >= 0.70 * atendidas.
      // Si sumamos x órdenes completadas (que también suman a atendidas): (c+x)/(a+x) >= 0.70
      // x >= (0.70*a - c) / 0.30
      const faltanAprox = bonoAsegurado
        ? 0
        : Math.max(0, Math.ceil((UMBRAL_BONO * atendidas - completadas) / (1 - UMBRAL_BONO)));
      return { op, completadas, atendidas, chequeos, pct, bonoAsegurado, faltanAprox };
    });
  }, [operarias, ordenes, rango, personal]);

  const secretariasData = useMemo(() => {
    return secretarias.map(s => {
      const agendadas = ordenes.filter(o =>
        !o.eliminada &&
        identidadPersonal(o.creadoPorId || o.creadoPor, personal)?.id === s.id &&
        o.createdAt >= rango.inicio && o.createdAt <= rango.fin,
      );
      const completadas = agendadas.filter(o => o.fase !== 'cancelado').length;
      const bono = calcularBonoSecretaria(completadas);
      // Siguiente tier
      const tiersSorted = [...TIERS_BONO_SECRETARIA].sort((a, b) => a.min - b.min);
      const siguienteTier = tiersSorted.find(t => t.min > completadas);
      const faltan = siguienteTier ? siguienteTier.min - completadas : 0;
      const efectividad = agendadas.length > 0 ? completadas / agendadas.length : 0;
      return {
        s, agendadas: agendadas.length, completadas, bono, siguienteTier, faltan, efectividad,
      };
    });
  }, [secretarias, ordenes, rango, personal]);

  const tecnicosData = useMemo(() => {
    return tecnicos.map(t => {
      // SPRINT-149 (P-006 variante reversa): `c.tecnicoId` post-c4be345 persiste auth.uid;
      // fallback `t.id` para comisiones registradas pre-migración.
      const comsMes = comisiones.filter(c =>
        identidadPersonal(c.tecnicoId, personal)?.id === t.id &&
        c.fechaCobro >= rango.inicio && c.fechaCobro <= rango.fin,
      );
      const totalComision = comsMes.reduce((s, c) => s + comisionAjustada(c), 0);
      const ordenesCount = comsMes.length;
      return { t, totalComision, ordenesCount };
    });
  }, [tecnicos, comisiones, rango, personal]);

  const totales = useMemo(() => {
    const activos = personal.filter(p => p.activo);
    const sueldosMensuales = activos.reduce((s, p) => s + (p.sueldoBase || 0), 0);
    const comisionesTotal = comisiones.filter(c => enPeriodo(c.fechaCobro, rango.inicio, rango.fin)).reduce((s, c) => s + comisionAjustada(c), 0);
    const bonosOperarias = operariasData
      .filter(d => d.bonoAsegurado)
      .reduce((s) => s + BONO_OPERARIA, 0);
    const bonosSecretarias = secretariasData.reduce((s, d) => s + d.bono, 0);
    const bonos = bonosOperarias + bonosSecretarias;
    const total = sueldosMensuales + comisionesTotal + bonos;
    return { sueldosMensuales, comisionesTotal, bonos, bonosOperarias, bonosSecretarias, total };
  }, [personal, comisiones, rango, operariasData, secretariasData]);

  const totalMesAnterior = useMemo(() => {
    const activos = personal.filter(p => p.activo);
    const sueldos = activos.reduce((s, p) => s + (p.sueldoBase || 0), 0);
    const comsPrev = comisiones
      .filter(c => c.fechaCobro >= rangoPrev.inicio && c.fechaCobro <= rangoPrev.fin)
      .reduce((s, c) => s + comisionAjustada(c), 0);
    // Bonos del mes previo (proyectados con mismas reglas)
    let bonosPrev = 0;
    for (const op of operarias) {
      // SPRINT-149 (P-006 variante operariaId): fallback `op.uid || op.id` (mismo motivo).
      const ordsPrev = ordenes.filter(o =>
        identidadPersonal(o.operariaId, personal)?.id === op.id &&
        !o.eliminada &&
        ((o.fase === 'cerrado') || o.soloChequeo) &&
        enPeriodo(fechaCierreMetrica(o), rangoPrev.inicio, rangoPrev.fin),
      );
      const compl = ordsPrev.filter(o => o.fase === 'cerrado' && !o.soloChequeo).length;
      const atend = ordsPrev.length;
      if (atend > 0 && (compl / atend) >= UMBRAL_BONO) bonosPrev += BONO_OPERARIA;
    }
    for (const s of secretarias) {
      const agend = ordenes.filter(o =>
        !o.eliminada &&
        identidadPersonal(o.creadoPorId || o.creadoPor, personal)?.id === s.id &&
        o.createdAt >= rangoPrev.inicio && o.createdAt <= rangoPrev.fin,
      );
      const compl = agend.filter(o => o.fase !== 'cancelado').length;
      bonosPrev += calcularBonoSecretaria(compl);
    }
    return sueldos + comsPrev + bonosPrev;
  }, [personal, comisiones, operarias, secretarias, ordenes, rangoPrev]);

  const creadoresSinId = coberturaCreadores(ordenes, personal, rango.inicio, rango.fin);
  const creadoresPrevSinId = coberturaCreadores(ordenes, personal, rangoPrev.inicio, rangoPrev.fin);
  const delta = totales.total - totalMesAnterior;
  const deltaPct = totalMesAnterior > 0 ? (delta / totalMesAnterior) * 100 : 0;

  const negocio = resumenNegocio(crudas, gastos, rango.inicio, rango.fin);
  const negocioPrev = resumenNegocio(crudas, gastos, rangoPrev.inicio, rangoPrev.fin);
  const calidad = calidadServicio(crudas, rango.inicio, rango.fin);
  const sinFecha = comisiones.filter(c => !fechaFinanciera(c.fechaCobro)).length;
  const sinIdentidad = ordenes.filter(o => !o.eliminada && !identidadPersonal(o.operariaId || o.responsableId || o.creadoPorId || o.creadoPor, personal)).length;
  if (!autorizado) return <p className="p-6">Acceso restringido a administración y coordinación.</p>;
  if (error) return <p role="alert" className="p-6 text-red-700">{error}</p>;
  if (loading) return <LoadingSpinner fullPage text="Cargando métricas..." />;

  if (!periodoValido(rango.inicio, rango.fin)) return <div className="p-6"><p role="alert">Selecciona un mes válido.</p><input aria-label="Mes de métricas" type="month" value={mesStr} onChange={e => setMesStr(e.target.value)} /></div>;
  const mesLabel = format(rango.inicio, "MMMM yyyy", { locale: es });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary-medium mb-1"
          >
            <ArrowLeft size={12} /> Dashboard
          </button>
          <h1 className="text-2xl font-bold text-primary capitalize">
            Métricas del Mes — {mesLabel}
          </h1>
          <p className="text-gray-500 text-sm">
            Cobros por fecha del pago. Proyección de nómina con salarios y reglas actuales; no representa nómina histórica pagada.
          </p>
        </div>
        <input
          type="month"
          value={mesStr}
          onChange={e => { if (e.target.value) setMesStr(e.target.value); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
        />
      </div>

      <section className="bg-white p-4 rounded-xl border space-y-3">
        <h2 className="font-semibold">Resumen del negocio</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>Cobros confirmados<strong className="block">{formatMoneda(negocio.totalConfirmado)}</strong><small>Mes anterior: {formatMoneda(negocioPrev.totalConfirmado)}</small></div>
          <div>Gastos registrados<strong className="block">{formatMoneda(negocio.gastos)}</strong><small>Mes anterior: {formatMoneda(negocioPrev.gastos)}</small></div>
          <div>Cobros menos gastos<strong className="block">{formatMoneda(negocio.totalConfirmado - negocio.gastos)}</strong><small>No equivale a utilidad contable.</small></div>
          <div>Asistencia registrada<strong className="block">{errorAsistencia || (!asistenciaLista ? 'Cargando…' : `${new Set(ponches.filter(p => p.tipo === 'entrada' && identidadPersonal(p.personalId, personal)).map(p => `${identidadPersonal(p.personalId, personal)!.id}:${p.fechaRD}`)).size} jornadas con entrada`)}</strong><small>No deduce ausencias ni descuentos.</small><button onClick={() => navigate('/admin/ponches')} className="block text-primary">Ver ponches</button></div>
          <div>Evaluaciones del servicio<strong className="block">{calidad.evaluaciones.length}</strong></div>
        </div>
        <p className="text-sm">Pendientes de revisión: {sinFecha} comisiones sin fecha, {comisiones.filter(c => !identidadPersonal(c.tecnicoId, personal)).length} comisiones sin técnico identificable, {negocio.incidencias.length} cobros, {negocio.incidenciasGastos} gastos y {sinIdentidad} órdenes sin responsable identificable en el historial.</p>
        <div className="flex flex-wrap gap-4 text-primary"><button onClick={() => navigate('/admin/gastos')}>Ver gastos y cobros</button><button onClick={() => navigate('/admin/feedback')}>Ver calidad</button><button onClick={() => navigate('/admin/comisiones')}>Revisar comisiones</button></div>
      </section>
      {creadoresSinId > 0 && <p role="status" className="p-3 bg-amber-50 text-amber-900">Bonos de secretaría y total de nómina incompletos: {creadoresSinId} órdenes sin creador identificable. Los registros con solo nombre requieren conciliación; no se asignan por coincidencia de nombre.</p>}
      {/* Proyección total */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={18} className="text-emerald-600" />
          <h2 className="text-base font-semibold text-gray-900">Proyección total de nómina del mes</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniKpi label="Sueldos mensuales" value={formatMoneda(totales.sueldosMensuales)} />
          <MiniKpi label="Comisiones técnicos" value={formatMoneda(totales.comisionesTotal)} />
          <MiniKpi label="Bonos proyectados" value={creadoresSinId ? 'Cálculo incompleto' : formatMoneda(totales.bonos)} subtitle={`Op: ${formatMoneda(totales.bonosOperarias)} · Sec: ${creadoresSinId ? 'Sin atribución completa' : formatMoneda(totales.bonosSecretarias)}`} />
          <div className="bg-primary rounded-xl p-3 text-white">
            <p className="text-[10px] uppercase tracking-wide opacity-80">Gran total</p>
            <p className="text-xl font-bold">{creadoresSinId ? 'Cálculo incompleto' : formatMoneda(totales.total)}</p>
            {totalMesAnterior > 0 && !creadoresSinId && !creadoresPrevSinId && (
              <p className={`text-[10px] mt-0.5 ${delta >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {delta >= 0 ? '↑' : '↓'} {formatMoneda(Math.abs(delta))} ({deltaPct.toFixed(1)}%) vs mes anterior
              </p>
            )}
          </div>
        </div>
      </div>

      {/* SPRINT-FUNNEL-CONVERSION-FASES — Embudo de conversión por fase */}
      <AnalisisFunnel ordenes={ordenes} rangoFecha={rango} />

      {/* SPRINT-WA-TEMPLATE-METRICS — Rendimiento de plantillas WhatsApp */}
      <MetricasPlantillas />

      {/* Operarias */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Award size={16} className="text-purple-600" />
          <h2 className="text-base font-semibold text-gray-900">Operarias</h2>
        </div>
        {operariasData.length === 0 ? (
          <p className="text-sm text-gray-400">Sin operarias activas.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {operariasData.map(({ op, completadas, atendidas, pct, bonoAsegurado, faltanAprox }) => (
              <div key={op.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {op.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate flex-1">{op.nombre}</p>
                </div>
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">{completadas}</span> completadas de{' '}
                  <span className="font-semibold">{atendidas}</span> atendidas
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">Desempeño</span>
                    <span className={`font-semibold ${bonoAsegurado ? 'text-green-700' : 'text-gray-700'}`}>
                      {(pct * 100).toFixed(0)}% / 70%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${bonoAsegurado ? 'bg-green-500' : pct > 0.5 ? 'bg-amber-500' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, (pct / UMBRAL_BONO) * 100)}%` }}
                    />
                  </div>
                </div>
                {bonoAsegurado ? (
                  <p className="text-xs text-green-700 font-semibold mt-2 inline-flex items-center gap-1">
                    <CheckCircle size={12} /> Bono asegurado: {formatMoneda(BONO_OPERARIA)}
                  </p>
                ) : atendidas === 0 ? (
                  <p className="text-xs text-gray-500 mt-2">Sin órdenes este mes</p>
                ) : (
                  <p className="text-xs text-gray-700 mt-2">
                    Faltan <span className="font-semibold">{faltanAprox}</span> completadas para el bono
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Secretarias */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-sky-600" />
          <h2 className="text-base font-semibold text-gray-900">Secretarias</h2>
        </div>
        {secretariasData.length === 0 ? (
          <p className="text-sm text-gray-400">Sin secretarias activas.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {secretariasData.map(({ s, agendadas, completadas, bono, siguienteTier, faltan, efectividad }) => (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {s.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate flex-1">{s.nombre}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                  <div>
                    <p className="text-[10px] text-gray-400">Agendadas</p>
                    <p className="font-semibold text-gray-900">{creadoresSinId ? `${agendadas} verificadas; total incompleto` : agendadas}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Completadas</p>
                    <p className="font-semibold text-gray-900">{creadoresSinId ? `${completadas} verificadas; total incompleto` : completadas}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">Efectividad</span>
                    <span className="font-semibold">{creadoresSinId ? 'Incompleta' : `${(efectividad * 100).toFixed(0)}%`}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all"
                      style={{ width: `${Math.min(100, efectividad * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-700">
                    Bono actual: <span className="font-semibold text-emerald-700">{creadoresSinId ? 'Cálculo incompleto' : formatMoneda(bono)}</span>
                  </p>
                  {siguienteTier && !creadoresSinId && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Faltan <span className="font-semibold">{faltan}</span> para {formatMoneda(siguienteTier.bono)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Técnicos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-600" />
          <h2 className="text-base font-semibold text-gray-900">Técnicos</h2>
        </div>
        {tecnicosData.length === 0 ? (
          <p className="text-sm text-gray-400">Sin técnicos activos.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tecnicosData.map(({ t, totalComision, ordenesCount }) => {
              const hoyRD = diaCobroRD(new Date());
              const diaHoy = Number(hoyRD.slice(8, 10));
              const diasMes = Number(diaCobroRD(rango.fin).slice(8, 10));
              const dentroMesActivo = mesStr === hoyRD.slice(0, 7);
              const proyeccion = dentroMesActivo && diaHoy > 0
                ? (totalComision / diaHoy) * diasMes
                : totalComision;
              return (
                <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: t.color || getTecnicoColor(t.nombre) }}
                    >
                      {t.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate flex-1">{t.nombre}</p>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-gray-600">
                      Comisión acumulada:{' '}
                      <span className="font-semibold text-emerald-700">{formatMoneda(totalComision)}</span>
                    </p>
                    <p className="text-gray-600">
                      Órdenes cerradas: <span className="font-semibold">{ordenesCount}</span>
                    </p>
                    {dentroMesActivo && (
                      <p className="text-[11px] text-gray-500">
                        Proyección al cierre: {formatMoneda(Math.round(proyeccion))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tiers secretaria informativo */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className="text-gray-600" />
          <h3 className="text-xs font-semibold text-gray-700 uppercase">Tiers de bono secretaria</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {TIERS_BONO_SECRETARIA.filter(t => t.bono > 0).map(t => (
            <div key={t.min} className="bg-gray-50 rounded-lg p-2 border border-gray-100">
              <p className="text-gray-500 text-[10px]">{t.min}+ completadas</p>
              <p className="font-semibold text-emerald-700">{formatMoneda(t.bono)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniKpi({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-bold text-primary">{value}</p>
      {subtitle && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{subtitle}</p>}
    </div>
  );
}
