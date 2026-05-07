import { useEffect, useMemo, useState } from 'react';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { db } from '../../firebase/config';
import { useApp } from '../../context/AppContext';
import { crearRegistroAuditoria } from '../../utils';
import { METODO_PAGO_LABELS } from '../../utils/factura';
import { useTiposEquipo } from '../../hooks/useTiposEquipo';
import { suscribirBancos } from '../../services/bancos.service';
import type {
  Banco,
  MetodoPago,
  OrdenServicio,
  Personal,
} from '../../types';
import Modal from '../Modal';

/**
 * Modal de edición completa de una orden para admin (Fase B1).
 *
 * - Permite editar cualquier campo de la orden desde Conduces Pendientes.
 * - Marca como "sensibles" los datos proporcionados por el cliente (nombre,
 *   teléfono, email, dirección, referencia, equipo, falla). Al modificar
 *   esos campos, muestra un confirm con el diff y exige una razón.
 * - No incluye campos GPS (lat/lng) — decisión cerrada por Jorge.
 * - Registra un entry en `auditoria` con:
 *     · `editar_orden_datos_cliente` si hay cambios en campos sensibles.
 *     · `editar` en caso contrario.
 */

interface Props {
  orden: OrdenServicio;
  onGuardado: (ordenActualizada: OrdenServicio) => void;
  onCerrar: () => void;
}


/** Campos sensibles — border amarillo + requieren confirm con razón al modificarse. */
const CAMPOS_SENSIBLES = [
  'clienteNombre',
  'clienteTelefono',
  'clienteEmail',
  'clienteDireccion',
  'clienteReferencia',
  'equipoTipo',
  'equipoMarca',
  'equipoModelo',
  'descripcionFalla',
] as const;
type CampoSensible = typeof CAMPOS_SENSIBLES[number];

const LABELS_SENSIBLES: Record<CampoSensible, string> = {
  clienteNombre: 'Nombre',
  clienteTelefono: 'Teléfono',
  clienteEmail: 'Email',
  clienteDireccion: 'Dirección',
  clienteReferencia: 'Referencia',
  equipoTipo: 'Tipo de equipo',
  equipoMarca: 'Marca',
  equipoModelo: 'Modelo',
  descripcionFalla: 'Falla reportada',
};

const TOOLTIP_SENSIBLE =
  'Este dato lo proporcionó el cliente. Modificar puede crear inconsistencias con conduces/recibos ya generados.';

