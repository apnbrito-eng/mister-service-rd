/**
 * Rediseño visual BambooHR — Lote 3 (Rendimiento / KPIs).
 *
 * Preserva TODOS los cálculos previos: tasa de confirmación, tiempos de
 * respuesta, agrupaciones por coordinador y por técnico, proyección de cobros
 * por período y bono operarias heredado (RD$5.000 fijo si desempeño ≥70%).
 * Las reglas financieras pendientes de Jorge (meta mensual ventas cobradas,
 * devoluciones, cambios durante el mes, cierre de nómina) NO se activan en
 * este lote: queda un callout documental señalando la revisión pendiente del
 * cálculo heredado que cuenta no-canceladas como completadas.
 *
 * Autor: Claude Code — 2026-10-07.
 */
import { fechaFinanciera } from '../utils/fechaFinanciera';
import {
  diaCobroRD,
  OrdenCobrosCruda,
  proyectarCobrosCaja,
} from '../utils/movimientosCobros';
import {
  ordenMetrica,
  cerradasDelPeriodo,
  identidadPersonal,
  fechaCierreMetrica,
  enPeriodo,
  rangoMesRD,
} from '../utils/metricasNegocio';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal } from '../types';
import { formatMoneda } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  TrendingUp,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  UserPlus,
  Award,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  calcularQuincenaActual,
  listarUltimasQuincenas,
  rangoQuincena,
} from '../utils/comisiones';
import { differenceInMinutes } from 'date-fns';

