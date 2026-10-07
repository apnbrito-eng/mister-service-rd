/**
 * Rediseño visual BambooHR — Lote 2 (Avances a Empleados).
 *
 * Mantiene la lógica previa intacta (crearAvance, suscribirAvances,
 * eliminarAvance, filtros, cálculo de totales, etc). Sólo se reemplaza la
 * presentación por los primitivos `.ms-bamboo`. No se tocan servicios,
 * reglas financieras ni Firestore rules.
 *
 * Autor: Claude Code — 2026-10-07.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AvanceEmpleado, Personal } from '../types';
import { formatMoneda, formatFecha } from '../utils';
import { calcularQuincenaActual, listarUltimasQuincenas } from '../utils/comisiones';
import { suscribirAvances, crearAvance, eliminarAvance } from '../services/avances.service';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Wallet, Plus, Trash2, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Avances() {
  const { userProfile } = useApp();
  const puedeGestionar = puede(userProfile, 'avancesGestionar') ||
    userProfile?.rol === 'administrador' ||
    userProfile?.rol === 'coordinadora';

  const [loading, setLoading] = useState(true);
  const [avances, setAvances] = useState<AvanceEmpleado[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filtroQuincena, setFiltroQuincena] = useState<string>(calcularQuincenaActual(new Date()));
  const [filtroEstado, setFiltroEstado] = useState<'pendientes' | 'descontados' | 'todos'>('pendientes');
  const [filtroPersonal, setFiltroPersonal] = useState<string>('');

  const [form, setForm] = useState({
    personalId: '',
    monto: '',
    motivo: '',
    metodoPago: 'efectivo' as 'efectivo' | 'transferencia' | 'tarjeta',
    quincenaAsignada: calcularQuincenaActual(new Date()),
    notas: '',
  });

  useEffect(() => {
    const unsub = suscribirAvances(items => {
      setAvances(items);
      setLoading(false);
    });
    const unsubPersonal = onSnapshot(
      query(collection(db, 'personal'), where('activo', '==', true)),
      snap => setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal))),
    );
    return () => { unsub(); unsubPersonal(); };
  }, []);

  const quincenasDisponibles = useMemo(() => listarUltimasQuincenas(12), []);
  const empleados = personal.filter(p =>
    ['tecnico', 'operaria', 'coordinadora', 'secretaria'].includes(p.rol)
  );

  const avancesFiltrados = useMemo(() => {
    return avances.filter(a => {
      if (filtroEstado === 'pendientes' && a.descontado) return false;
      if (filtroEstado === 'descontados' && !a.descontado) return false;
      if (filtroPersonal && a.personalId !== filtroPersonal) return false;
      if (filtroQuincena && a.quincenaAsignada !== filtroQuincena) return false;
      return true;
    });
  }, [avances, filtroEstado, filtroPersonal, filtroQuincena]);

  const totales = useMemo(() => {
    const pendientes = avances.filter(a => !a.descontado);
    return {
      pendientes: pendientes.reduce((s, a) => s + a.monto, 0),
      descontados: avances.filter(a => a.descontado).reduce((s, a) => s + a.monto, 0),
      cantidad: avancesFiltrados.length,
      totalFiltro: avancesFiltrados.reduce((s, a) => s + a.monto, 0),
    };
  }, [avances, avancesFiltrados]);

  // Pendientes por empleado (para mostrar banner)
  const pendientesPorEmpleado = useMemo(() => {
    const mapa: Record<string, { nombre: string; total: number; cantidad: number }> = {};
    avances
      .filter(a => !a.descontado)
      .forEach(a => {
        if (!mapa[a.personalId]) mapa[a.personalId] = { nombre: a.personalNombre, total: 0, cantidad: 0 };
        mapa[a.personalId].total += a.monto;
        mapa[a.personalId].cantidad += 1;
      });
    return Object.entries(mapa)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [avances]);

  const resetForm = () => setForm({
    personalId: '',
    monto: '',
    motivo: '',
    metodoPago: 'efectivo',
    quincenaAsignada: calcularQuincenaActual(new Date()),
    notas: '',
  });

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.personalId) { toast.error('Selecciona un empleado'); return; }
    const monto = Number(form.monto);
    if (!monto || monto <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (!form.motivo.trim()) { toast.error('Describe el motivo del avance'); return; }

    setSaving(true);
    try {
      // @safe-tecnicoid-id: SPRINT-132 verificado — form.personalId proviene del dropdown
      // local `empleados.map(e => <option value={e.id}>)` y el campo persistido
      // `avances.personalId` no se gatea por auth.uid en firestore.rules (la rule de /avances
      // solo verifica rol). El lookup es simétrico con el dropdown y NO afecta rules.
      const emp = personal.find(p => p.id === form.personalId);
      await crearAvance({
        personalId: form.personalId,
        personalNombre: emp?.nombre || 'Sin nombre',
        personalRol: emp?.rol,
        monto,
        fecha: new Date(),
        motivo: form.motivo,
        metodoPago: form.metodoPago,
        quincenaAsignada: form.quincenaAsignada,
        creadoPorId: userProfile?.id || '',
        creadoPorNombre: userProfile?.nombre || 'Sistema',
        notas: form.notas || undefined,
      });
      toast.success(`Avance de ${formatMoneda(monto)} registrado para ${emp?.nombre}`);
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar avance');
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (a: AvanceEmpleado) => {
    if (a.descontado) {
      toast.error('No se puede eliminar un avance ya descontado de una liquidación');
      return;
    }
    if (!confirm(`¿Eliminar avance de ${formatMoneda(a.monto)} a ${a.personalNombre}?`)) return;
    try {
      await eliminarAvance(a.id);
      toast.success('Avance eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando avances..." />;

  if (!puedeGestionar) {
    return (
      <div className="ms-bamboo p-4 md:p-6">
        <div className="b-callout b-callout-warn">
          No tenés permisos para ver avances a empleados.
        </div>
      </div>
    );
  }

  const avancesPendientes = avances.filter(a => !a.descontado).length;
  const avancesDescontados = avances.filter(a => a.descontado).length;

  return (
    <div className="ms-bamboo p-4 md:p-6">
      <div className="b-stack">
        <header className="b-page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="b-page-icon" aria-hidden="true">
              <Wallet size={22} />
            </div>
            <div>
              <h1>Avances a empleados</h1>
              <p className="b-page-sub">
                Préstamos y adelantos que se descuentan automáticamente en la liquidación de nómina.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="b-btn is-primary"
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} aria-hidden="true" /> Registrar avance
          </button>
        </header>

        <div className="b-kpi-grid">
          <div className="b-kpi b-kpi-warn">
            <span className="b-kpi-label">Pendientes de descontar</span>
            <span className="b-kpi-valor">{formatMoneda(totales.pendientes)}</span>
            <span className="b-kpi-sub">
              {avancesPendientes} avance{avancesPendientes === 1 ? '' : 's'}
            </span>
          </div>
          <div className="b-kpi b-kpi-ok">
            <span className="b-kpi-label">Ya descontados</span>
            <span className="b-kpi-valor">{formatMoneda(totales.descontados)}</span>
            <span className="b-kpi-sub">
              {avancesDescontados} avance{avancesDescontados === 1 ? '' : 's'}
            </span>
          </div>
          <div className="b-kpi b-kpi-info">
            <span className="b-kpi-label">Filtro actual</span>
            <span className="b-kpi-valor">{formatMoneda(totales.totalFiltro)}</span>
            <span className="b-kpi-sub">
              {totales.cantidad} avance{totales.cantidad === 1 ? '' : 's'} visible{totales.cantidad === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {pendientesPorEmpleado.length > 0 && (
          <section>
            <h3 className="b-h3">Pendientes por empleado (próxima nómina)</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pendientesPorEmpleado.map(p => (
                <div
                  key={p.id}
                  className="b-callout b-callout-warn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                  }}
                >
                  <AlertTriangle size={14} aria-hidden="true" />
                  <strong style={{ fontWeight: 600 }}>{p.nombre}</strong>
                  <span>·</span>
                  <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoneda(p.total)}
                  </strong>
                  <span>({p.cantidad})</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="b-h3">Filtros</h3>
          <div className="b-fields">
            <div className="b-field">
              <label className="b-field-label">Quincena</label>
              <select
                className="b-input"
                value={filtroQuincena}
                onChange={e => setFiltroQuincena(e.target.value)}
              >
                <option value="">Todas las quincenas</option>
                {quincenasDisponibles.map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
            <div className="b-field">
              <label className="b-field-label">Empleado</label>
              <select
                className="b-input"
                value={filtroPersonal}
                onChange={e => setFiltroPersonal(e.target.value)}
              >
                <option value="">Todos</option>
                {empleados.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
            <div className="b-field">
              <label className="b-field-label">Estado</label>
              <select
                className="b-input"
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value as 'pendientes' | 'descontados' | 'todos')}
              >
                <option value="pendientes">Pendientes</option>
                <option value="descontados">Ya descontados</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>
        </section>

        <section className="b-tabla-wrap">
          <div className="b-tabla-scroll">
            <table className="b-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th className="b-th-right">Monto</th>
                  <th>Motivo</th>
                  <th>Método</th>
                  <th>Quincena</th>
                  <th className="b-th-center">Estado</th>
                  <th className="b-th-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {avancesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="b-tabla-vacia">
                        Sin avances para los filtros seleccionados.
                      </div>
                    </td>
                  </tr>
                ) : (
                  avancesFiltrados.map(a => (
                    <tr key={a.id}>
                      <td className="b-td-muted">{formatFecha(a.fecha)}</td>
                      <td>
                        <strong style={{ fontWeight: 600 }}>{a.personalNombre}</strong>
                      </td>
                      <td className="b-td-right" style={{ fontWeight: 700 }}>
                        {formatMoneda(a.monto)}
                      </td>
                      <td className="b-td-muted">{a.motivo}</td>
                      <td className="b-td-muted" style={{ textTransform: 'capitalize' }}>
                        {a.metodoPago || '—'}
                      </td>
                      <td className="b-td-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {a.quincenaAsignada}
                      </td>
                      <td className="b-td-center">
                        {a.descontado ? (
                          <span className="b-chip b-chip-ok">
                            <Check size={10} aria-hidden="true" style={{ marginRight: 4 }} />
                            Descontado
                          </span>
                        ) : (
                          <span className="b-chip b-chip-warn">Pendiente</span>
                        )}
                      </td>
                      <td className="b-td-right">
                        {!a.descontado && (
                          <button
                            type="button"
                            className="b-btn is-ghost is-danger"
                            onClick={() => handleEliminar(a)}
                            title={`Eliminar avance de ${a.personalNombre}`}
                            aria-label={`Eliminar avance de ${a.personalNombre}`}
                            style={{ minHeight: 36, padding: '6px 10px' }}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title="Registrar avance a empleado"
        size="md"
      >
        <div className="ms-bamboo">
          <form onSubmit={handleGuardar} className="b-stack" style={{ gap: 16 }}>
            <div className="b-field b-full">
              <label className="b-field-label">Empleado *</label>
              <select
                className="b-input"
                value={form.personalId}
                onChange={e => setForm(f => ({ ...f, personalId: e.target.value }))}
              >
                <option value="">— Seleccioná empleado —</option>
                {empleados.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre} · {e.rol}</option>
                ))}
              </select>
            </div>

            <div className="b-fields">
              <div className="b-field">
                <label className="b-field-label">Monto · RD$ *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="b-input"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              <div className="b-field">
                <label className="b-field-label">Método</label>
                <select
                  className="b-input"
                  value={form.metodoPago}
                  onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value as 'efectivo' | 'transferencia' | 'tarjeta' }))}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
            </div>

            <div className="b-field b-full">
              <label className="b-field-label">Motivo *</label>
              <input
                type="text"
                className="b-input"
                value={form.motivo}
                onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                placeholder="Ej: adelanto para piezas, emergencia médica…"
                maxLength={200}
              />
            </div>

            <div className="b-field b-full">
              <label className="b-field-label">Descontar en quincena</label>
              <select
                className="b-input"
                value={form.quincenaAsignada}
                onChange={e => setForm(f => ({ ...f, quincenaAsignada: e.target.value }))}
              >
                {quincenasDisponibles.map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              <p className="b-help">
                El avance se descontará automáticamente de la liquidación de esta quincena.
              </p>
            </div>

            <div className="b-field b-full">
              <label className="b-field-label">Notas <span style={{ color: 'var(--b-muted)', fontWeight: 400 }}>(opcional)</span></label>
              <textarea
                rows={2}
                className="b-input"
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              />
            </div>

            <div className="b-footer">
              <button
                type="button"
                className="b-btn is-ghost"
                onClick={() => { setShowModal(false); resetForm(); }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="b-btn is-primary"
                disabled={saving}
              >
                <Check size={14} aria-hidden="true" />
                {saving ? 'Guardando…' : 'Registrar avance'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