/** Formatea una fecha a valor de <input type="datetime-local"> en zona local. */
function dateToDatetimeLocal(d: Date | undefined | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convierte un valor de datetime-local a Date. Retorna null si vacío/invalid. */
function datetimeLocalToDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

interface FormState {
  // Sensibles
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string;
  clienteDireccion: string;
  clienteReferencia: string;
  equipoTipo: string;
  equipoMarca: string;
  equipoModelo: string;
  descripcionFalla: string;
  // Agendamiento (no sensibles)
  fechaCita: string;          // datetime-local
  duracionMin: string;        // string para permitir vacío
  tecnicoId: string;
  // Precios (no sensibles)
  precioAprobado: string;
  precioFinal: string;
  // Cierre de pago (no sensibles)
  metodoPagoCierre: string;   // '' | MetodoPago
  bancoDestinoCierre: string;
  // Notas (no sensibles)
  notas: string;
  notasTecnico: string;
}

function ordenToForm(o: OrdenServicio): FormState {
  return {
    clienteNombre: o.clienteNombre || '',
    clienteTelefono: o.clienteTelefono || '',
    clienteEmail: o.clienteEmail || '',
    clienteDireccion: o.clienteDireccion || '',
    clienteReferencia: o.clienteReferencia || '',
    equipoTipo: o.equipoTipo || '',
    equipoMarca: o.equipoMarca || '',
    equipoModelo: o.equipoModelo || '',
    descripcionFalla: o.descripcionFalla || '',
    fechaCita: dateToDatetimeLocal(o.fechaCita),
    duracionMin: typeof o.duracionMin === 'number' ? String(o.duracionMin) : '',
    tecnicoId: o.tecnicoId || '',
    precioAprobado: typeof o.precioAprobado === 'number' ? String(o.precioAprobado) : '',
    precioFinal: typeof o.precioFinal === 'number' ? String(o.precioFinal) : '',
    metodoPagoCierre: o.metodoPagoCierre || '',
    bancoDestinoCierre: o.bancoDestinoCierre || '',
    notas: o.notas || '',
    notasTecnico: o.notasTecnico || '',
  };
}

export default function ModalEditarOrdenAdmin({ orden, onGuardado, onCerrar }: Props) {
  const { userProfile } = useApp();
  const tiposEquipo = useTiposEquipo();
  const [form, setForm] = useState<FormState>(() => ordenToForm(orden));
  const [original] = useState<FormState>(() => ordenToForm(orden));
  const [modificados, setModificados] = useState<Set<string>>(new Set());
  const [modalRazonAbierto, setModalRazonAbierto] = useState(false);
  const [razonCambio, setRazonCambio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [tecnicos, setTecnicos] = useState<Personal[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);

  // Re-sync si cambia la orden externa (distinta id). Intencional: solo
  // re-sync cuando cambia el id, no cuando cambian campos del mismo doc
  // (eso lo maneja el formulario localmente).
  useEffect(() => {
    setForm(ordenToForm(orden));
    setModificados(new Set());
    setRazonCambio('');
    setModalRazonAbierto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.id]);

  // Subscribir técnicos activos
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'personal'), snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Personal))
        .filter(p => p.rol === 'tecnico' && p.activo);
      setTecnicos(list);
    });
    return () => unsub();
  }, []);

  // Subscribir bancos activos
  useEffect(() => {
    const unsub = suscribirBancos(list => {
      setBancos(list.filter(b => b.activo));
    });
    return () => unsub();
  }, []);

  const actualizar = <K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setModificados(prev => {
      const next = new Set(prev);
      const key = campo as string;
      if (valor !== original[campo]) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const sensiblesModificados = useMemo<CampoSensible[]>(() => {
    return CAMPOS_SENSIBLES.filter(c => modificados.has(c));
  }, [modificados]);

  const hayCambios = modificados.size > 0;

  // ─────────── Guardado ───────────

  const construirDiff = (): Record<string, { antes: string; despues: string }> => {
    const diff: Record<string, { antes: string; despues: string }> = {};
    for (const c of modificados) {
      const key = c as keyof FormState;
      diff[c] = {
        antes: String(original[key] ?? ''),
        despues: String(form[key] ?? ''),
      };
    }
    return diff;
  };

  const construirUpdatePayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};

    // Sensibles — si quedan vacíos, guardamos undefined (se saltea por strip),
    // salvo los requeridos: clienteNombre, equipoTipo, equipoMarca, descripcionFalla
    // (estos siempre se envían, aunque si llegaran vacíos el guard del botón los bloquea).
    if (modificados.has('clienteNombre')) payload.clienteNombre = form.clienteNombre.trim();
    if (modificados.has('clienteTelefono')) {
      payload.clienteTelefono = form.clienteTelefono.trim() || undefined;
    }
    if (modificados.has('clienteEmail')) {
      payload.clienteEmail = form.clienteEmail.trim() || undefined;
    }
    if (modificados.has('clienteDireccion')) {
      payload.clienteDireccion = form.clienteDireccion.trim() || undefined;
    }
    if (modificados.has('clienteReferencia')) {
      payload.clienteReferencia = form.clienteReferencia.trim() || undefined;
    }
    if (modificados.has('equipoTipo')) payload.equipoTipo = form.equipoTipo.trim();
    if (modificados.has('equipoMarca')) payload.equipoMarca = form.equipoMarca.trim();
    if (modificados.has('equipoModelo')) {
      payload.equipoModelo = form.equipoModelo.trim() || undefined;
    }
    if (modificados.has('descripcionFalla')) payload.descripcionFalla = form.descripcionFalla.trim();

    // Agendamiento
    if (modificados.has('fechaCita')) {
      const d = datetimeLocalToDate(form.fechaCita);
      payload.fechaCita = d ? Timestamp.fromDate(d) : undefined;
    }
    if (modificados.has('duracionMin')) {
      const n = Number(form.duracionMin);
      payload.duracionMin = form.duracionMin.trim() === '' || !Number.isFinite(n) ? undefined : n;
    }
    if (modificados.has('tecnicoId')) {
      const t = tecnicos.find(x => x.id === form.tecnicoId);
      payload.tecnicoId = form.tecnicoId || undefined;
      payload.tecnicoNombre = t?.nombre || undefined;
    }

    // Precios
    if (modificados.has('precioAprobado')) {
      const n = Number(form.precioAprobado);
      payload.precioAprobado = form.precioAprobado.trim() === '' || !Number.isFinite(n) ? undefined : n;
    }
    if (modificados.has('precioFinal')) {
      const n = Number(form.precioFinal);
      payload.precioFinal = form.precioFinal.trim() === '' || !Number.isFinite(n) ? undefined : n;
    }

    // Cierre de pago
    if (modificados.has('metodoPagoCierre')) {
      payload.metodoPagoCierre = (form.metodoPagoCierre as MetodoPago) || undefined;
    }
    if (modificados.has('bancoDestinoCierre')) {
      payload.bancoDestinoCierre = form.bancoDestinoCierre.trim() || undefined;
    }

    // Notas
    if (modificados.has('notas')) payload.notas = form.notas.trim() || undefined;
    if (modificados.has('notasTecnico')) payload.notasTecnico = form.notasTecnico.trim() || undefined;

    // Strip undefined (convención CLAUDE.md) — al guardar usamos ''/null NO.
    // Firestore rechaza undefined. Para "borrar" un campo habría que usar
    // deleteField(), pero por simplicidad stripeamos (el campo queda igual
    // al valor original en Firestore). Si queremos borrar, el admin escribe ''
    // y aquí filtramos: si quedó undefined, saltar.
    return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
  };

  const ejecutarGuardado = async (razon?: string) => {
    if (!userProfile) {
      toast.error('Sesión expirada.');
      return;
    }

    // Validar requeridos sensibles
    if (!form.clienteNombre.trim()) {
      toast.error('El nombre del cliente es obligatorio.');
      return;
    }
    if (!form.equipoTipo.trim()) {
      toast.error('El tipo de equipo es obligatorio.');
      return;
    }
    if (!form.equipoMarca.trim()) {
      toast.error('La marca del equipo es obligatoria.');
      return;
    }
    if (!form.descripcionFalla.trim()) {
      toast.error('La descripción de la falla es obligatoria.');
      return;
    }

    setGuardando(true);
    try {
      const now = Timestamp.now();
      const adminNombre = userProfile.nombre || userProfile.email || 'Admin';
      const updatePayload = construirUpdatePayload();

      if (Object.keys(updatePayload).length === 0) {
        toast('Sin cambios para guardar.');
        setGuardando(false);
        return;
      }

      // Armar entry de auditoría
      const diff = construirDiff();
      let registro: Record<string, unknown>;
      if (sensiblesModificados.length > 0) {
        const camposLista = sensiblesModificados
          .map(c => LABELS_SENSIBLES[c])
          .join(', ');
        const detalle = `Editó datos del cliente (${camposLista}). Razón: ${razon || '—'}`;
        registro = crearRegistroAuditoria(
          adminNombre,
          'editar_orden_datos_cliente',
          detalle,
          sensiblesModificados.join(','),
          JSON.stringify(
            Object.fromEntries(
              sensiblesModificados.map(c => [c, diff[c]?.antes ?? '']),
            ),
          ),
          JSON.stringify(
            Object.fromEntries(
              sensiblesModificados.map(c => [c, diff[c]?.despues ?? '']),
            ),
          ),
        );
      } else {
        const camposLista = Array.from(modificados).join(', ');
        registro = crearRegistroAuditoria(
          adminNombre,
          'editar',
          `Editó la orden (${camposLista})`,
        );
      }

      updatePayload.auditoria = arrayUnion(registro);
      updatePayload.updatedAt = now;

      await updateDoc(doc(db, 'ordenes_servicio', orden.id), updatePayload);

      // Construir orden fusionada localmente para el callback onGuardado.
      const merged: OrdenServicio = { ...orden };
      // Aplicar sólo los campos que NO son undefined y que existen en OrdenServicio.
      const applyIfDefined = <K extends keyof OrdenServicio>(key: K, val: unknown) => {
        if (val === undefined) return;
        (merged as unknown as Record<string, unknown>)[key as string] = val;
      };
      applyIfDefined('clienteNombre', updatePayload.clienteNombre);
      applyIfDefined('clienteTelefono', updatePayload.clienteTelefono);
      applyIfDefined('clienteEmail', updatePayload.clienteEmail);
      applyIfDefined('clienteDireccion', updatePayload.clienteDireccion);
      applyIfDefined('clienteReferencia', updatePayload.clienteReferencia);
      applyIfDefined('equipoTipo', updatePayload.equipoTipo);
      applyIfDefined('equipoMarca', updatePayload.equipoMarca);
      applyIfDefined('equipoModelo', updatePayload.equipoModelo);
      applyIfDefined('descripcionFalla', updatePayload.descripcionFalla);
      if (modificados.has('fechaCita')) {
        const d = datetimeLocalToDate(form.fechaCita);
        merged.fechaCita = d || undefined;
      }
      applyIfDefined('duracionMin', updatePayload.duracionMin);
      applyIfDefined('tecnicoId', updatePayload.tecnicoId);
      applyIfDefined('tecnicoNombre', updatePayload.tecnicoNombre);
      applyIfDefined('precioAprobado', updatePayload.precioAprobado);
      applyIfDefined('precioFinal', updatePayload.precioFinal);
      applyIfDefined('metodoPagoCierre', updatePayload.metodoPagoCierre);
      applyIfDefined('bancoDestinoCierre', updatePayload.bancoDestinoCierre);
      applyIfDefined('notas', updatePayload.notas);
      applyIfDefined('notasTecnico', updatePayload.notasTecnico);
      merged.updatedAt = now.toDate();

      toast.success('Orden actualizada');
      onGuardado(merged);
      onCerrar();
    } catch (err) {
      console.error('[editar-orden-admin] error:', err);
      toast.error('No se pudieron guardar los cambios. Reintenta.');
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardarClick = () => {
    if (!hayCambios) {
      toast('Sin cambios para guardar.');
      return;
    }
    if (sensiblesModificados.length > 0) {
      setRazonCambio('');
      setModalRazonAbierto(true);
    } else {
      void ejecutarGuardado();
    }
  };

  const handleConfirmarConRazon = () => {
    if (!razonCambio.trim()) {
      toast.error('La razón es obligatoria para modificar datos del cliente.');
      return;
    }
    setModalRazonAbierto(false);
    void ejecutarGuardado(razonCambio.trim());
  };

  // ─────────── UI helpers ───────────

  const sensibleInputCls = (campo: CampoSensible) =>
    modificados.has(campo)
      ? 'w-full px-3 py-2 border-2 border-amber-500 bg-amber-50 rounded-lg text-sm focus:outline-none focus:border-amber-600'
      : 'w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:border-amber-500';

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]';

  const labelSensibleBase = (texto: string) => (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700">
      {texto} <AlertTriangle size={12} className="text-amber-500" />
    </span>
  );

  const modificadoHint = (campo: CampoSensible) =>
    modificados.has(campo) ? (
      <p className="text-[11px] text-amber-700 mt-0.5">Modificado — confirma al guardar</p>
    ) : null;

  return (
    <>
      <Modal
        isOpen={true}
        onClose={() => { if (!guardando) onCerrar(); }}
        title={`Editar orden ${orden.numero || ''}`}
        size="xl"
      >
        <div className="space-y-6">
          {/* ─── Cliente ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
              <span>👤 Cliente</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-700">
                <AlertTriangle size={11} /> Datos proporcionados por el cliente — modifica con cuidado
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1">{labelSensibleBase('Nombre *')}</label>
                <input
                  type="text"
                  value={form.clienteNombre}
                  onChange={e => actualizar('clienteNombre', e.target.value)}
                  className={sensibleInputCls('clienteNombre')}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('clienteNombre')}
              </div>
              <div>
                <label className="block mb-1">{labelSensibleBase('Teléfono')}</label>
                <input
                  type="tel"
                  value={form.clienteTelefono}
                  onChange={e => actualizar('clienteTelefono', e.target.value)}
                  className={sensibleInputCls('clienteTelefono')}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('clienteTelefono')}
              </div>
              <div className="md:col-span-2">
                <label className="block mb-1">{labelSensibleBase('Email')}</label>
                <input
                  type="email"
                  value={form.clienteEmail}
                  onChange={e => actualizar('clienteEmail', e.target.value)}
                  className={sensibleInputCls('clienteEmail')}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('clienteEmail')}
              </div>
            </div>
          </section>

          {/* ─── Dirección ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
              <span>📍 Dirección</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-700">
                <AlertTriangle size={11} /> Datos del cliente
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block mb-1">{labelSensibleBase('Dirección completa')}</label>
                <textarea
                  value={form.clienteDireccion}
                  onChange={e => actualizar('clienteDireccion', e.target.value)}
                  className={sensibleInputCls('clienteDireccion')}
                  rows={2}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('clienteDireccion')}
              </div>
              <div>
                <label className="block mb-1">{labelSensibleBase('Referencia')}</label>
                <input
                  type="text"
                  value={form.clienteReferencia}
                  onChange={e => actualizar('clienteReferencia', e.target.value)}
                  className={sensibleInputCls('clienteReferencia')}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('clienteReferencia')}
              </div>
            </div>
          </section>

          {/* ─── Equipo ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
              <span>🔧 Equipo</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-700">
                <AlertTriangle size={11} /> Datos del cliente
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1">{labelSensibleBase('Tipo *')}</label>
                <select
                  value={form.equipoTipo}
                  onChange={e => actualizar('equipoTipo', e.target.value)}
                  className={sensibleInputCls('equipoTipo')}
                  title={TOOLTIP_SENSIBLE}
                >
                  <option value="">Selecciona...</option>
                  {tiposEquipo.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {modificadoHint('equipoTipo')}
              </div>
              <div>
                <label className="block mb-1">{labelSensibleBase('Marca *')}</label>
                <input
                  type="text"
                  value={form.equipoMarca}
                  onChange={e => actualizar('equipoMarca', e.target.value)}
                  className={sensibleInputCls('equipoMarca')}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('equipoMarca')}
              </div>
              <div>
                <label className="block mb-1">{labelSensibleBase('Modelo')}</label>
                <input
                  type="text"
                  value={form.equipoModelo}
                  onChange={e => actualizar('equipoModelo', e.target.value)}
                  className={sensibleInputCls('equipoModelo')}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('equipoModelo')}
              </div>
              <div className="md:col-span-2">
                <label className="block mb-1">{labelSensibleBase('Falla reportada *')}</label>
                <textarea
                  value={form.descripcionFalla}
                  onChange={e => actualizar('descripcionFalla', e.target.value)}
                  className={sensibleInputCls('descripcionFalla')}
                  rows={2}
                  title={TOOLTIP_SENSIBLE}
                />
                {modificadoHint('descripcionFalla')}
              </div>
            </div>
          </section>

          {/* ─── Agendamiento ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              📅 Agendamiento
              <span className="ml-2 text-[11px] font-normal text-gray-500">
                admin puede editar libre
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fecha y hora cita</label>
                <input
                  type="datetime-local"
                  value={form.fechaCita}
                  onChange={e => actualizar('fechaCita', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Duración (min)</label>
                <input
                  type="number"
                  value={form.duracionMin}
                  onChange={e => actualizar('duracionMin', e.target.value)}
                  className={inputCls}
                  min={0}
                  step={15}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Técnico asignado</label>
                <select
                  value={form.tecnicoId}
                  onChange={e => actualizar('tecnicoId', e.target.value)}
                  className={inputCls}
                >
                  <option value="">Sin asignar</option>
                  {/* BUG fix (P-006): value es personal.uid (auth.uid), NO doc id.
                      Las rules comparan tecnicoId == request.auth.uid. */}
                  {tecnicos.filter(t => t.uid).map(t => (
                    <option key={t.id} value={t.uid}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ─── Precios ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">💰 Precios y cobro</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Precio aprobado (RD$)</label>
                <input
                  type="number"
                  value={form.precioAprobado}
                  onChange={e => actualizar('precioAprobado', e.target.value)}
                  className={inputCls}
                  min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Precio final (RD$)</label>
                <input
                  type="number"
                  value={form.precioFinal}
                  onChange={e => actualizar('precioFinal', e.target.value)}
                  className={inputCls}
                  min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Método de pago (cierre)</label>
                <select
                  value={form.metodoPagoCierre}
                  onChange={e => actualizar('metodoPagoCierre', e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {(Object.keys(METODO_PAGO_LABELS) as MetodoPago[]).map(m => (
                    <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Banco destino (cierre)</label>
                <select
                  value={form.bancoDestinoCierre}
                  onChange={e => actualizar('bancoDestinoCierre', e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {bancos.map(b => (
                    <option key={b.id} value={b.nombre}>{b.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ─── Notas ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">📝 Notas internas</h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={e => actualizar('notas', e.target.value)}
                  className={inputCls}
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas del técnico</label>
                <textarea
                  value={form.notasTecnico}
                  onChange={e => actualizar('notasTecnico', e.target.value)}
                  className={inputCls}
                  rows={2}
                />
              </div>
            </div>
          </section>

          {/* ─── Auditoría (read-only) ─── */}
          {orden.auditoria && orden.auditoria.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">📋 Auditoría</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                {orden.auditoria.slice().reverse().map((a, i) => (
                  <div key={i} className="text-[11px] text-gray-600">
                    <span className="font-mono text-gray-500">
                      {a.fecha instanceof Date ? a.fecha.toLocaleString('es-DO') : ''}
                    </span>
                    {' · '}
                    <span className="font-medium text-gray-800">{a.usuario}</span>
                    {' · '}
                    <span className="italic">{a.accion}</span>
                    {a.detalle && <> — {a.detalle}</>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── Footer ─── */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardarClick}
              disabled={guardando || !hayCambios}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {guardando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Sub-modal: confirmar cambios sensibles con razón */}
      {modalRazonAbierto && (
        <Modal
          isOpen={modalRazonAbierto}
          onClose={() => { if (!guardando) setModalRazonAbierto(false); }}
          title="⚠️ Estás modificando datos del cliente"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Cambios detectados en los datos proporcionados por el cliente:
            </p>
            <ul className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1">
              {sensiblesModificados.map(c => {
                const antes = String(original[c] ?? '');
                const despues = String(form[c] ?? '');
                return (
                  <li key={c} className="text-gray-800">
                    <span className="font-semibold">{LABELS_SENSIBLES[c]}:</span>{' '}
                    <span className="text-gray-500">"{antes || '—'}"</span>{' '}
                    →{' '}
                    <span className="text-amber-800 font-medium">"{despues || '—'}"</span>
                  </li>
                );
              })}
            </ul>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Razón de la modificación <span className="text-red-500">*</span>
              </label>
              <textarea
                value={razonCambio}
                onChange={e => setRazonCambio(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#0f3460]"
                rows={3}
                placeholder="Ej: El cliente corrigió el número de teléfono al emitir el conduce."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalRazonAbierto(false)}
                disabled={guardando}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarConRazon}
                disabled={guardando || !razonCambio.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {guardando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Sí, actualizar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