export default function Rendimiento() {
  const { userProfile } = useApp();
  const autorizado =
    userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const [error, setError] = useState('');
  const [crudas, setCrudas] = useState<OrdenCobrosCruda[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [filtroCoord, setFiltroCoord] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<'hoy' | 'semana' | 'mes' | 'rango'>('mes');
  const [fechaInicio, setFechaInicio] = useState(
    () => diaCobroRD(new Date()).slice(0, 7) + '-01',
  );
  const [fechaFin, setFechaFin] = useState(() => diaCobroRD(new Date()));

  useEffect(() => {
    if (!autorizado) return;
    setLoading(true);
    setError('');
    const loaded = new Set<string>();
    const listo = (key: string) => {
      loaded.add(key);
      if (loaded.size === 2) setLoading(false);
    };
    const fail = () => {
      setError('No se pudieron cargar todas las fuentes.');
      setLoading(false);
    };
    const unsub1 = onSnapshot(
      collection(db, 'ordenes_servicio'),
      (snap) => {
        setOrdenes(snap.docs.map((d) => ordenMetrica(d.id, d.data())));
        setCrudas(snap.docs.map((d) => ({ id: d.id, datos: d.data() })));
        listo('ordenes');
      },
      fail,
    );
    const unsub2 = onSnapshot(
      collection(db, 'personal'),
      (snap) => {
        setPersonal(snap.docs.map((d) => ({ ...d.data(), id: d.id } as Personal)));
        listo('personal');
      },
      fail,
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [autorizado]);

  const dateRange = useMemo(() => {
    const now = new Date();
    const hoyRD = diaCobroRD(now);
    const inicioRD = fechaFinanciera(hoyRD)!;
    const diaSemana = new Date(hoyRD + 'T12:00:00Z').getUTCDay();
    const semanaRD = new Date(inicioRD.getTime() - ((diaSemana + 6) % 7) * 86400000);
    if (filtroFecha === 'hoy') return { start: inicioRD, end: now };
    if (filtroFecha === 'semana') return { start: semanaRD, end: now };
    if (filtroFecha === 'mes') return { start: rangoMesRD(hoyRD.slice(0, 7)).inicio, end: now };
    if (filtroFecha === 'rango' && fechaInicio && fechaFin) {
      return {
        start: fechaFinanciera(fechaInicio) || new Date(NaN),
        end: new Date((fechaFinanciera(fechaFin)?.getTime() ?? NaN) + 86400000 - 1),
      };
    }
    return { start: rangoMesRD(hoyRD.slice(0, 7)).inicio, end: now };
  }, [filtroFecha, fechaInicio, fechaFin]);

  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((o) => {
      if (o.eliminada) return false;
      const inRange = o.createdAt >= dateRange.start && o.createdAt <= dateRange.end;
      const matchCoord =
        !filtroCoord ||
        identidadPersonal(o.operariaId || o.responsableId || o.creadoPor, personal)?.id ===
          filtroCoord;
      return inRange && matchCoord;
    });
  }, [ordenes, dateRange, filtroCoord, personal]);

  const coordinadores = useMemo(() => {
    const secretarias = personal.filter(
      (p) => (p.rol === 'secretaria' || p.rol === 'operaria') && p.activo,
    );
    return secretarias;
  }, [personal]);

  const kpis = useMemo(() => {
    const total = ordenesFiltradas.length;
    const confirmadas = ordenesFiltradas.filter((o) =>
      [
        'agendado',
        'en_diagnostico',
        'en_cotizacion',
        'aprobado',
        'trabajo_realizado',
        'cerrado',
      ].includes(o.fase),
    ).length;
    const canceladas = ordenesFiltradas.filter((o) => o.fase === 'cancelado').length;
    const reagendadas = ordenesFiltradas.filter((o) => o.reagendada).length;

    const clienteIds = new Set(ordenesFiltradas.map((o) => o.clienteId).filter(Boolean));
    const clientesPrevios = new Set(
      ordenes.filter((o) => o.createdAt < dateRange.start).map((o) => o.clienteId).filter(Boolean),
    );
    const nuevosClientes = [...clienteIds].filter((id) => !clientesPrevios.has(id)).length;

    const tasaConfirmacion = total > 0 ? (confirmadas / total) * 100 : 0;

    const tiempos: number[] = [];
    ordenesFiltradas.forEach((o) => {
      const lead = o.historialFases.find((h) => h.fase === 'nuevo_lead');
      const gestion = o.historialFases.find((h) => h.fase === 'en_gestion');
      if (lead && gestion) {
        const minutos = differenceInMinutes(gestion.timestamp, lead.timestamp);
        if (Number.isFinite(minutos) && minutos >= 0) tiempos.push(minutos);
      }
    });
    const avgRespuesta =
      tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;

    const completadasSemana = cerradasDelPeriodo(
      ordenes,
      personal,
      dateRange.start,
      dateRange.end,
      filtroCoord,
    ).length;
    const completadasMes = cerradasDelPeriodo(
      ordenes,
      personal,
      dateRange.start,
      dateRange.end,
      filtroCoord,
    ).length;

    const byCoord: Record<
      string,
      {
        nombre: string;
        confirmadas: number;
        canceladas: number;
        reagendadas: number;
        nuevosClientes: number;
        total: number;
      }
    > = {};
    coordinadores.forEach((c) => {
      byCoord[c.id] = {
        nombre: c.nombre,
        confirmadas: 0,
        canceladas: 0,
        reagendadas: 0,
        nuevosClientes: 0,
        total: 0,
      };
    });
    ordenesFiltradas.forEach((o) => {
      const persona = identidadPersonal(
        o.operariaId || o.responsableId || o.creadoPor,
        personal,
      );
      const coord = persona?.id || 'sin-identidad';
      if (!byCoord[coord])
        byCoord[coord] = {
          nombre: persona?.nombre || 'Sin responsable identificable',
          confirmadas: 0,
          canceladas: 0,
          reagendadas: 0,
          nuevosClientes: 0,
          total: 0,
        };
      byCoord[coord].total++;
      if (
        [
          'agendado',
          'en_diagnostico',
          'en_cotizacion',
          'aprobado',
          'trabajo_realizado',
          'cerrado',
        ].includes(o.fase)
      )
        byCoord[coord].confirmadas++;
      if (o.fase === 'cancelado') byCoord[coord].canceladas++;
      if (o.reagendada) byCoord[coord].reagendadas++;
    });

    Object.entries(byCoord).forEach(([id, stats]) => {
      stats.nuevosClientes = new Set(
        ordenesFiltradas
          .filter(
            (o) =>
              identidadPersonal(
                o.operariaId || o.responsableId || o.creadoPor,
                personal,
              )?.id === id &&
              o.clienteId &&
              !clientesPrevios.has(o.clienteId),
          )
          .map((o) => o.clienteId),
      ).size;
    });

    const byTecnico: Record<
      string,
      {
        nombre: string;
        pendientes: number;
        enProceso: number;
        completados: number;
        total: number;
        montoFacturado: number;
      }
    > = {};
    const tecnicos = personal.filter((p) => p.rol === 'tecnico');
    tecnicos.forEach((t) => {
      // @safe-tecnicoid-id: agrupación canónica; todas las lecturas resuelven uid/id mediante identidadPersonal única.
      byTecnico[t.id] = {
        nombre: t.nombre,
        pendientes: 0,
        enProceso: 0,
        completados: 0,
        total: 0,
        montoFacturado: 0,
      };
    });
    ordenesFiltradas.forEach((o) => {
      const id = identidadPersonal(o.tecnicoId, personal)?.id;
      if (!id || !byTecnico[id]) return;
      byTecnico[id].total++;
      if (['nuevo_lead', 'en_gestion', 'aprobado', 'agendado'].includes(o.fase))
        byTecnico[id].pendientes++;
      if (['en_diagnostico', 'en_cotizacion'].includes(o.fase)) byTecnico[id].enProceso++;
      if (['trabajo_realizado', 'cerrado'].includes(o.fase)) byTecnico[id].completados++;
    });
    const caja = proyectarCobrosCaja(
      crudas,
      undefined,
      Number.isFinite(dateRange.start.getTime())
        ? diaCobroRD(dateRange.start)
        : '9999-01-01',
      Number.isFinite(dateRange.end.getTime())
        ? diaCobroRD(dateRange.end)
        : '0001-01-01',
    );
    caja.movimientos
      .filter((m) => m.confirmado)
      .forEach((m) => {
        const orden = ordenes.find((o) => o.id === m.ordenId);
        if (
          !orden ||
          (filtroCoord &&
            identidadPersonal(
              orden.operariaId || orden.responsableId || orden.creadoPor,
              personal,
            )?.id !== filtroCoord)
        )
          return;
        const id = identidadPersonal(orden.tecnicoId, personal)?.id;
        if (id && byTecnico[id]) byTecnico[id].montoFacturado += m.monto;
      });

    return {
      total,
      confirmadas,
      canceladas,
      reagendadas,
      nuevosClientes,
      tasaConfirmacion,
      avgRespuesta,
      completadasSemana,
      completadasMes,
      byCoord,
      byTecnico,
    };
  }, [ordenesFiltradas, ordenes, personal, crudas, coordinadores, dateRange, filtroCoord]);

  if (!autorizado) {
    return (
      <div className="ms-bamboo p-4 md:p-6">
        <div className="b-callout b-callout-warn">
          Acceso restringido a administración y coordinación.
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="ms-bamboo p-4 md:p-6">
        <div className="b-callout b-callout-danger" role="alert">
          {error}
        </div>
      </div>
    );
  }
  if (
    !Number.isFinite(dateRange.start.getTime()) ||
    !Number.isFinite(dateRange.end.getTime()) ||
    dateRange.start > dateRange.end
  ) {
    return (
      <div className="ms-bamboo p-4 md:p-6">
        <div className="b-callout b-callout-warn">
          <p>Seleccioná un rango válido.</p>
          <button
            type="button"
            className="b-btn is-primary"
            style={{ marginTop: 8 }}
            onClick={() => setFiltroFecha('mes')}
          >
            Volver al mes
          </button>
        </div>
      </div>
    );
  }
  if (loading) return <LoadingSpinner fullPage text="Cargando rendimiento..." />;

  const sinTecnico = ordenesFiltradas.filter((o) => !identidadPersonal(o.tecnicoId, personal))
    .length;
  const sinFecha = ordenes.filter((o) => !Number.isFinite(o.createdAt.getTime())).length;

  return (
    <div className="ms-bamboo p-4 md:p-6">
      <div className="b-stack">
        <header className="b-page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="b-page-icon" aria-hidden="true">
              <TrendingUp size={22} />
            </div>
            <div>
              <h1>Rendimiento · KPIs</h1>
              <p className="b-page-sub">
                Órdenes agrupadas por fecha de creación; cierres por su fecha registrada. Sin
                técnico identificable: <strong>{sinTecnico}</strong>. Sin fecha de creación:{' '}
                <strong>{sinFecha}</strong>.
              </p>
            </div>
          </div>
        </header>

        <section>
          <h3 className="b-h3">Filtros</h3>
          <div
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
          >
            {(['hoy', 'semana', 'mes', 'rango'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`b-btn ${filtroFecha === f ? 'is-primary' : ''}`}
                onClick={() => setFiltroFecha(f)}
                style={{ minHeight: 38, padding: '8px 14px' }}
              >
                {f === 'hoy'
                  ? 'Hoy'
                  : f === 'semana'
                  ? 'Semana'
                  : f === 'mes'
                  ? 'Mes'
                  : 'Rango'}
              </button>
            ))}
            {filtroFecha === 'rango' && (
              <>
                <input
                  type="date"
                  className="b-input"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  style={{ width: 'auto', minHeight: 38 }}
                />
                <span style={{ color: 'var(--b-muted)' }}>—</span>
                <input
                  type="date"
                  className="b-input"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  style={{ width: 'auto', minHeight: 38 }}
                />
              </>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <select
                className="b-input"
                value={filtroCoord}
                onChange={(e) => setFiltroCoord(e.target.value)}
                style={{ width: 'auto', minHeight: 38 }}
              >
                <option value="">Todos los coordinadores</option>
                {coordinadores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="b-kpi-grid">
          <KpiBamboo
            tono="ok"
            icon={<CheckCircle size={16} aria-hidden="true" />}
            label="Confirmadas"
            value={kpis.confirmadas}
          />
          <KpiBamboo
            tono="danger"
            icon={<XCircle size={16} aria-hidden="true" />}
            label="Canceladas"
            value={kpis.canceladas}
          />
          <KpiBamboo
            tono="warn"
            icon={<RefreshCw size={16} aria-hidden="true" />}
            label="Reagendadas"
            value={kpis.reagendadas}
          />
          <KpiBamboo
            tono="info"
            icon={<UserPlus size={16} aria-hidden="true" />}
            label="Nuevos clientes"
            value={kpis.nuevosClientes}
          />
          <KpiBamboo
            tono="neutral"
            icon={<Clock size={16} aria-hidden="true" />}
            label="Resp. promedio"
            value={`${kpis.avgRespuesta} min`}
          />
        </section>

        <section className="b-panel" style={{ borderRadius: 'var(--b-r-md)', borderTop: '1px solid var(--b-line)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h3 className="b-h3" style={{ margin: 0 }}>
              Tasa de confirmación global
            </h3>
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--b-green)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpis.tasaConfirmacion.toFixed(1)}%
            </span>
          </div>
          <div
            className="b-meter"
            role="progressbar"
            aria-valuenow={Math.round(kpis.tasaConfirmacion)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tasa de confirmación global"
            style={{ height: 12 }}
          >
            <span style={{ width: `${Math.min(kpis.tasaConfirmacion, 100)}%` }} />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
              fontSize: 12,
              color: 'var(--b-muted)',
            }}
          >
            <span>Cerradas en el período: {kpis.completadasSemana}</span>
            <span>Importes: cobros confirmados por fecha del pago</span>
          </div>
        </section>

        <section className="b-panel" style={{ borderRadius: 'var(--b-r-md)', borderTop: '1px solid var(--b-line)' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}
          >
            <Users size={18} aria-hidden="true" style={{ color: 'var(--b-green)' }} />
            <h3 className="b-h3" style={{ margin: 0 }}>
              Rendimiento por coordinador
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(kpis.byCoord)
              .filter(([, c]) => c.total > 0)
              .map(([id, stats]) => {
                const tasa = stats.total > 0 ? (stats.confirmadas / stats.total) * 100 : 0;
                return (
                  <div
                    key={id}
                    style={{
                      background: 'var(--b-pista)',
                      borderRadius: 'var(--b-r-md)',
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <strong style={{ fontSize: 15, color: 'var(--b-ink)' }}>
                        {stats.nombre}
                      </strong>
                      <span className="b-help">{stats.total} órdenes</span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <MiniKpi value={stats.confirmadas} label="Confirmadas" tono="ok" />
                      <MiniKpi value={stats.canceladas} label="Canceladas" tono="danger" />
                      <MiniKpi value={stats.reagendadas} label="Reagendadas" tono="warn" />
                      <MiniKpi value={stats.nuevosClientes} label="Nuevos" tono="info" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="b-help" style={{ minWidth: 110 }}>
                        Tasa confirmación
                      </span>
                      <div
                        className="b-meter"
                        role="progressbar"
                        aria-valuenow={Math.round(tasa)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Tasa confirmación ${stats.nombre}`}
                        style={{ flex: 1, height: 8 }}
                      >
                        <span style={{ width: `${Math.min(tasa, 100)}%` }} />
                      </div>
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--b-green)',
                          minWidth: 50,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {tasa.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            {Object.values(kpis.byCoord).filter((c) => c.total > 0).length === 0 && (
              <p className="b-help" style={{ textAlign: 'center', padding: 16 }}>
                Sin datos para el período seleccionado.
              </p>
            )}
          </div>
        </section>

        <section className="b-panel" style={{ borderRadius: 'var(--b-r-md)', borderTop: '1px solid var(--b-line)' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}
          >
            <TrendingUp size={18} aria-hidden="true" style={{ color: 'var(--b-green)' }} />
            <h3 className="b-h3" style={{ margin: 0 }}>
              Rendimiento por técnico
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(kpis.byTecnico).map(([id, t]) => {
              const pctCompletadas = t.total > 0 ? (t.completados / t.total) * 100 : 0;
              return (
                <div
                  key={id}
                  style={{
                    background: 'var(--b-pista)',
                    borderRadius: 'var(--b-r-md)',
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <strong style={{ fontSize: 15, color: 'var(--b-ink)' }}>{t.nombre}</strong>
                    <span
                      style={{
                        fontWeight: 600,
                        color: 'var(--b-green)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatMoneda(t.montoFacturado)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className="b-chip b-chip-off">Pendientes: {t.pendientes}</span>
                    <span className="b-chip b-chip-warn">En proceso: {t.enProceso}</span>
                    <span className="b-chip b-chip-ok">Completados: {t.completados}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="b-help" style={{ minWidth: 100 }}>
                      % completadas
                    </span>
                    <div
                      className="b-meter"
                      role="progressbar"
                      aria-valuenow={Math.round(pctCompletadas)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`% completadas ${t.nombre}`}
                      style={{ flex: 1, height: 8 }}
                    >
                      <span style={{ width: `${pctCompletadas}%` }} />
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: 'var(--b-green)',
                        minWidth: 50,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {pctCompletadas.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <DesempenoOperariasSection ordenes={ordenes} personal={personal} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// KPIs auxiliares
// ────────────────────────────────────────────────────────────────────────

type TonoKpi = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

function KpiBamboo({
  tono,
  icon,
  label,
  value,
}: {
  tono: TonoKpi;
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  const className =
    tono === 'ok'
      ? 'b-kpi b-kpi-ok'
      : tono === 'warn'
      ? 'b-kpi b-kpi-warn'
      : tono === 'info'
      ? 'b-kpi b-kpi-info'
      : tono === 'danger'
      ? 'b-kpi'
      : 'b-kpi';
  const colorAccento =
    tono === 'danger'
      ? 'var(--b-danger)'
      : tono === 'warn'
      ? 'var(--b-warning)'
      : tono === 'info'
      ? 'var(--b-info)'
      : tono === 'ok'
      ? 'var(--b-green)'
      : 'var(--b-ink)';
  return (
    <div className={className}>
      <span className="b-kpi-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: colorAccento }}>
        {icon} {label}
      </span>
      <span className="b-kpi-valor" style={tono === 'danger' ? { color: 'var(--b-danger)' } : undefined}>
        {value}
      </span>
    </div>
  );
}

function MiniKpi({
  value,
  label,
  tono,
}: {
  value: number;
  label: string;
  tono: TonoKpi;
}) {
  const color =
    tono === 'ok'
      ? 'var(--b-green)'
      : tono === 'danger'
      ? 'var(--b-danger)'
      : tono === 'warn'
      ? 'var(--b-warning)'
      : tono === 'info'
      ? 'var(--b-info)'
      : 'var(--b-ink)';
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      <p className="b-help">{label}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Desempeño operarias — cálculo heredado (bono fijo RD$5.000 al 70%)
// ────────────────────────────────────────────────────────────────────────

const UMBRAL_BONO = 0.70;
const BONO_MONTO = 5000;

function DesempenoOperariasSection({
  ordenes,
  personal,
}: {
  ordenes: OrdenServicio[];
  personal: Personal[];
}) {
  const { userProfile } = useApp();
  const esAdminOCoord =
    userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const [quincena, setQuincena] = useState<string>(calcularQuincenaActual(new Date()));
  const quincenas = useMemo(() => listarUltimasQuincenas(12), []);
  const operarias = useMemo(
    () => personal.filter((p) => p.activo && (p.rol === 'operaria' || p.rol === 'coordinadora')),
    [personal],
  );

  const datos = useMemo(() => {
    const { inicio, fin } = rangoQuincena(quincena);
    return operarias
      .map((op) => {
        // SPRINT-149 (P-006 variante operariaId): `o.operariaId` post-SPRINT-105
        // persiste auth.uid; fallback a `op.id` para operarias pre-onboarding sin
        // doc espejo en usuarios/{uid}.
        const ordenesEnRango = ordenes.filter(
          (o) =>
            identidadPersonal(o.operariaId, personal)?.id === op.id &&
            !o.eliminada &&
            (o.fase === 'cerrado' || o.soloChequeo) &&
            enPeriodo(fechaCierreMetrica(o), inicio, fin),
        );
        const chequeos = ordenesEnRango.filter((o) => o.soloChequeo).length;
        const completadas = ordenesEnRango.filter(
          (o) => o.fase === 'cerrado' && !o.soloChequeo,
        ).length;
        const atendidas = chequeos + completadas;
        const pct = atendidas > 0 ? completadas / atendidas : 0;
        const bono = pct >= UMBRAL_BONO ? BONO_MONTO : 0;
        return { operaria: op, atendidas, completadas, chequeos, pct, bono };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [operarias, ordenes, quincena, personal]);

  if (!esAdminOCoord) return null;

  return (
    <section className="b-panel" style={{ borderRadius: 'var(--b-r-md)', borderTop: '1px solid var(--b-line)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Award size={18} aria-hidden="true" style={{ color: 'var(--b-green)' }} />
          <h3 className="b-h3" style={{ margin: 0 }}>
            Desempeño de operarias
          </h3>
        </div>
        <select
          className="b-input"
          value={quincena}
          onChange={(e) => setQuincena(e.target.value)}
          style={{ width: 'auto', minHeight: 38 }}
        >
          {quincenas.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>

      <div className="b-callout b-callout-warn" style={{ marginBottom: 14 }}>
        <strong>Cálculo heredado · revisión pendiente.</strong> Hoy el bono se gatilla con un
        desempeño ≥ {(UMBRAL_BONO * 100).toFixed(0)}% (órdenes completadas / órdenes atendidas; los
        chequeos cuentan como atendidas) y un monto fijo de RD${BONO_MONTO.toLocaleString('es-DO')}.
        La regla final acordada por Jorge (bono proporcional a ventas efectivamente cobradas de la
        meta mensual del equipo, máximo RD$4.000 por persona, personal ve solo porcentaje) sigue en
        planificación; no se activa en este lote.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {datos.length === 0 ? (
          <p className="b-help" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 16 }}>
            Sin operarias activas.
          </p>
        ) : (
          datos.map((d) => (
            <div
              key={d.operaria.id}
              style={{
                border: '1px solid var(--b-line)',
                borderRadius: 'var(--b-r-md)',
                padding: 14,
                background: 'var(--b-paper)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  className="b-avatar"
                  style={{ width: 36, height: 36, fontSize: 13 }}
                >
                  {d.operaria.nombre
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <strong style={{ fontWeight: 600, color: 'var(--b-ink)' }}>
                  {d.operaria.nombre}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="b-help">Atendidas</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {d.atendidas}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--b-green)' }}>Completadas</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--b-green)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {d.completadas}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--b-warning)' }}>Solo chequeo</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--b-warning)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {d.chequeos}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--b-line)',
                  paddingTop: 8,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--b-ink)' }}>% desempeño</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: d.pct >= UMBRAL_BONO ? 'var(--b-green)' : 'var(--b-ink)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {(d.pct * 100).toFixed(0)}%
                </span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  padding: '8px 10px',
                  borderRadius: 'var(--b-r-sm)',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: 15,
                  background: d.bono > 0 ? 'var(--b-soft)' : 'var(--b-pista)',
                  color: d.bono > 0 ? 'var(--b-green)' : 'var(--b-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Bono: RD${d.bono.toLocaleString('es-DO')}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
