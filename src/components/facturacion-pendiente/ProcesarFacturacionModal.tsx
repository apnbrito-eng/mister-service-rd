import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  addDoc,
  Timestamp,
  arrayUnion,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  OrdenServicio,
  Cotizacion,
  ItemCotizacion,
  Usuario,
  PagoOrden,
  Factura,
  GarantiaInfo,
  ServicioPrecio,
  PiezaInventario,
  Personal,
  Cliente,
} from '../../types';
import { useApp } from '../../context/AppContext';
import { crearRegistroAuditoria, formatMonedaPrecisa, parseCliente } from '../../utils';
import { abrirWhatsApp, mensajeConduceGarantia } from '../../utils/whatsapp';
import { siguienteNumeroFactura } from '../../services/contadores.service';
import { crearNotificacion } from '../../services/notificaciones.service';
import {
  registrarComisionPorFactura,
  registrarComisionesPorItems,
  desglosarTotalConITBIS,
  calcularCostoPiezasDeItems,
} from '../../utils/comisiones';
import { obtenerConfigFiscal } from '../../services/configFiscal.service';
import { esAdminOCoord } from '../../utils/permisos';
import Modal from '../Modal';
import FacturaItemsEditor from '../facturas/FacturaItemsEditor';
import {
  Banknote, ArrowRightLeft, CreditCard, Check, Clock, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

/** TTL del borrador en localStorage. 24 horas. */
const BORRADOR_TTL_MS = 24 * 60 * 60 * 1000;

/** Prefijo de la key — el sufijo es `${ordenId}` para no colisionar entre órdenes. */
const BORRADOR_KEY_PREFIX = 'mister_borrador_facturacion_v1_';

interface BorradorFacturacion {
  ordenId: string;
  items: ItemCotizacion[];
  tiempoGarantiaDias: number | null;
  paso: 1 | 2;
  // SPRINT-151: nota del conduce + estado del pago en construcción.
  // Opcionales para retrocompat con borradores pre-SPRINT-151 (default vacíos).
  notaConduce?: string;
  pagoNuevo?: {
    metodo: 'efectivo' | 'transferencia' | 'tarjeta';
    monto: number;
    bancoNombre?: string;
    recibidoPorNombre?: string;
    referencia?: string;
    verificado?: boolean;
  };
  guardadoEn: number;
}

/* ─────────────────────────────────────────── */
/* Modal de 2 pasos: Aprobar contenido + Confirmar pagos + generar factura */
/* ─────────────────────────────────────────── */
interface ModalProps {
  orden: OrdenServicio | null;
  userProfile: Usuario | null;
  /** Catálogos cargados por el padre (FacturacionPendiente.tsx) — patrón "padre gordo". */
  catalogoServicios: ServicioPrecio[];
  catalogoPiezas: PiezaInventario[];
  tecnicos: Personal[];
  /** SPRINT-151: personal activo completo para notificación admin/coord al emitir. */
  personalActivo: Personal[];
  onClose: () => void;
}

/** Presets de tiempo de garantía. El selector exige que se elija uno
 *  antes de poder emitir el conduce. */
const GARANTIA_PRESETS: Array<{ dias: number; label: string }> = [
  { dias: 30, label: '30 días' },
  { dias: 60, label: '60 días' },
  { dias: 90, label: '90 días' },
  { dias: 180, label: '6 meses' },
  { dias: 365, label: '1 año' },
];

/**
 * Modal de procesamiento de Conduce de Garantía desde Bandeja Pendiente.
 *
 * C4b — features SIBS sobre el split:
 *  - `getDoc` puntual del cliente para resolver `cliente.tipo` (default 'particular').
 *  - Reusa `FacturaItemsEditor` (catálogos + técnicos + modal con prioritarios).
 *  - Default por línea = `orden.tecnicoId` cuando se sintetiza un item.
 *  - Render N=1 vs N>1 con denormalización post-helper (regla CLAUDE.md línea 89).
 *  - `clienteTipoEnEmision` snapshot defensivo.
 *  - Audit log override modalidad (best-effort).
 *  - `solicitanteUid` unificado a `currentUser.uid` (auth.uid) en SPRINT-114.
 *  - Borrador localStorage con TTL 24h.
 *  - Quick-win 11: confirm si admin emite con líneas sin técnico cuando la orden
 *    tiene técnico asignado.
 */
export default function ProcesarFacturacionModal({
  orden,
  userProfile,
  catalogoServicios,
  catalogoPiezas,
  tecnicos,
  personalActivo,
  onClose,
}: ModalProps) {
  const { currentUser } = useApp();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [items, setItems] = useState<ItemCotizacion[]>([]);
  const [cargandoCotizacion, setCargandoCotizacion] = useState(false);
  const [generando, setGenerando] = useState(false);
  // SPRINT-154: default 60 días preseleccionado (caso más común).
  // SPRINT-160: si la orden trae `periodoGarantiaDias` desde el wizard del técnico,
  // el effect que monta orden lo aplica como default (ver ~línea 187/194). El state
  // inicial mantiene 60 porque el componente puede montarse sin orden (caso null).
  // El tipo sigue siendo `number | null` para retrocompat con borradores viejos
  // (pre-SPRINT-154) que pudieron guardar null, y para preservar la red
  // defensiva del gate del botón "Generar" (línea ~1224) que aún chequea
  // `=== null` para evitar emisión sin garantía si algo lo limpia.
  const [tiempoGarantiaDias, setTiempoGarantiaDias] = useState<number | null>(60);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  // SPRINT-151: nota para el conduce (max 500 chars, opcional) + pago en construcción.
  const [notaConduce, setNotaConduce] = useState<string>('');
  const [pagoMetodo, setPagoMetodo] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [pagoMonto, setPagoMonto] = useState<number>(0);
  const [pagoBanco, setPagoBanco] = useState<string>('');
  const [pagoRecibidoPor, setPagoRecibidoPor] = useState<string>('');
  const [pagoReferencia, setPagoReferencia] = useState<string>('');
  const [pagoVerificado, setPagoVerificado] = useState<boolean>(false);

  // Borrador localStorage (TTL 24h)
  const [borradorEncontrado, setBorradorEncontrado] = useState<BorradorFacturacion | null>(null);
  // Flag para evitar pisar el borrador en el primer render con el setItems inicial.
  const yaCargoInicialRef = useRef(false);
  // Debounce para escrituras a localStorage.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const puedeConfigurarGarantia = esAdminOCoord(userProfile);
  const puedeOverrideModalidad = esAdminOCoord(userProfile);

  // ─── Cargar cliente al abrir el modal (getDoc puntual) ───
  useEffect(() => {
    if (!orden) {
      setCliente(null);
      return;
    }
    let cancelado = false;
    const cargarCliente = async () => {
      try {
        if (!orden.clienteId) {
          if (!cancelado) setCliente(null);
          return;
        }
        const snap = await getDoc(doc(db, 'clientes', orden.clienteId));
        if (cancelado) return;
        if (snap.exists()) {
          setCliente(parseCliente(snap.id, snap.data() as Record<string, unknown>));
        } else {
          setCliente(null);
        }
      } catch (err) {
        console.warn('[procesar-facturacion] no se pudo leer cliente:', err);
        if (!cancelado) setCliente(null);
      }
    };
    cargarCliente();
    return () => { cancelado = true; };
  }, [orden]);

  // ─── Cargar items de la cotización vinculada (o crear uno por defecto) ───
  // También chequea si hay un borrador válido en localStorage (TTL 24h).
  useEffect(() => {
    if (!orden) {
      setItems([]);
      setPaso(1);
      // SPRINT-154: default 60 días al cerrar/cambiar orden (coherente con state inicial).
      setTiempoGarantiaDias(60);
      setBorradorEncontrado(null);
      yaCargoInicialRef.current = false;
      return;
    }
    setPaso(1);
    // SPRINT-154 + SPRINT-160: si la orden trae `periodoGarantiaDias` del wizard del
    // técnico (cierre), usarlo como default. Si no, fallback a 60. La lógica de
    // submit (handleGenerar) ya respetaba `orden.periodoGarantiaDias` correctamente;
    // este cambio sincroniza la UI con el valor real que se va a emitir.
    setTiempoGarantiaDias(orden.periodoGarantiaDias ?? 60);
    yaCargoInicialRef.current = false;

    // Buscar borrador antes de pisar items
    let borrador: BorradorFacturacion | null = null;
    try {
      const raw = localStorage.getItem(`${BORRADOR_KEY_PREFIX}${orden.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as BorradorFacturacion;
        if (
          parsed &&
          parsed.ordenId === orden.id &&
          typeof parsed.guardadoEn === 'number' &&
          Date.now() - parsed.guardadoEn < BORRADOR_TTL_MS &&
          Array.isArray(parsed.items)
        ) {
          borrador = parsed;
        } else {
          // Expiró o malformed — limpiar
          localStorage.removeItem(`${BORRADOR_KEY_PREFIX}${orden.id}`);
        }
      }
    } catch (err) {
      console.warn('[procesar-facturacion] no se pudo leer borrador:', err);
    }
    setBorradorEncontrado(borrador);

    const cargar = async () => {
      setCargandoCotizacion(true);
      try {
        if (orden.cotizacionId) {
          const snap = await getDoc(doc(db, 'cotizaciones', orden.cotizacionId));
          if (snap.exists()) {
            const cot = snap.data() as Cotizacion;
            const its = (cot.items || []).map(it => aplicarTecnicoDefault(it, orden));
            setItems(its.length > 0 ? its : [defaultItem(orden)]);
            setCargandoCotizacion(false);
            yaCargoInicialRef.current = true;
            return;
          }
        }
        setItems([defaultItem(orden)]);
        yaCargoInicialRef.current = true;
      } finally {
        setCargandoCotizacion(false);
      }
    };
    cargar();
  }, [orden]);

  // ─── Persistir borrador a localStorage con debounce ───
  // Guard "ya restauré" (N2 cleanup post-Conduces SIBS): mientras
  // `borradorEncontrado !== null` significa que mostramos el banner y el
  // usuario todavía no decidió Restaurar/Descartar. NO escribimos en
  // localStorage en ese intervalo: si lo hacemos, el setItems del cargar()
  // (que setea items desde la cotización) pisa el borrador antes de que el
  // usuario tenga chance de recuperarlo. Una vez clickea Restaurar o
  // Descartar, `borradorEncontrado` pasa a null y el effect retoma el save.
  useEffect(() => {
    if (!orden || !yaCargoInicialRef.current) return;
    if (borradorEncontrado !== null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const payload: BorradorFacturacion = {
          ordenId: orden.id,
          items,
          tiempoGarantiaDias,
          paso,
          // SPRINT-151: persistir nota + estado del pago en construcción.
          notaConduce,
          pagoNuevo: {
            metodo: pagoMetodo,
            monto: pagoMonto,
            bancoNombre: pagoBanco,
            recibidoPorNombre: pagoRecibidoPor,
            referencia: pagoReferencia,
            verificado: pagoVerificado,
          },
          guardadoEn: Date.now(),
        };
        localStorage.setItem(`${BORRADOR_KEY_PREFIX}${orden.id}`, JSON.stringify(payload));
      } catch (err) {
        console.warn('[procesar-facturacion] no se pudo guardar borrador:', err);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [orden, items, tiempoGarantiaDias, paso, borradorEncontrado,
    notaConduce, pagoMetodo, pagoMonto, pagoBanco, pagoRecibidoPor, pagoReferencia, pagoVerificado]);

  const restaurarBorrador = () => {
    if (!borradorEncontrado) return;
    setItems(borradorEncontrado.items);
    setTiempoGarantiaDias(borradorEncontrado.tiempoGarantiaDias);
    setPaso(borradorEncontrado.paso);
    // SPRINT-151: restaurar nota + pago si existían en el borrador (retrocompat).
    if (typeof borradorEncontrado.notaConduce === 'string') {
      setNotaConduce(borradorEncontrado.notaConduce);
    }
    if (borradorEncontrado.pagoNuevo) {
      const pn = borradorEncontrado.pagoNuevo;
      setPagoMetodo(pn.metodo);
      setPagoMonto(Number(pn.monto || 0));
      setPagoBanco(pn.bancoNombre || '');
      setPagoRecibidoPor(pn.recibidoPorNombre || '');
      setPagoReferencia(pn.referencia || '');
      setPagoVerificado(!!pn.verificado);
    }
    setBorradorEncontrado(null);
    toast.success('Borrador restaurado');
  };

  const descartarBorrador = () => {
    if (!orden) return;
    try {
      localStorage.removeItem(`${BORRADOR_KEY_PREFIX}${orden.id}`);
    } catch (err) {
      console.warn('[procesar-facturacion] no se pudo eliminar borrador:', err);
    }
    setBorradorEncontrado(null);
  };

  const limpiarBorrador = () => {
    if (!orden) return;
    try {
      localStorage.removeItem(`${BORRADOR_KEY_PREFIX}${orden.id}`);
    } catch (err) {
      console.warn('[procesar-facturacion] no se pudo limpiar borrador:', err);
    }
  };

  const totalItems = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio || 0), 0),
    [items],
  );

  const pagosPrevios = useMemo<PagoOrden[]>(() => {
    return Array.isArray(orden?.pagos) ? (orden!.pagos as PagoOrden[]) : [];
  }, [orden]);
  const totalPagado = useMemo(
    () => pagosPrevios.reduce((acc, p) => acc + Number(p.monto || 0), 0),
    [pagosPrevios],
  );

  // SPRINT-151: default del monto del pago nuevo = pendiente actual (totalItems - totalPagado).
  // Se setea cuando el usuario llega a paso 2 si pagoMonto sigue en 0 y no hay borrador
  // que lo pisó. La operaria puede sobrescribir manualmente después.
  useEffect(() => {
    if (paso !== 2) return;
    if (pagoMonto > 0) return; // ya se setteó (por borrador o manual)
    const pendiente = Math.max(0, totalItems - totalPagado);
    if (pendiente > 0) setPagoMonto(pendiente);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, totalItems, totalPagado]);

  // Técnicos prioritarios para el dropdown del modal de detalles.
  const tecnicosPrioritarios = useMemo<string[]>(() => {
    return orden?.tecnicoId ? [orden.tecnicoId] : [];
  }, [orden]);

  const handleGenerar = async () => {
    if (!orden) return;
    if (items.length === 0) {
      toast.error('Agrega al menos un item');
      return;
    }
    if (items.some(it => !it.descripcion.trim())) {
      toast.error('Todos los items necesitan descripción');
      return;
    }
    if (puedeConfigurarGarantia && !tiempoGarantiaDias) {
      toast.error('Selecciona un tiempo de garantía antes de emitir el conduce');
      return;
    }
    // SPRINT-151: validación de nota (max 500 chars).
    if (notaConduce.length > 500) {
      toast.error('La nota del conduce no puede superar 500 caracteres.');
      return;
    }
    // SPRINT-151: validación del pago nuevo.
    const montoPagoNuevo = Math.max(0, Number(pagoMonto) || 0);
    if (montoPagoNuevo > 0) {
      // Si hay pago en construcción, "Pago verificado" debe estar tildado.
      if (!pagoVerificado) {
        toast.error('Tildá "Pago verificado" antes de emitir, o dejá el monto en 0.');
        return;
      }
      // El total cobrado (pagos previos + pago nuevo) no puede superar el total del conduce.
      if (totalPagado + montoPagoNuevo > totalItems) {
        toast.error('Total cobrado supera el total del conduce. Ajustá el monto.');
        return;
      }
      // Si es transferencia/tarjeta, requerir banco; si efectivo, recibidoPor (opcional pero útil).
      if ((pagoMetodo === 'transferencia' || pagoMetodo === 'tarjeta') && !pagoBanco.trim()) {
        toast.error('Seleccioná o ingresá el banco del pago.');
        return;
      }
    }

    // Quick-win 11: si la orden tiene técnico asignado y hay líneas sin técnico,
    // pedir confirmación antes de emitir.
    if (orden.tecnicoId) {
      const sinTecnico = items.filter(it => !it.tecnicoId).length;
      if (sinTecnico > 0) {
        const ok = window.confirm(
          `Hay ${sinTecnico} línea${sinTecnico === 1 ? '' : 's'} sin técnico. Esa${sinTecnico === 1 ? '' : 's'} línea${sinTecnico === 1 ? '' : 's'} NO generará${sinTecnico === 1 ? '' : 'n'} comisión. ¿Confirmar emisión?`,
        );
        if (!ok) return;
      }
    }

    setGenerando(true);
    try {
      const numero = await siguienteNumeroFactura();
      const ahora = Timestamp.now();
      const usuario = userProfile?.nombre || 'Sistema';
      // SPRINT-114: usar auth.uid en vez de userProfile.id para que los
      // campos descriptivos `emitidaPorId`, `facturadaPorId` y
      // `solicitanteUid` sean consistentes con la convención auth.uid del
      // resto del esquema (gotcha CLAUDE.md "userProfile.id NO siempre es
      // auth.uid"). Estos campos NO son gateados por rule hoy, pero el
      // cambio es defensivo: si en el futuro se agrega rule de auditoría,
      // el bug `permission-denied` silencioso se previene.
      const usuarioId = currentUser?.uid || '';

      // Determinar método de pago principal (el del último pago, o el más usado)
      const ultimoPago = pagosPrevios[pagosPrevios.length - 1];
      const metodoPagoPrincipal = ultimoPago?.metodo;
      const bancoPrincipal = ultimoPago?.bancoNombre;

      // Snapshot defensivo del tipo de cliente al momento de emitir.
      // Si el cliente no se pudo leer o no tenía tipo definido, default 'particular'.
      const clienteTipoEnEmision: 'particular' | 'b2b' =
        cliente?.tipo === 'b2b' ? 'b2b' : 'particular';

      // Construir doc de factura
      const itemsLimpios: Record<string, unknown>[] = items.map(it => {
        const obj: Record<string, unknown> = {
          descripcion: it.descripcion.trim(),
          cantidad: Number(it.cantidad) || 0,
          precio: Number(it.precio) || 0,
        };
        if (it.tipoItem) obj.tipoItem = it.tipoItem;
        if (it.servicioPrecioId) obj.servicioPrecioId = it.servicioPrecioId;
        if (it.piezaInventarioId) obj.piezaInventarioId = it.piezaInventarioId;
        if (typeof it.costoCompra === 'number') obj.costoCompra = it.costoCompra;
        if (it.tecnicoId) obj.tecnicoId = it.tecnicoId;
        if (it.tecnicoNombre) obj.tecnicoNombre = it.tecnicoNombre;
        if (it.precioModalidad) obj.precioModalidad = it.precioModalidad;
        return obj;
      });

      // Leer tasa ITBIS actual (configurable)
      const configFiscal = await obtenerConfigFiscal();
      const itbisPct = configFiscal.itbisPorcentaje;

      // Desglose fiscal (el total cobrado ya incluye ITBIS → desglosar)
      const desglose = desglosarTotalConITBIS(totalItems, itbisPct);
      const costoPiezas = calcularCostoPiezasDeItems(itemsLimpios as unknown as ItemCotizacion[]);
      const gananciaNeta = Math.max(0, Math.round((desglose.subtotal - costoPiezas) * 100) / 100);

      // Construir bloque de garantía si la coord/admin configuró tiempo
      let garantia: GarantiaInfo | null = null;
      if (puedeConfigurarGarantia && tiempoGarantiaDias) {
        const inicioMs = Date.now();
        const finMs = inicioMs + tiempoGarantiaDias * 86400 * 1000;
        const token = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : `tok_${inicioMs}_${Math.random().toString(36).slice(2)}`;
        garantia = {
          tiempoDias: tiempoGarantiaDias,
          inicioFecha: Timestamp.fromMillis(inicioMs),
          finFecha: Timestamp.fromMillis(finMs),
          token,
          estado: 'vigente',
        };
      }

      // Snapshot de orden / equipo para que el endpoint público pueda leer
      // todo desde el doc factura sin tocar otras colecciones.
      const fechaServicio: Timestamp | undefined = (() => {
        const fc = orden.cierreServicio?.fechaCierre;
        if (fc instanceof Date) return Timestamp.fromDate(fc);
        if (orden.fechaCita instanceof Date) return Timestamp.fromDate(orden.fechaCita);
        return undefined;
      })();

      const facturaPayload: Record<string, unknown> = {
        numero,
        clienteId: orden.clienteId,
        clienteNombre: orden.clienteNombre,
        ordenId: orden.id,
        ordenNumero: orden.numero,
        items: itemsLimpios,
        total: totalItems,
        subtotal: desglose.subtotal,
        itbisPorcentaje: desglose.itbisPorcentaje,
        itbisMonto: desglose.itbis,
        costoPiezas,
        gananciaNeta,
        // SPRINT-151: incluir el pago nuevo en el cálculo de estado/fechaPago.
        // Si la operaria cobró el saldo completo en este modal, la factura
        // sale directamente como 'pagada' (no como 'emitida').
        estado: (totalPagado + montoPagoNuevo) >= totalItems ? 'pagada' : 'emitida',
        fechaEmision: ahora,
        createdAt: ahora,
        emitidaPorId: usuarioId,
        emitidaPorNombre: usuario,
        // Origen: distingue conduces emitidos automáticamente al cerrar
        // una orden de los conduces manuales creados desde /admin/facturas.
        origen: 'post-cierre' as const,
        // Snapshot defensivo del tipo del cliente al momento de emitir.
        clienteTipoEnEmision,
      };
      if (metodoPagoPrincipal) facturaPayload.metodoPago = metodoPagoPrincipal;
      if (bancoPrincipal) facturaPayload.bancoDestino = bancoPrincipal;
      if (orden.cotizacionId) facturaPayload.cotizacionId = orden.cotizacionId;
      // Denormalizar tipoCierre desde la orden — necesario para que
      // `obtenerCostoPiezasDeOrden` distinga la factura del chequeo previo
      // (CG, sin piezas) de la factura de la reparación (con piezas) en
      // órdenes reactivadas post-chequeo.
      if (orden.tipoCierre) facturaPayload.tipoCierre = orden.tipoCierre;
      else if (orden.soloChequeo) facturaPayload.tipoCierre = 'solo_chequeo';
      else facturaPayload.tipoCierre = 'reparacion_completa';
      // SPRINT-151: idem — fechaPago se setea si el cobro queda completo
      // (sumando el pago nuevo del modal a los previos).
      if ((totalPagado + montoPagoNuevo) >= totalItems) facturaPayload.fechaPago = ahora;
      // Denormalización para el endpoint público de garantía
      if (orden.clienteTelefono) facturaPayload.clienteTelefono = orden.clienteTelefono;
      if (orden.equipoTipo) facturaPayload.equipoTipo = orden.equipoTipo;
      if (orden.equipoMarca) facturaPayload.equipoMarca = orden.equipoMarca;
      if (orden.equipoModelo) facturaPayload.equipoModelo = orden.equipoModelo;
      if (orden.tecnicoId) facturaPayload.tecnicoId = orden.tecnicoId;
      if (orden.tecnicoNombre) facturaPayload.tecnicoNombre = orden.tecnicoNombre;
      if (fechaServicio) facturaPayload.fechaServicio = fechaServicio;
      if (garantia) facturaPayload.garantia = garantia;
      // SPRINT-151: nota del conduce (opcional, max 500 chars validados arriba).
      const notaTrim = notaConduce.trim();
      if (notaTrim) facturaPayload.notaConduce = notaTrim;

      // Quitar undefined recursivamente
      const facturaLimpia = Object.fromEntries(
        Object.entries(facturaPayload).filter(([, v]) => v !== undefined),
      );

      // SPRINT-155: handleGenerar envuelto en runTransaction para atomicidad
      // cross-collection (factura + denorm + orden). Patrón alineado con
      // marcarClienteEnviado (a38eb89) y marcarOrdenReactivada (800e0b4).
      //
      // Lo que vive DENTRO de la tx:
      //   - tx.get(ordenRef) — optimistic locking + idempotencia (facturada===true).
      //   - tx.set(facturaRef, facturaLimpia) — crea conduce CG-XXXXX.
      //   - tx.update(facturaRef, denormLimpio) — denormalización comisiones (si aplica).
      //   - tx.update(ordenRef, ordenUpdateLimpio) — facturada=true + arrayUnion(pagos).
      //
      // Lo que vive FUERA (PRE-tx):
      //   - siguienteNumeroFactura() — tiene runTransaction interno propio (anidación
      //     prohibida).
      //   - registrarComisionesPorItems / registrarComisionPorFactura — helpers
      //     externos que escriben a `comisiones`/`auditoria`. Si su tx ok pero la
      //     nuestra aborta, queda comisión huérfana. Riesgo aceptado: alternativas
      //     (meter helper dentro de tx; pre-validar todo) son más costosas que la
      //     probabilidad real de fallo entre escrituras consecutivas.
      //
      // Lo que vive FUERA (POST-tx, best-effort con try/catch):
      //   - addDoc audit `emitir_garantia` — fallo log warn, no aborta.
      //   - addDoc audit `override_modalidad_precio_factura` — idem.
      //   - addDoc audit `emitir_conduce_con_pago` — idem.
      //   - crearNotificacion loop — fallo log error (visibilidad SPRINT-153).

      // Pre-generar la ref de factura (sin escribir aún — la escritura ocurre
      // dentro del runTransaction más abajo).
      const facturaRef = doc(collection(db, 'facturas'));

      // ─── Comisiones: detectar N=1 vs N>1 y construir denormalización ───
      // Detección: si CUALQUIER item trae tecnicoId Y hay > 1 técnico distinto,
      // es N>1. Si todos los items con tecnicoId comparten el mismo (o nadie
      // trae) — flujo legacy N=1 vía `registrarComisionPorFactura`.
      const tecnicoIdsDistintos = Array.from(
        new Set(
          items
            .map(it => it.tecnicoId)
            .filter((id): id is string => !!id),
        ),
      );
      const algunoConTecnico = tecnicoIdsDistintos.length > 0;
      const esNMultiple = tecnicoIdsDistintos.length > 1;

      // SPRINT-155: los helpers escriben a `comisiones`/`auditoria` PRE-tx
      // (anidación prohibida). El payload de denormalización se captura acá
      // y se aplica dentro del runTransaction como tx.update(facturaRef, ...).
      let denormParaTx: Record<string, unknown> | null = null;
      try {
        if (esNMultiple) {
          // N>1: usar helper específico y denormalizar como agregado.
          const result = await registrarComisionesPorItems({
            orden,
            facturaId: facturaRef.id,
            facturaNumero: numero,
            totalFactura: totalItems,
            items: itemsLimpios as unknown as ItemCotizacion[],
            userProfile,
            itbisPorcentaje: itbisPct,
          });
          // CRÍTICO: denormalizar post-call (regla CLAUDE.md línea 89).
          // Audit fix C5: la guarda anterior `result.comisiones.length > 0`
          // saltaba la denormalización si todos los técnicos tenían 0% pero
          // hubo cleanup de huérfanas (preservadas/eliminadas). Eso dejaba
          // `comisionTecnicoMonto` con valor viejo aunque la realidad post-
          // recálculo es "sin comisiones nuevas". Ahora denormalizamos
          // siempre que haya actividad. SPRINT-155: la denorm entra a la tx,
          // así que si falla, toda la tx aborta (comportamiento más estricto
          // que el try/catch interno previo, que solo logueaba).
          const tuvoActividad =
            result.comisiones.length > 0 ||
            result.preservadasPorLiquidacion > 0 ||
            result.eliminadasHuerfanas > 0;
          if (tuvoActividad) {
            let denorm: Record<string, unknown> | null = null;
            if (result.comisiones.length === 1) {
              // Caso degenerado: N>1 detectado pero terminó en 1 comisión
              // válida (el otro técnico tenía 0% o no existía). Render legacy.
              denorm = {
                comisionTecnicoId: result.comisiones[0].tecnicoId,
                comisionTecnicoNombre: result.comisiones[0].tecnicoNombre,
                comisionTecnicoMonto: result.comisiones[0].monto,
                comisionTecnicoPorcentaje: result.comisiones[0].porcentaje,
                comisionRegistroId: result.comisiones[0].comisionId,
              };
            } else if (result.comisiones.length > 1) {
              // N>1 real: agregado.
              denorm = {
                comisionTecnicoId: '',
                comisionTecnicoNombre: 'N técnicos',
                comisionTecnicoMonto: result.totalAgregado,
                comisionTecnicoPorcentaje: 0,
              };
            } else {
              // Caso edge: tuvoActividad === true pero comisiones.length === 0.
              // Significa que TODAS las comisiones nuevas son 0% (técnicos sin
              // porcentaje) y el cleanup limpió/preservó huérfanas anteriores.
              // Decisión coordinator (audit C5): sobrescribir con shape "sin
              // comisión" para que la factura refleje el estado real post-
              // recálculo en lugar de mostrar el monto viejo de una emisión
              // anterior. La auditoría detallada queda en colección comisiones.
              console.warn(
                '[procesar-facturacion] tuvoActividad sin comisiones nuevas, denormalizando con shape vacío',
                {
                  facturaId: facturaRef.id,
                  totalAgregado: result.totalAgregado,
                  preservadas: result.preservadasPorLiquidacion,
                  eliminadas: result.eliminadasHuerfanas,
                },
              );
              denorm = {
                comisionTecnicoId: '',
                comisionTecnicoNombre: '—',
                comisionTecnicoMonto: 0,
                comisionTecnicoPorcentaje: 0,
              };
            }
            if (denorm) {
              denormParaTx = Object.fromEntries(
                Object.entries(denorm).filter(([, v]) => v !== undefined),
              );
            }
          }
        } else {
          // N=1 (o 0): flujo legacy. `registrarComisionPorFactura` cubre ambos
          // casos (con/sin tecnicoId por línea) y delega internamente si hace falta.
          const comisionInfo = await registrarComisionPorFactura({
            orden,
            facturaId: facturaRef.id,
            facturaNumero: numero,
            totalFactura: totalItems,
            items: itemsLimpios as unknown as ItemCotizacion[],
            userProfile,
            itbisPorcentaje: itbisPct,
          });
          // Denormalizar SOLO si hay comisión efectiva (técnico válido + monto > 0).
          if (comisionInfo && comisionInfo.comisionId && comisionInfo.tecnicoId) {
            denormParaTx = {
              comisionRegistroId: comisionInfo.comisionId,
              comisionTecnicoId: comisionInfo.tecnicoId,
              comisionTecnicoNombre: comisionInfo.tecnicoNombre,
              comisionTecnicoPorcentaje: comisionInfo.porcentaje,
              comisionTecnicoMonto: comisionInfo.comisionMonto,
            };
          }
        }
      } catch (err) {
        console.warn('Error registrando comisión por factura:', err);
      }

      // Marcar la orden — payload construido PRE-tx (se aplica con tx.update).
      const registro = crearRegistroAuditoria(
        usuario,
        'editar',
        `Factura generada ${numero} (${formatMonedaPrecisa(totalItems)})`,
        'facturada',
        'no',
        'sí',
      );
      // SPRINT-151: construir pago nuevo si la operaria registró cobro en el paso 2.
      // Validaciones de monto/verificado/banco ya pasaron al inicio de handleGenerar.
      const pagoNuevoFinal: PagoOrden | null = montoPagoNuevo > 0 ? (() => {
        const pagoBase: PagoOrden = {
          id: `pago_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          metodo: pagoMetodo,
          monto: montoPagoNuevo,
          fecha: ahora.toDate(),
          registradoPorId: usuarioId,
          registradoPorNombre: usuario,
          verificado: pagoVerificado,
          verificadoPorId: usuarioId,
          verificadoPorNombre: usuario,
          verificadoAt: ahora.toDate(),
        };
        if (pagoMetodo === 'efectivo' && pagoRecibidoPor.trim()) {
          pagoBase.recibidoPorNombre = pagoRecibidoPor.trim();
        }
        if (pagoMetodo === 'transferencia' || pagoMetodo === 'tarjeta') {
          pagoBase.bancoNombre = pagoBanco.trim();
        }
        if (pagoReferencia.trim()) {
          pagoBase.referencia = pagoReferencia.trim();
        }
        return pagoBase;
      })() : null;

      // SPRINT-161: tras emitir conduce, avanzar fase a 'cerrado' y mantener
      // sincronía con `estadoSimple`/`estado`/`historialFases` (sub-regla CLAUDE.md
      // "registros sincronizados"). Antes el modal dejaba la orden en
      // `fase: 'trabajo_realizado'` con `facturada: true` — inconsistencia visible
      // en `/admin/ordenes` y en queries que filtran por fase.
      // Patrón del entry tomado de `OrdenDetalle.tsx:373-386` y `AgendaDia.tsx:114-127`:
      // shape `{ fase, timestamp, usuario, nota }`, array reemplazado completo
      // (no `arrayUnion`).
      const nuevoHistorialFases = [
        ...(orden.historialFases || []).map((h) => ({
          fase: h.fase,
          timestamp: h.timestamp instanceof Date ? Timestamp.fromDate(h.timestamp) : h.timestamp,
          usuario: h.usuario || '',
          ...(h.nota ? { nota: h.nota } : {}),
        })),
        {
          fase: 'cerrado' as const,
          timestamp: ahora,
          usuario,
          nota: `Conduce emitido ${numero}`,
        },
      ];

      const ordenUpdate: Record<string, unknown> = {
        facturada: true,
        facturaId: facturaRef.id,
        facturaNumero: numero,
        facturadaAt: ahora,
        facturadaPorId: usuarioId,
        facturadaPorNombre: usuario,
        // SPRINT-161: avanzar fase + estados duplicados + append a historial.
        fase: 'cerrado',
        estadoSimple: 'completado',
        estado: 'cerrado',
        historialFases: nuevoHistorialFases,
        auditoria: arrayUnion(registro),
        updatedAt: ahora,
      };
      if (pagoNuevoFinal) {
        // arrayUnion para mantener pagos previos intactos + agregar el nuevo.
        ordenUpdate.pagos = arrayUnion(pagoNuevoFinal);
      }
      const ordenUpdateLimpio = Object.fromEntries(
        Object.entries(ordenUpdate).filter(([, v]) => v !== undefined),
      );

      // ─── Transacción atómica: crear factura + denorm + update orden ───
      try {
        await runTransaction(db, async (tx) => {
          const ordenRef = doc(db, 'ordenes_servicio', orden.id);
          const ordenSnap = await tx.get(ordenRef);
          if (!ordenSnap.exists()) {
            throw new Error('La orden ya no existe.');
          }
          // Idempotencia: si otro tab/usuario ya emitió conduce, abortar limpio.
          if (ordenSnap.data()?.facturada === true) {
            throw new Error('CONDUCE_YA_EMITIDO');
          }
          // 1. Crear factura con id pre-generado.
          tx.set(facturaRef, facturaLimpia);
          // 2. Denormalización de comisiones (si helpers PRE-tx generaron payload).
          if (denormParaTx) {
            tx.update(facturaRef, denormParaTx);
          }
          // 3. Update orden con arrayUnion(pagos) + auditoria.
          tx.update(ordenRef, ordenUpdateLimpio);
        });
      } catch (txErr) {
        const msg = (txErr as Error)?.message || '';
        if (msg === 'CONDUCE_YA_EMITIDO') {
          toast.error('Este conduce ya fue emitido en otra pestaña. Recargá la página.');
          setGenerando(false);
          return;
        }
        console.error('[procesar-facturacion] runTransaction emisión conduce falló:', txErr);
        toast.error('Error al generar el conduce de garantía');
        setGenerando(false);
        return;
      }

      // ─── POST-tx: audit logs + notificaciones (best-effort, no bloquean) ───

      // Audit log de emisión de garantía (no bloquea si falla)
      if (garantia) {
        try {
          await addDoc(collection(db, 'auditoria_admin'), {
            accion: 'emitir_garantia',
            // SPRINT-114: unificado a currentUser.uid (auth.uid). Antes era
            // userProfile?.id que podía ser personalDocId — gotcha CLAUDE.md.
            solicitanteUid: currentUser?.uid || null,
            solicitanteNombre: usuario,
            objetivoTipo: 'factura',
            objetivoId: facturaRef.id,
            conduceNumero: numero,
            ordenId: orden.id,
            ordenNumero: orden.numero,
            garantia: {
              tiempoDias: garantia.tiempoDias,
              finFecha: garantia.finFecha,
              token: (garantia.token || '').substring(0, 8) + '...',
            },
            timestamp: Timestamp.now(),
          });
        } catch (err) {
          console.warn('[facturacion-pendiente] audit emitir_garantia falló (no bloquea):', err);
        }
      }

      // Audit log override modalidad (best-effort, no bloquea emisión).
      // Una entry por cada línea overrideada respecto al default que dictaba
      // el tipo del cliente.
      try {
        const modalidadDefaultPorTipo: 'mayoreo' | 'detalle' =
          clienteTipoEnEmision === 'b2b' ? 'mayoreo' : 'detalle';
        const overrides = items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) =>
            (it.tipoItem === 'servicio' || it.tipoItem === 'pieza') &&
            it.precioModalidad &&
            it.precioModalidad !== modalidadDefaultPorTipo,
          );
        if (overrides.length > 0) {
          for (const { it, idx } of overrides) {
            const auditPayload: Record<string, unknown> = {
              accion: 'override_modalidad_precio_factura',
              lineaIndex: idx,
              modalidadOriginal: modalidadDefaultPorTipo,
              modalidadOverride: it.precioModalidad,
              clienteTipo: clienteTipoEnEmision,
              // SPRINT-114: auth.uid en vez de userProfile.id (consistencia).
              solicitanteUid: currentUser?.uid || null,
              solicitanteNombre: userProfile?.nombre || null,
              facturaNumero: numero,
              ordenId: orden.id,
              ordenNumero: orden.numero || null,
              timestamp: serverTimestamp(),
            };
            const auditLimpio = Object.fromEntries(
              Object.entries(auditPayload).filter(([, v]) => v !== undefined),
            );
            // Sin await en paralelo: no bloqueamos la UX del usuario.
            addDoc(collection(db, 'auditoria_admin'), auditLimpio).catch(err =>
              console.warn('Audit log override modalidad falló:', err),
            );
          }
        }
      } catch (auditErr) {
        console.warn('Error preparando audit log de override modalidad:', auditErr);
      }

      // SPRINT-151: audit log en auditoria_admin (best-effort, no bloquea).
      try {
        await addDoc(collection(db, 'auditoria_admin'), {
          accion: 'emitir_conduce_con_pago',
          solicitanteUid: currentUser?.uid || null,
          solicitanteNombre: usuario,
          objetivoTipo: 'factura',
          objetivoId: facturaRef.id,
          conduceNumero: numero,
          ordenId: orden.id,
          ordenNumero: orden.numero,
          totalConduce: totalItems,
          tieneNota: !!notaTrim,
          notaPreview: notaTrim.substring(0, 100), // primeros 100 chars para auditoría liviana
          pagoNuevo: pagoNuevoFinal
            ? {
                metodo: pagoNuevoFinal.metodo,
                monto: pagoNuevoFinal.monto,
                verificado: pagoNuevoFinal.verificado === true,
                banco: pagoNuevoFinal.bancoNombre || null,
                referencia: pagoNuevoFinal.referencia || null,
              }
            : null,
          timestamp: Timestamp.now(),
        });
      } catch (err) {
        console.warn('[facturacion-pendiente] audit emitir_conduce_con_pago falló (no bloquea):', err);
      }

      // SPRINT-151 / SPRINT-153: notificar a admins/coord/operarias activos
      // (1 doc por destinatario). Si quien emite es admin/coord/operaria ella
      // misma, no se auto-notifica (ahorra ruido).
      //
      // SPRINT-153 (2026-05-12): se amplió el filtro para incluir `operaria`.
      // En el taller actual las operarias coordinan los conduces — necesitan
      // saber cuándo se emite uno (especialmente si fue un admin/coord). Antes
      // del cambio: Wilainy/Yohana NO recibían el doc → contador no subía.
      //
      // Política de logging: el catch usa console.error (no warn) para que los
      // fallos de Firestore (rules denegando, doc inválido) sean visibles en
      // DevTools. Sin esto los errores quedaban silenciados (SPRINT-153 Bug 3).
      try {
        const destinatarios = personalActivo.filter(p =>
          (p.rol === 'administrador' || p.rol === 'coordinadora' || p.rol === 'operaria') &&
          p.uid && // requiere auth account (P-006: uid = auth.uid, no doc id)
          p.uid !== currentUser?.uid // no auto-notificarse
        );
        const verificadoLabel = pagoNuevoFinal?.verificado === true ? 'sí' : (pagoNuevoFinal ? 'no' : 'sin pago');
        const mensajeBase = `${orden.clienteNombre} · ${formatMonedaPrecisa(totalItems)} · Pago verificado: ${verificadoLabel}`;
        for (const destino of destinatarios) {
          await crearNotificacion({
            userId: destino.uid!,
            destinatarioNombre: destino.nombre,
            tipo: 'conduce_emitido',
            titulo: `Conduce ${numero} emitido`,
            mensaje: mensajeBase,
            ordenId: orden.id,
            ordenNumero: orden.numero || undefined,
          }).catch(err =>
            console.error(`[facturacion-pendiente] notif conduce_emitido a ${destino.nombre} falló:`, err),
          );
        }
      } catch (notifErr) {
        console.error('[facturacion-pendiente] error preparando notif conduce_emitido:', notifErr);
      }

      // Limpiar borrador en éxito.
      limpiarBorrador();

      // Toast con CTA de WhatsApp si tenemos teléfono y se generó garantía
      const telefono = orden.clienteTelefono || '';
      if (garantia && telefono) {
        // Construimos un objeto Factura mínimo en memoria para alimentar el
        // helper de mensaje (no se relee Firestore).
        const facturaParaMensaje: Factura = {
          id: facturaRef.id,
          numero,
          clienteNombre: orden.clienteNombre,
          clienteTelefono: telefono,
          items: itemsLimpios as unknown as ItemCotizacion[],
          total: totalItems,
          // SPRINT-151: idem cálculo de estado.
          estado: (totalPagado + montoPagoNuevo) >= totalItems ? 'pagada' : 'emitida',
          fechaEmision: ahora.toDate(),
          equipoTipo: orden.equipoTipo,
          equipoMarca: orden.equipoMarca,
          equipoModelo: orden.equipoModelo,
          tecnicoId: orden.tecnicoId,
          tecnicoNombre: orden.tecnicoNombre,
          fechaServicio: fechaServicio?.toDate(),
          garantia,
          createdAt: ahora.toDate(),
        };
        toast.custom(
          t => (
            <div
              className={`bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 flex items-center gap-3 ${t.visible ? 'animate-enter' : 'animate-leave'}`}
            >
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">
                  Conduce {numero} generado
                </div>
                <div className="text-xs text-gray-500">
                  Enviá el conduce y link de garantía al cliente.
                </div>
              </div>
              <button
                onClick={() => {
                  abrirWhatsApp(telefono, mensajeConduceGarantia(facturaParaMensaje));
                  toast.dismiss(t.id);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
              >
                Enviar por WhatsApp
              </button>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                Cerrar
              </button>
            </div>
          ),
          { duration: 8000 },
        );
      } else {
        toast.success(`Conduce ${numero} generado`);
      }
      // Suprimir warning de variable no usada (esNMultiple/algunoConTecnico ya
      // se consumieron arriba; los dejamos referenciados para claridad).
      void algunoConTecnico;
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el conduce de garantía');
    } finally {
      setGenerando(false);
    }
  };

  if (!orden) return null;

  return (
    <Modal isOpen={!!orden} onClose={onClose} title={`Emitir conduce de garantía — ${orden.numero || ''}`} size="lg">
      <div className="space-y-5">
        {/* Banner borrador encontrado */}
        {borradorEncontrado && (
          <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-blue-900 min-w-0">
              <Clock size={14} className="flex-shrink-0" />
              <span className="truncate">
                Borrador encontrado del{' '}
                <strong>
                  {new Date(borradorEncontrado.guardadoEn).toLocaleString('es-DO', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
                . ¿Restaurar?
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={restaurarBorrador}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
              >
                Restaurar
              </button>
              <button
                type="button"
                onClick={descartarBorrador}
                className="p-1 hover:bg-blue-100 rounded text-blue-700"
                title="Descartar borrador"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center gap-2">
          <StepDot active={paso === 1} done={paso > 1} num={1} label="Aprobar contenido" />
          <div className="flex-1 h-0.5 bg-gray-200" />
          <StepDot active={paso === 2} done={false} num={2} label="Confirmar pagos" />
        </div>

        {paso === 1 && (
          <div className="space-y-3">
            {cargandoCotizacion && <p className="text-sm text-gray-500">Cargando cotización...</p>}
            <div>
              <p className="text-xs text-gray-600 mb-2">
                Items que se incluirán en el conduce de garantía. Edita lo que sea necesario.
              </p>
              <FacturaItemsEditor
                items={items}
                onItemsChange={setItems}
                catalogoServicios={catalogoServicios}
                catalogoPiezas={catalogoPiezas}
                tecnicos={tecnicos}
                cliente={cliente}
                puedeOverrideModalidad={puedeOverrideModalidad}
                tecnicosPrioritarios={tecnicosPrioritarios}
                disabled={generando}
              />
            </div>
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg p-3">
              <span className="text-sm font-medium text-[#0f3460]">Total conduce</span>
              <span className="text-lg font-bold text-[#0f3460]">{formatMonedaPrecisa(totalItems)}</span>
            </div>
            {/* SPRINT-151: nota libre para el conduce (max 500 chars). */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="notaConduce" className="text-xs font-medium text-gray-700">
                  Nota para el conduce <span className="text-gray-400">(opcional)</span>
                </label>
                <span className={`text-[11px] ${notaConduce.length > 500 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                  {notaConduce.length}/500
                </span>
              </div>
              <textarea
                id="notaConduce"
                value={notaConduce}
                onChange={e => setNotaConduce(e.target.value.slice(0, 500))}
                disabled={generando}
                rows={2}
                placeholder="Ej: Cliente solicita pasar factura legal aparte."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50 resize-none"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Aparece impresa en el conduce de garantía. No se muestra al cliente en el link público.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setPaso(2)}
                disabled={items.length === 0}
                className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                Siguiente: Confirmar pagos
              </button>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            {/* SPRINT-151: ya no decimos "hazlo desde la orden antes de continuar".
                Ahora la operaria puede registrar el pago directamente acá. */}
            <p className="text-xs text-gray-600">
              Pagos previos registrados en la orden. Podés agregar un pago nuevo abajo (opcional).
            </p>
            {pagosPrevios.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                Esta orden no tiene pagos previos. Si la operaria está cobrando ahora, registralo en el bloque "Registrar pago de este conduce" más abajo.
              </div>
            ) : (
              <div className="space-y-2">
                {pagosPrevios.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {p.metodo === 'efectivo' && <Banknote size={14} className="text-green-600" />}
                      {p.metodo === 'transferencia' && <ArrowRightLeft size={14} className="text-blue-600" />}
                      {p.metodo === 'tarjeta' && <CreditCard size={14} className="text-purple-600" />}
                      <div>
                        <span className="font-medium text-gray-900">{formatMonedaPrecisa(p.monto)}</span>
                        <span className="text-gray-500 ml-2 capitalize">{p.metodo}</span>
                        {p.metodo === 'efectivo' && p.recibidoPorNombre && (
                          <span className="text-gray-500"> · {p.recibidoPorNombre}</span>
                        )}
                        {(p.metodo === 'transferencia' || p.metodo === 'tarjeta') && p.bancoNombre && (
                          <span className="text-gray-500"> → {p.bancoNombre}</span>
                        )}
                        {p.referencia && <span className="text-gray-500"> · Ref {p.referencia}</span>}
                        {p.verificado === true && (
                          <span className="ml-2 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            VERIFICADO
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <div>
                <div className="text-[11px] text-blue-700 uppercase">Total pagado</div>
                <div className="text-base font-semibold text-green-600">{formatMonedaPrecisa(totalPagado)}</div>
              </div>
              <div>
                <div className="text-[11px] text-blue-700 uppercase">Total conduce</div>
                <div className="text-base font-semibold text-[#0f3460]">{formatMonedaPrecisa(totalItems)}</div>
              </div>
            </div>

            {/* SPRINT-151: bloque "Registrar pago de este conduce" — pago activo
                editable + checkbox "Pago verificado". Si el monto = 0, no se
                crea pago nuevo. Si monto > 0, "verificado" es obligatorio. */}
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-semibold text-gray-900 mb-2">
                Registrar pago de este conduce
                <span className="text-xs font-normal text-gray-500 ml-2">(opcional · dejá monto en 0 si no hay cobro)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-gray-600">Método</label>
                  <select
                    value={pagoMetodo}
                    onChange={e => setPagoMetodo(e.target.value as typeof pagoMetodo)}
                    disabled={generando}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600">Monto</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pagoMonto}
                    onChange={e => setPagoMonto(parseFloat(e.target.value) || 0)}
                    disabled={generando}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                  />
                </div>
                {pagoMetodo === 'efectivo' ? (
                  <div>
                    <label className="text-[11px] font-medium text-gray-600">Recibido por</label>
                    <input
                      type="text"
                      value={pagoRecibidoPor}
                      onChange={e => setPagoRecibidoPor(e.target.value)}
                      disabled={generando}
                      placeholder="Nombre de quien recibió el efectivo"
                      className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-medium text-gray-600">Banco</label>
                    <input
                      type="text"
                      value={pagoBanco}
                      onChange={e => setPagoBanco(e.target.value)}
                      disabled={generando}
                      placeholder="BHD, Popular, Scotiabank..."
                      className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[11px] font-medium text-gray-600">Referencia / Recibo</label>
                  <input
                    type="text"
                    value={pagoReferencia}
                    onChange={e => setPagoReferencia(e.target.value)}
                    disabled={generando}
                    placeholder="Opcional"
                    className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                  />
                </div>
              </div>
              <label
                className={`mt-3 flex items-center gap-2 text-sm font-medium select-none ${pagoMonto > 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                title={pagoMonto <= 0 ? 'Sin monto a verificar (la orden ya está pagada)' : undefined}
              >
                <input
                  type="checkbox"
                  checked={pagoVerificado}
                  disabled={generando || pagoMonto <= 0}
                  onChange={e => setPagoVerificado(e.target.checked)}
                  title={pagoMonto <= 0 ? 'Sin monto a verificar (la orden ya está pagada)' : undefined}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className={pagoVerificado ? 'text-emerald-700' : 'text-gray-700'}>
                  Pago verificado (cotejado con banco / efectivo en mano)
                </span>
              </label>
              {/* SPRINT-152: helper text contextual según estado del checkbox */}
              {pagoMonto <= 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Sin monto a verificar — orden ya está pagada.
                </p>
              )}
              {pagoMonto > 0 && !pagoVerificado && (
                <p className="mt-1 text-xs text-amber-600">
                  Tildá para confirmar que cotejaste con banco/efectivo antes de emitir.
                </p>
              )}
              {pagoMonto > 0 && (totalPagado + pagoMonto > totalItems) && (
                <p className="mt-1 text-[11px] text-red-600 font-medium">
                  Total cobrado supera el total del conduce ({formatMonedaPrecisa(totalPagado + pagoMonto)} {' > '} {formatMonedaPrecisa(totalItems)}). Ajustá el monto.
                </p>
              )}
            </div>

            {/* Selector de tiempo de garantía (sólo coord/admin, requerido para emitir) */}
            {puedeConfigurarGarantia && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="text-sm font-semibold text-amber-900">
                    Tiempo de Garantía
                  </div>
                  {tiempoGarantiaDias === null && (
                    <span className="text-[11px] text-red-600 font-medium">
                      Requerido para emitir
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-amber-800 mb-3">
                  Define cuántos días tendrá vigencia la garantía. El cliente recibirá un link único para consultar el estado y reclamar.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {GARANTIA_PRESETS.map(p => {
                    const activo = tiempoGarantiaDias === p.dias;
                    return (
                      <button
                        key={p.dias}
                        type="button"
                        onClick={() => setTiempoGarantiaDias(p.dias)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                          activo
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {/* SPRINT-160: leyenda visual para diferenciar origen del valor preseleccionado. */}
                {orden?.periodoGarantiaDias != null && tiempoGarantiaDias === orden.periodoGarantiaDias && (
                  <p className="mt-2 text-[11px] text-amber-700 italic">
                    Sugerido desde wizard del técnico ({orden.periodoGarantiaDias} días).
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPaso(1)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleGenerar}
                disabled={generando || (puedeConfigurarGarantia && tiempoGarantiaDias === null)}
                className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                title={puedeConfigurarGarantia && tiempoGarantiaDias === null ? 'Selecciona un tiempo de garantía' : ''}
              >
                <Check size={14} />
                {generando ? 'Generando conduce...' : 'Generar conduce de garantía'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StepDot({ active, done, num, label }: { active: boolean; done: boolean; num: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          done
            ? 'bg-green-500 text-white'
            : active
              ? 'bg-[#0f3460] text-white'
              : 'bg-gray-200 text-gray-500'
        }`}
      >
        {done ? <Check size={14} /> : num}
      </div>
      <span className={`text-xs font-medium ${active ? 'text-[#0f3460]' : 'text-gray-500'}`}>{label}</span>
    </div>
  );
}

/**
 * Aplica el técnico de la orden como default a un item de cotización si:
 *  - el item NO trae `tecnicoId` propio,
 *  - la orden tiene `tecnicoId`.
 * Si el item ya viene con técnico (vendedor por línea desde la cotización),
 * se respeta. Si la orden no tiene técnico, no se toca nada.
 */
function aplicarTecnicoDefault(item: ItemCotizacion, orden: OrdenServicio): ItemCotizacion {
  if (item.tecnicoId) return item;
  if (!orden.tecnicoId) return item;
  return {
    ...item,
    tecnicoId: orden.tecnicoId,
    tecnicoNombre: orden.tecnicoNombre,
  };
}

function defaultItem(orden: OrdenServicio): ItemCotizacion {
  // Solo Chequeo: el item es el chequeo del equipo, no el servicio completo.
  if (orden.soloChequeo) {
    const precioCheq = Number(orden.precioChequeo || orden.precioFinal || 0);
    const descCheq = `Chequeo de ${orden.equipoTipo || 'equipo'}${orden.equipoMarca ? ` ${orden.equipoMarca}` : ''} (sin reparación)`;
    const base: ItemCotizacion = {
      descripcion: descCheq.substring(0, 200),
      cantidad: 1,
      precio: precioCheq,
      tipoItem: 'servicio',
    };
    // Default técnico de la orden (si existe) — sirve para el flujo legacy
    // de comisiones (aunque soloChequeo no genera comisión, dejamos consistente).
    if (orden.tecnicoId) {
      base.tecnicoId = orden.tecnicoId;
      base.tecnicoNombre = orden.tecnicoNombre;
    }
    return base;
  }
  const precio = Number(orden.precioFinal || orden.precioAprobado || orden.precioSugerido || 0);
  const desc = `${orden.equipoTipo}${orden.equipoMarca ? ` ${orden.equipoMarca}` : ''} — ${orden.descripcionFalla || 'Servicio'}`;
  const base: ItemCotizacion = {
    descripcion: desc.substring(0, 200),
    cantidad: 1,
    precio,
    tipoItem: 'servicio',
  };
  if (orden.tecnicoId) {
    base.tecnicoId = orden.tecnicoId;
    base.tecnicoNombre = orden.tecnicoNombre;
  }
  return base;
}
