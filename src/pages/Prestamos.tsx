/**
 * Rediseño visual BambooHR — Lote 3 (Préstamos a Empleados).
 *
 * Preserva íntegramente los cálculos de saldo, cuotas, progreso y la lógica de
 * cancelación con motivo + auditoría. Permisos existentes intactos
 * (admin + coord ven; solo admin cancela). No se tocan servicios
 * `prestamos.service.ts`, Firestore rules ni reglas financieras.
 *
 * Autor: Claude Code — 2026-10-07.
 */
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
  Wallet,
  Lock,
  ChevronDown,
  ChevronRight,
  XCircle,
  CheckCircle,
  AlertCircle,
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
    const unsub = suscribirPrestamos((items) => {
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
      (snap) => setPersonal(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Personal))),
    );
    return () => {
      unsub();
      unsubP();
    };
  }, []);

  const prestamosFiltrados = useMemo(() => {
    return prestamos.filter((p) => {
      if (filtroEstado === 'activos' && p.estado !== 'activo') return false;
      if (filtroEstado === 'pagados' && p.estado !== 'pagado') return false;
      if (filtroEstado === 'cancelados' && p.estado !== 'cancelado') return false;
      if (filtroPersonal && p.personalId !== filtroPersonal) return false;
      return true;
    });
  }, [prestamos, filtroEstado, filtroPersonal]);

  const totales = useMemo(() => {
    const activos = prestamos.filter((p) => p.estado === 'activo');
    return {
      cantidadActivos: activos.length,
      saldoActivoTotal: activos.reduce((s, p) => s + p.saldoPendiente, 0),
      cuotaQuincenalTotal: activos.reduce(
        (s, p) => s + Math.min(p.montoCuota, p.saldoPendiente),
        0,
      ),
    };
  }, [prestamos]);

  const toggleExpand = (id: string) => {
    setExpandido((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
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

  const empleadosOpts = personal.filter((p) =>
    ['tecnico', 'operaria', 'coordinadora', 'secretaria'].includes(p.rol),
  );

  if (loading) return <LoadingSpinner fullPage text="Cargando préstamos..." />;
  if (!puedeVer) {
    return (
      <div className="ms-bamboo p-4 md:p-6">
        <div className="b-callout b-callout-warn" style={{ textAlign: 'center' }}>
          <Lock size={32} aria-hidden="true" style={{ marginBottom: 8 }} />
          <p>No tenés permiso para ver los préstamos a empleados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-bamboo p-4 md:p-6">
      <div className="b-stack">
        <header className="b-page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="b-page-icon" aria-hidden="true">
              <Wallet size={22} />
            </div>
            <div>
              <h1>Préstamos a empleados</h1>
              <p className="b-page-sub">
                Préstamos programados que se descuentan automáticamente en cuotas quincenales.
                La creación de un préstamo nuevo se hace desde la liquidación de nómina.
              </p>
            </div>
          </div>
        </header>

        <div className="b-kpi-grid">
          <div className="b-kpi">
            <span className="b-kpi-label">Préstamos activos</span>
            <span className="b-kpi-valor">{totales.cantidadActivos}</span>
            <span className="b-kpi-sub">Con cuotas por descontar</span>
          </div>
          <div className="b-kpi b-kpi-warn">
            <span className="b-kpi-label">Saldo total pendiente</span>
            <span className="b-kpi-valor">{formatMoneda(totales.saldoActivoTotal)}</span>
            <span className="b-kpi-sub">Suma de todos los préstamos activos</span>
          </div>
          <div className="b-kpi b-kpi-info">
            <span className="b-kpi-label">Cuota quincenal estimada</span>
            <span className="b-kpi-valor">{formatMoneda(totales.cuotaQuincenalTotal)}</span>
            <span className="b-kpi-sub">Si se aplican todas las cuotas vigentes</span>
          </div>
        </div>

        <section>
          <h3 className="b-h3">Filtros</h3>
          <div className="b-fields">
            <div className="b-field">
              <label className="b-field-label">Estado</label>
              <select
                className="b-input"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
              >
                <option value="activos">Activos</option>
                <option value="pagados">Pagados</option>
                <option value="cancelados">Cancelados</option>
                <option value="todos">Todos</option>
              </select>
            </div>
            <div className="b-field">
              <label className="b-field-label">Empleado</label>
              <select
                className="b-input"
                value={filtroPersonal}
                onChange={(e) => setFiltroPersonal(e.target.value)}
              >
                <option value="">Todos los empleados</option>
                {empleadosOpts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {prestamosFiltrados.length === 0 ? (
          <section className="b-tabla-wrap">
            <div className="b-tabla-vacia">
              <Wallet size={32} aria-hidden="true" style={{ marginBottom: 8, opacity: 0.4 }} />
              <p>No hay préstamos que coincidan con el filtro.</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>
                Para crear un préstamo abrí una liquidación en <strong>/admin/nomina</strong> y
                pulsá "+ Descuento" en la fila del empleado.
              </p>
            </div>
          </section>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {prestamosFiltrados.map((p) => (
              <PrestamoCard
                key={p.id}
                prestamo={p}
                expandido={expandido.has(p.id)}
                onToggle={() => toggleExpand(p.id)}
                puedeCancelar={p.estado === 'activo' && esAdmin}
                onCancelar={() => abrirCancelar(p)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showCancelarModal}
        onClose={() => !cancelando && setShowCancelarModal(false)}
        title="Cancelar préstamo"
      >
        <div className="ms-bamboo">
          {prestamoCancelar && (
            <div className="b-stack" style={{ gap: 16 }}>
              <div className="b-callout b-callout-warn">
                Vas a cancelar el préstamo de <strong>{prestamoCancelar.personalNombre}</strong>.
                <br />
                Saldo pendiente actual: <strong>{formatMoneda(prestamoCancelar.saldoPendiente)}</strong>.
                <br />
                <span style={{ fontSize: 12 }}>
                  Las cuotas ya aplicadas a liquidaciones cerradas NO se afectan. Solo se previenen
                  futuras cuotas.
                </span>
              </div>
              <div className="b-field b-full">
                <label className="b-field-label">Motivo de cancelación *</label>
                <textarea
                  rows={3}
                  className="b-input"
                  value={motivoCancelar}
                  onChange={(e) => setMotivoCancelar(e.target.value)}
                  placeholder="Ej: empleado salió de la empresa, condonación, error administrativo…"
                  maxLength={400}
                />
              </div>
              <div className="b-footer">
                <button
                  type="button"
                  className="b-btn is-ghost"
                  onClick={() => setShowCancelarModal(false)}
                  disabled={cancelando}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="b-btn is-danger"
                  onClick={handleCancelar}
                  disabled={cancelando || !motivoCancelar.trim()}
                >
                  <XCircle size={14} aria-hidden="true" />
                  {cancelando ? 'Cancelando…' : 'Confirmar cancelación'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Card individual de préstamo
// ────────────────────────────────────────────────────────────────────────

function PrestamoCard({
  prestamo,
  expandido,
  onToggle,
  puedeCancelar,
  onCancelar,
}: {
  prestamo: PrestamoEmpleado;
  expandido: boolean;
  onToggle: () => void;
  puedeCancelar: boolean;
  onCancelar: () => void;
}) {
  const p = prestamo;
  const progreso = p.cuotasTotales > 0 ? p.cuotasPagadas / p.cuotasTotales : 0;
  const borderColor =
    p.estado === 'activo'
      ? 'var(--b-warning)'
      : p.estado === 'pagado'
      ? 'var(--b-green)'
      : 'var(--b-line)';
  const opacity = p.estado === 'cancelado' ? 0.75 : 1;

  return (
    <article
      className="b-panel"
      style={{
        borderLeft: `4px solid ${borderColor}`,
        borderTop: '1px solid var(--b-line)',
        borderRadius: 'var(--b-r-md)',
        opacity,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontWeight: 600, fontSize: 15, color: 'var(--b-ink)' }}>
              {p.personalNombre}
            </strong>
            <span style={{ fontSize: 12, color: 'var(--b-muted)', textTransform: 'capitalize' }}>
              · {p.personalRol}
            </span>
            {p.estado === 'activo' && (
              <span className="b-chip b-chip-warn">
                <AlertCircle size={10} aria-hidden="true" style={{ marginRight: 4 }} />
                Activo
              </span>
            )}
            {p.estado === 'pagado' && (
              <span className="b-chip b-chip-ok">
                <CheckCircle size={10} aria-hidden="true" style={{ marginRight: 4 }} />
                Pagado
              </span>
            )}
            {p.estado === 'cancelado' && (
              <span className="b-chip b-chip-off">
                <XCircle size={10} aria-hidden="true" style={{ marginRight: 4 }} />
                Cancelado
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: 'var(--b-ink-2)', margin: '6px 0 2px' }}>{p.motivo}</p>
          <p className="b-help">
            Creado por {p.creadoPorNombre} ·{' '}
            {formatFecha(p.createdAt instanceof Date ? p.createdAt : new Date())}
          </p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12,
            textAlign: 'right',
            fontSize: 13,
            minWidth: 240,
          }}
        >
          <div>
            <p className="b-help" style={{ marginBottom: 2 }}>
              Monto total
            </p>
            <p style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {formatMoneda(p.montoTotal)}
            </p>
          </div>
          <div>
            <p className="b-help" style={{ marginBottom: 2 }}>
              Por cuota
            </p>
            <p style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {formatMoneda(p.montoCuota)}
            </p>
          </div>
          <div>
            <p className="b-help" style={{ marginBottom: 2 }}>
              Cuotas
            </p>
            <p style={{ fontWeight: 600 }}>
              {p.cuotasPagadas}/{p.cuotasTotales}
            </p>
          </div>
          <div>
            <p className="b-help" style={{ marginBottom: 2 }}>
              Saldo pendiente
            </p>
            <p
              style={{
                fontWeight: 700,
                color:
                  p.estado === 'activo'
                    ? 'var(--b-warning)'
                    : p.estado === 'pagado'
                    ? 'var(--b-green)'
                    : 'var(--b-ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatMoneda(p.saldoPendiente)}
            </p>
          </div>
        </div>
      </header>

      <div
        className="b-meter"
        role="progressbar"
        aria-valuenow={Math.round(progreso * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso del préstamo de ${p.personalNombre}`}
        style={{ marginTop: 14 }}
      >
        <span
          style={{
            width: `${Math.min(100, Math.round(progreso * 100))}%`,
            background:
              p.estado === 'pagado'
                ? 'var(--b-green)'
                : p.estado === 'cancelado'
                ? 'var(--b-muted)'
                : 'var(--b-warning)',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          className="b-btn is-ghost"
          onClick={onToggle}
          aria-expanded={expandido}
          style={{ minHeight: 36, padding: '6px 10px', fontSize: 13 }}
        >
          {expandido ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
          Ver historial ({p.cuotasHistorial.length} cuota{p.cuotasHistorial.length !== 1 ? 's' : ''})
        </button>
        {puedeCancelar && (
          <button
            type="button"
            className="b-btn is-danger"
            onClick={onCancelar}
            style={{ minHeight: 36, padding: '6px 12px', fontSize: 13 }}
          >
            <XCircle size={12} aria-hidden="true" /> Cancelar préstamo
          </button>
        )}
      </div>

      {expandido && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--b-line)', paddingTop: 12 }}>
          {p.cuotasHistorial.length === 0 ? (
            <p className="b-help">Aún no se ha aplicado ninguna cuota.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {p.cuotasHistorial.map((c) => (
                <div
                  key={`${c.numero}-${c.liquidacionId}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 13,
                    padding: '8px 12px',
                    background: 'var(--b-pista)',
                    borderRadius: 'var(--b-r-xs)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span
                      style={{
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 600,
                        color: 'var(--b-green)',
                      }}
                    >
                      Cuota {c.numero}
                    </span>
                    <span>{c.quincena}</span>
                    <span className="b-help">
                      {formatFecha(
                        c.fechaAplicacion instanceof Date ? c.fechaAplicacion : new Date(),
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: 'var(--b-danger)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      -{formatMoneda(c.monto)}
                    </span>
                    <span className="b-help" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      Saldo: {formatMoneda(c.saldoRestante)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {p.estado === 'cancelado' && p.motivoCancelacion && (
            <div className="b-callout" style={{ marginTop: 10, fontSize: 13 }}>
              <strong>Cancelado:</strong> {p.motivoCancelacion}
              {p.canceladoPorNombre && (
                <p className="b-help" style={{ marginTop: 4 }}>
                  por {p.canceladoPorNombre}
                  {p.canceladoEn
                    ? ` · ${formatFecha(
                        p.canceladoEn instanceof Date ? p.canceladoEn : new Date(),
                      )}`
                    : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
