import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, where, Timestamp, arrayUnion, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { OrdenServicio, Usuario, Banco, PagoOrden, EstadoPagoOrden, Personal } from '../../types';
import { useApp } from '../../context/AppContext';
import { suscribirBancos } from '../../services/bancos.service';
import { obtenerPagosDeOrden } from '../../services/ordenes.service';
import { crearNotificacion } from '../../services/notificaciones.service';
import { crearRegistroAuditoria } from '../../utils';
import { puede } from '../../utils/permisos';
import { mensajeDatosCuentaBancaria, whatsappUrl } from '../../utils/whatsapp';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import { Banknote, ArrowRightLeft, CreditCard, Trash2, Copy } from 'lucide-react';
import WhatsAppIcon from '../icons/WhatsAppIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenServicio | null;
  userProfile: Usuario | null;
  onSaved?: () => void;
}

type Metodo = 'efectivo' | 'transferencia' | 'tarjeta';

function genId(): string {
  return `pago_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function formatearMonto(n: number): string {
  return `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function RegistrarPagoModal({ isOpen, onClose, orden, userProfile, onSaved }: Props) {
  const { currentUser } = useApp();
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [monto, setMonto] = useState<string>('');
  const [bancoId, setBancoId] = useState<string>('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Cargar bancos en tiempo real
  useEffect(() => {
    if (!isOpen) return;
    const unsub = suscribirBancos(list => setBancos(list.filter(b => b.activo)));
    return () => unsub();
  }, [isOpen]);

  // Reset al abrir
  useEffect(() => {
    if (isOpen && orden) {
      const total = Number(orden.precioFinal || orden.precioAprobado || orden.precioSugerido || 0);
      const pagado = Number(orden.montoPagado || 0);
      const pendiente = Math.max(0, total - pagado);
      setMonto(pendiente > 0 ? String(pendiente) : '');
      setMetodo('efectivo');
      setBancoId('');
      setReferencia('');
      setNotas('');
    }
  }, [isOpen, orden]);

  // SPRINT-PAGOS-FASE-B-2 (opción B): lectura vía helper común. Los writes
  // (handleGuardar L173, handleEliminarPago L323) NO se tocan en B-2 —
  // siguen escribiendo al array `data.pagos` dentro de runTransaction.
  const pagosPrevios = useMemo<PagoOrden[]>(() => obtenerPagosDeOrden(orden), [orden]);

  const total = Number(orden?.precioFinal || orden?.precioAprobado || orden?.precioSugerido || 0);
  const montoYaPagado = Number(orden?.montoPagado || 0);
  const pendiente = Math.max(0, total - montoYaPagado);

  const handleClose = () => {
    setSaving(false);
    onClose();
  };

  const calcularEstadoFromTotal = (totalPagado: number, totalOrden: number): EstadoPagoOrden => {
    if (totalOrden > 0 && totalPagado >= totalOrden) return 'completo';
    if (totalPagado > 0) return 'parcial';
    return 'pendiente';
  };

  const handleGuardar = async () => {
    if (!orden) return;
    const m = Number(monto);
    if (!m || m <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (metodo === 'transferencia' && !bancoId) {
      toast.error('Selecciona el banco destino');
      return;
    }

    setSaving(true);
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      // SPRINT-114: usar auth.uid en vez de userProfile.id para que el campo
      // descriptivo `pago.registradoPorId` sea consistente con la convención
      // auth.uid del resto del esquema (gotcha CLAUDE.md "userProfile.id NO
      // siempre es auth.uid").
      const usuarioId = currentUser?.uid || '';
      const ahora = new Date();
      const ahoraTimestamp = Timestamp.fromDate(ahora);

      // Generamos el pagoId UNA sola vez, antes de la transacción.
      // Si Firestore reintenta la transacción internamente o el usuario
      // hace doble-click con lag de red, el mismo pagoId previene duplicados.
      const pagoId = genId();

      // Construir el pago en memoria (sin serializar la fecha aún —
      // dependemos de la transacción para confirmar que se persiste).
      const pago: PagoOrden = {
        id: pagoId,
        metodo,
        monto: m,
        fecha: ahora,
        registradoPorId: usuarioId,
        registradoPorNombre: usuario,
      };

      if (metodo === 'efectivo') {
        // Auto-asigna al técnico asignado
        if (orden.tecnicoId) pago.recibidoPorId = orden.tecnicoId;
        if (orden.tecnicoNombre) pago.recibidoPorNombre = orden.tecnicoNombre;
      }
      if (metodo === 'transferencia' || metodo === 'tarjeta') {
        const banco = bancos.find(b => b.id === bancoId);
        if (banco) {
          pago.bancoId = banco.id;
          pago.bancoNombre = banco.nombre;
        }
        if (referencia.trim()) pago.referencia = referencia.trim();
      }
      if (notas.trim()) pago.notas = notas.trim();

      // SPRINT-PAGOS-CONFIRMA-MARIA fase A (2026-05-21): los pagos nuevos
      // nacen con verificado=false EXPLÍCITO (no undefined). Esto permite
      // que ProcesarFacturacionModal bloquee la emisión del conduce hasta
      // que María/admin confirme. Pagos legacy (pre-SPRINT-151) tienen
      // verificado=undefined y NO se bloquean (se asume verificación
      // implícita por la práctica anterior — la spec del sprint cubre
      // este caso de retrocompat).
      // Stripping undefined antes del write (convención del repo).
      const pagoSerializado: Record<string, unknown> = {
        id: pago.id,
        metodo: pago.metodo,
        monto: pago.monto,
        fecha: ahoraTimestamp,
        registradoPorId: pago.registradoPorId,
        registradoPorNombre: pago.registradoPorNombre,
        verificado: false,
      };
      if (pago.recibidoPorId !== undefined) pagoSerializado.recibidoPorId = pago.recibidoPorId;
      if (pago.recibidoPorNombre !== undefined) pagoSerializado.recibidoPorNombre = pago.recibidoPorNombre;
      if (pago.bancoId !== undefined) pagoSerializado.bancoId = pago.bancoId;
      if (pago.bancoNombre !== undefined) pagoSerializado.bancoNombre = pago.bancoNombre;
      if (pago.referencia !== undefined) pagoSerializado.referencia = pago.referencia;
      if (pago.notas !== undefined) pagoSerializado.notas = pago.notas;

      const ordenRef = doc(db, 'ordenes_servicio', orden.id);

      // Transacción: read → check idempotencia → compute → write.
      // Esto cierra la race condition entre 2 operarias registrando pagos
      // simultáneamente sobre la misma orden (last-write-wins en `pagos[]`).
      const resultado = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ordenRef);
        if (!snap.exists()) {
          throw new Error('La orden ya no existe');
        }
        const data = snap.data() as Record<string, unknown>;
        const pagosActuales: Array<Record<string, unknown>> = Array.isArray(data.pagos)
          ? (data.pagos as Array<Record<string, unknown>>)
          : [];

        // Idempotencia: si Firestore reintenta el callback de la transacción,
        // o si el botón se clickeó 2 veces y el segundo click llega después
        // de que el primero ya escribió, este check evita registrar duplicados.
        const yaExiste = pagosActuales.some(p => p && p.id === pagoId);
        if (yaExiste) {
          return { duplicado: true as const };
        }

        const pagosNuevos = [...pagosActuales, pagoSerializado];
        const totalOrdenActual = Number(
          data.precioFinal ?? data.precioAprobado ?? data.precioSugerido ?? 0,
        );
        // Recalculamos `montoPagado` desde la SUMA real de pagosNuevos, no
        // sumando el monto del input al state local (que podría estar stale).
        const nuevoMontoPagado = pagosNuevos.reduce(
          (acc, p) => acc + (Number(p.monto) || 0),
          0,
        );
        const nuevoEstadoPago = calcularEstadoFromTotal(nuevoMontoPagado, totalOrdenActual);
        const montoPagadoPrevio = pagosActuales.reduce(
          (acc, p) => acc + (Number(p.monto) || 0),
          0,
        );

        const registro = crearRegistroAuditoria(
          usuario,
          'editar',
          `Pago registrado — ${metodo} ${formatearMonto(m)}${
            pago.bancoNombre ? ` a ${pago.bancoNombre}` : ''
          }`,
          'pagos',
          formatearMonto(montoPagadoPrevio),
          formatearMonto(nuevoMontoPagado),
        );

        const updates: Record<string, unknown> = {
          pagos: pagosNuevos,
          montoPagado: nuevoMontoPagado,
          estadoPago: nuevoEstadoPago,
          auditoria: arrayUnion(registro),
          updatedAt: Timestamp.now(),
        };
        // Strip undefined defensivamente (el objeto está armado a mano,
        // pero respetamos la convención del repo).
        const updatesLimpios = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined),
        );

        tx.update(ordenRef, updatesLimpios);
        return { duplicado: false as const, nuevoMontoPagado };
      });

      if (resultado.duplicado) {
        // El pago ya estaba registrado — no avisamos al usuario como error,
        // simplemente cerramos el modal porque su intención ya está cumplida.
        toast.success('Pago registrado');
      } else {
        toast.success('Pago registrado');

        // SPRINT-174: emitir notif `pago_registrado` a admins/coords
        // (autoexclusión del registrador). Solo cuando el pago realmente se
        // creó (NO duplicado). Patrón canónico SPRINT-169 (`5823955`):
        // try/catch independiente por destinatario, `p.uid` siempre (P-007).
        // No bloquea el flujo si falla — el pago ya quedó persistido en la
        // transacción anterior.
        try {
          const qStaff = query(
            collection(db, 'personal'),
            where('activo', '==', true),
            where('rol', 'in', ['administrador', 'coordinadora']),
          );
          const snapStaff = await getDocs(qStaff);
          const destinatariosStaff = snapStaff.docs
            .map(d => ({ id: d.id, ...d.data() } as Personal))
            .filter(p => !!p.uid && p.uid !== currentUser?.uid);
          const totalAcum = resultado.nuevoMontoPagado ?? 0;
          const totalOrden = total;
          const restante = Math.max(0, totalOrden - totalAcum);
          const detallePago = `${metodo} ${formatearMonto(m)}${
            pago.bancoNombre ? ` (${pago.bancoNombre})` : ''
          }`;
          const mensaje = `Pago registrado: ${detallePago}. Orden ${orden.numero || ''} — ${orden.clienteNombre}. Acumulado: ${formatearMonto(totalAcum)}${
            totalOrden > 0 ? ` / ${formatearMonto(totalOrden)}` : ''
          }${restante > 0 ? `. Restante: ${formatearMonto(restante)}` : '.'}`;
          for (const destino of destinatariosStaff) {
            try {
              await crearNotificacion({
                userId: destino.uid!,
                destinatarioNombre: destino.nombre,
                tipo: 'pago_registrado',
                titulo: `Pago registrado · ${orden.numero || 'orden'}`,
                mensaje,
                ordenId: orden.id,
                ordenNumero: orden.numero,
              });
            } catch (err) {
              console.error('[SPRINT-174] pago_registrado falló para', destino.uid, err);
            }
          }
        } catch (errStaff) {
          console.error('[SPRINT-174] pago_registrado fallo enumerando staff:', errStaff);
        }
      }
      onSaved?.();
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar el pago');
      setSaving(false);
    }
  };

  const handleEliminarPago = async (pago: PagoOrden) => {
    if (!orden) return;
    // SPRINT-PAGOS-CONFIRMA-MARIA fase A M2 (2026-05-21): la operaria NO
    // puede borrar un pago YA verificado por María/admin (verificado===true).
    // Esto evita que se subvierta la confirmación borrando el registro
    // original. Si el pago aún no está confirmado (verificado=false o
    // undefined), cualquiera con pagosRegistrar puede borrarlo (caso
    // típico: corrigió un monto mal tipeado).
    if (pago.verificado === true && !puede(userProfile, 'pagosVerificar')) {
      toast.error(
        'Este pago ya fue confirmado por la coordinadora / admin. Solo ellos pueden eliminarlo.',
      );
      return;
    }
    if (!confirm(`¿Eliminar este pago de ${formatearMonto(pago.monto)}?`)) return;
    // Capturamos el id UNA vez, antes de la transacción. Si Firestore reintenta
    // el callback internamente, el mismo id se usa en cada intento.
    const pagoIdAEliminar = pago.id;
    const montoEliminado = Number(pago.monto) || 0;
    const metodoEliminado = pago.metodo;
    const usuario = userProfile?.nombre || 'Sistema';
    const ordenRef = doc(db, 'ordenes_servicio', orden.id);

    try {
      // Transacción: read fresco → idempotencia → recálculo → write.
      // Cierra la misma race condition que C5 cerró en handleConfirmarPago:
      // si entre el último onSnapshot y el click otro usuario registró un pago,
      // el updateDoc plano sobrescribía el array `pagos[]` con la versión vieja.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ordenRef);
        if (!snap.exists()) {
          throw new Error('La orden ya no existe');
        }
        const data = snap.data() as Record<string, unknown>;
        const pagosActuales: Array<Record<string, unknown>> = Array.isArray(data.pagos)
          ? (data.pagos as Array<Record<string, unknown>>)
          : [];

        // Idempotencia: si el pago ya no está (otro tab lo eliminó, o reintento
        // tras éxito), no-op. No es error desde la perspectiva del usuario.
        if (!pagosActuales.some(p => p && p.id === pagoIdAEliminar)) {
          return { yaEliminado: true as const };
        }

        const pagosNuevos = pagosActuales.filter(p => p && p.id !== pagoIdAEliminar);
        const totalOrdenActual = Number(
          data.precioFinal ?? data.precioAprobado ?? data.precioSugerido ?? 0,
        );
        // Recalculamos desde el array filtrado del read FRESCO, no desde
        // pagosPrevios (state local potencialmente stale).
        const nuevoMontoPagado = pagosNuevos.reduce(
          (acc, p) => acc + (Number(p.monto) || 0),
          0,
        );
        const nuevoEstadoPago = calcularEstadoFromTotal(nuevoMontoPagado, totalOrdenActual);
        const montoPagadoPrevio = pagosActuales.reduce(
          (acc, p) => acc + (Number(p.monto) || 0),
          0,
        );

        const registro = crearRegistroAuditoria(
          usuario,
          'editar',
          `Eliminó pago de ${formatearMonto(montoEliminado)} (${metodoEliminado})`,
          'pagos',
          formatearMonto(montoPagadoPrevio),
          formatearMonto(nuevoMontoPagado),
        );

        const updates: Record<string, unknown> = {
          pagos: pagosNuevos,
          montoPagado: nuevoMontoPagado,
          estadoPago: nuevoEstadoPago,
          auditoria: arrayUnion(registro),
          updatedAt: Timestamp.now(),
        };
        // Strip undefined defensivamente (convención del repo).
        const updatesLimpios = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined),
        );

        tx.update(ordenRef, updatesLimpios);
        return { yaEliminado: false as const };
      });

      toast.success('Pago eliminado');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar el pago');
    }
  };

  const hayBancos = bancos.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={orden ? `Registrar pago — ${orden.numero || ''}` : 'Registrar pago'}
      size="md"
    >
      {orden && (
        <div className="space-y-5">
          {/* Resumen */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[11px] text-blue-700 uppercase tracking-wide">Total orden</div>
              <div className="text-base font-semibold text-[#0f3460]">{formatearMonto(total)}</div>
            </div>
            <div>
              <div className="text-[11px] text-blue-700 uppercase tracking-wide">Pagado</div>
              <div className="text-base font-semibold text-green-600">{formatearMonto(montoYaPagado)}</div>
            </div>
            <div>
              <div className="text-[11px] text-blue-700 uppercase tracking-wide">Pendiente</div>
              <div className="text-base font-semibold text-orange-600">{formatearMonto(pendiente)}</div>
            </div>
          </div>

          {/* Pagos previos */}
          {pagosPrevios.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Pagos registrados
              </div>
              <div className="space-y-2">
                {pagosPrevios.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {p.metodo === 'efectivo' && <Banknote size={16} className="text-green-600" />}
                      {p.metodo === 'transferencia' && <ArrowRightLeft size={16} className="text-blue-600" />}
                      {p.metodo === 'tarjeta' && <CreditCard size={16} className="text-purple-600" />}
                      <div>
                        <div className="font-medium text-gray-900">
                          {formatearMonto(p.monto)} · <span className="capitalize">{p.metodo}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {p.metodo === 'efectivo' && p.recibidoPorNombre && `Recibido por ${p.recibidoPorNombre}`}
                          {(p.metodo === 'transferencia' || p.metodo === 'tarjeta') && p.bancoNombre && `→ ${p.bancoNombre}`}
                          {p.referencia && ` · Ref ${p.referencia}`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleEliminarPago(p)}
                      title="Eliminar pago"
                      className="p-1.5 hover:bg-red-50 rounded text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nuevo pago */}
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Registrar nuevo pago
            </div>

            {/* Método */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { v: 'efectivo', label: 'Efectivo', icon: Banknote },
                { v: 'transferencia', label: 'Transferencia', icon: ArrowRightLeft },
                { v: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
              ] as const).map(op => (
                <button
                  key={op.v}
                  type="button"
                  onClick={() => setMetodo(op.v)}
                  className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    metodo === op.v
                      ? 'bg-[#0f3460] text-white border-[#0f3460]'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <op.icon size={14} />
                  {op.label}
                </button>
              ))}
            </div>

            {/* Monto */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Monto *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">RD$</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0"
                  className="w-full pl-12 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
              {total > 0 && Number(monto) > pendiente && pendiente > 0 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Este monto excede el pendiente ({formatearMonto(pendiente)}). Se aceptará igual.
                </p>
              )}
            </div>

            {/* Receptor (efectivo) */}
            {metodo === 'efectivo' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-900 mb-3">
                Lo recibe <strong>{orden.tecnicoNombre || '(técnico asignado)'}</strong>
                {!orden.tecnicoNombre && ' — asigna un técnico antes de registrar efectivo.'}
              </div>
            )}

            {/* Banco (transferencia / tarjeta) */}
            {(metodo === 'transferencia' || metodo === 'tarjeta') && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Banco destino *</label>
                {hayBancos ? (
                  <>
                    <select
                      value={bancoId}
                      onChange={e => setBancoId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    >
                      <option value="">— Selecciona un banco —</option>
                      {bancos.map(b => (
                        <option key={b.id} value={b.id}>{b.nombre}</option>
                      ))}
                    </select>

                    {/* Datos del banco seleccionado + acciones */}
                    {(() => {
                      const banco = bancos.find(b => b.id === bancoId);
                      if (!banco || !banco.numeroCuenta) return null;
                      const mensaje = mensajeDatosCuentaBancaria({
                        clienteNombre: orden?.clienteNombre,
                        banco: banco.nombre,
                        numeroCuenta: banco.numeroCuenta,
                        tipoCuenta: banco.tipoCuenta,
                        titular: banco.titular,
                        rnc: banco.rnc,
                        cedula: banco.cedula,
                        emailComprobante: banco.emailComprobante,
                        monto: Number(monto) || undefined,
                      });
                      const tel = orden?.clienteTelefono || '';
                      const wa = tel ? whatsappUrl(tel, mensaje) : '';
                      const handleCopiar = async () => {
                        try {
                          await navigator.clipboard.writeText(mensaje);
                          toast.success('Mensaje copiado');
                        } catch {
                          toast.error('No se pudo copiar');
                        }
                      };
                      return (
                        <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-gray-800 space-y-1">
                          <div className="font-semibold text-[#0f3460]">
                            {banco.nombre}{banco.tipoCuenta ? ` — ${banco.tipoCuenta}` : ''}
                          </div>
                          <div className="font-mono text-sm">{banco.numeroCuenta}</div>
                          {banco.titular && <div>A nombre de <strong>{banco.titular}</strong></div>}
                          {banco.rnc && <div>RNC {banco.rnc}</div>}
                          {banco.cedula && <div>Cédula {banco.cedula}</div>}
                          <div className="flex flex-wrap gap-2 pt-2">
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-semibold"
                              >
                                <WhatsAppIcon filled={false} className="text-white" size={12} /> Compartir por WhatsApp
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={handleCopiar}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-xs font-semibold"
                            >
                              <Copy size={12} /> Copiar mensaje
                            </button>
                          </div>
                          {!tel && (
                            <p className="text-[11px] text-amber-700 mt-1">
                              El cliente no tiene teléfono registrado. Usa "Copiar mensaje".
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    No hay bancos configurados. Un administrador debe agregarlos desde <strong>Bancos</strong>.
                  </div>
                )}
              </div>
            )}

            {/* Referencia */}
            {(metodo === 'transferencia' || metodo === 'tarjeta') && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Referencia / Número de transacción <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                  placeholder="Ej: 123456789"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                />
              </div>
            )}

            {/* Notas */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notas <span className="text-gray-400">(opcional)</span>
              </label>
              <textarea
                rows={2}
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Ej: pagó parcial, resto lunes"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={saving || !monto || Number(monto) <= 0 || (metodo === 'transferencia' && !bancoId)}
              className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar pago'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
