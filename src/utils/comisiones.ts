import {
  collection, addDoc, doc, getDoc, getDocs, query, where, Timestamp, updateDoc, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio, Personal, Usuario, ItemCotizacion } from '../types';
import { crearRegistroAuditoria } from './index';

/** ITBIS (impuesto al valor agregado) estándar de RD. Fallback cuando no hay config. */
export const ITBIS_PORCENTAJE = 18;

/**
 * Desglosa un total que YA incluye ITBIS:
 *   subtotal = total / (1 + porcentaje/100)
 *   itbis = total - subtotal
 * El porcentaje es configurable; si no se pasa, usa el default (18%).
 */
export function desglosarTotalConITBIS(
  total: number,
  itbisPorcentaje: number = ITBIS_PORCENTAJE,
): {
  subtotal: number;
  itbis: number;
  total: number;
  itbisPorcentaje: number;
} {
  const pct = typeof itbisPorcentaje === 'number' && itbisPorcentaje >= 0 ? itbisPorcentaje : ITBIS_PORCENTAJE;
  const subtotal = Math.round((total / (1 + pct / 100)) * 100) / 100;
  const itbis = Math.round((total - subtotal) * 100) / 100;
  return { subtotal, itbis, total, itbisPorcentaje: pct };
}

/**
 * Calcula el desglose completo para una factura:
 *  total (lo que paga el cliente) → subtotal + itbis
 *  costoPiezas = suma de costoCompra * cantidad de items tipo pieza
 *  gananciaNeta = subtotal - costoPiezas
 *  comisionMonto = gananciaNeta * (porcentajeTecnico / 100)
 */
export function calcularDesgloseFactura(args: {
  total: number;
  items?: ItemCotizacion[];
  porcentajeTecnico: number;
  itbisPorcentaje?: number;
}): {
  subtotal: number;
  itbis: number;
  itbisPorcentaje: number;
  costoPiezas: number;
  gananciaNeta: number;
  comisionMonto: number;
  comisionPorcentaje: number;
} {
  const { subtotal, itbis, itbisPorcentaje } = desglosarTotalConITBIS(args.total, args.itbisPorcentaje);
  const costoPiezas = calcularCostoPiezasDeItems(args.items);
  const gananciaNeta = Math.max(0, Math.round((subtotal - costoPiezas) * 100) / 100);
  const comisionMonto = Math.round(gananciaNeta * (args.porcentajeTecnico / 100) * 100) / 100;
  return {
    subtotal,
    itbis,
    itbisPorcentaje,
    costoPiezas,
    gananciaNeta,
    comisionMonto,
    comisionPorcentaje: args.porcentajeTecnico,
  };
}

/**
 * Calcula el costo de piezas de una orden a partir de su factura o cotización vinculada.
 * Para cada item con tipoItem === 'pieza', usa `costoCompra` si existe; si no, usa `precio`.
 * El costo de piezas se descuenta de la base sobre la que se calcula la comisión del técnico
 * (el técnico no gana sobre piezas, solo sobre el margen y la mano de obra).
 */
export function calcularCostoPiezasDeItems(items: ItemCotizacion[] | undefined): number {
  if (!items || items.length === 0) return 0;
  return items
    .filter(i => i.tipoItem === 'pieza')
    .reduce((sum, i) => {
      const costoUnit = typeof i.costoCompra === 'number' ? i.costoCompra : i.precio;
      return sum + (costoUnit * (i.cantidad || 1));
    }, 0);
}

/** Lee la cotización vinculada (si existe) o factura para sumar costo de piezas. */
async function obtenerCostoPiezasDeOrden(orden: OrdenServicio): Promise<number> {
  // Preferir factura vinculada (representa lo realmente cobrado)
  try {
    const facturaQ = await getDocs(query(
      collection(db, 'facturas'),
      where('ordenId', '==', orden.id),
    ));
    if (!facturaQ.empty) {
      const items = facturaQ.docs[0].data().items as ItemCotizacion[] | undefined;
      const costo = calcularCostoPiezasDeItems(items);
      if (costo > 0) return costo;
    }
  } catch (err) {
    console.warn('No se pudo leer factura vinculada para costo de piezas:', err);
  }
  // Fallback a cotización vinculada
  if (orden.cotizacionId) {
    try {
      const cotSnap = await getDoc(doc(db, 'cotizaciones', orden.cotizacionId));
      if (cotSnap.exists()) {
        const items = cotSnap.data().items as ItemCotizacion[] | undefined;
        return calcularCostoPiezasDeItems(items);
      }
    } catch (err) {
      console.warn('No se pudo leer cotización vinculada:', err);
    }
  }
  return 0;
}

/**
 * Calcula la quincena a la que pertenece una fecha de cobro:
 * - Días 1–14:    `YYYY-MM-Q1` (paga el 15 de ese mes)
 * - Días 15–29:   `YYYY-MM-Q2` (paga el 30 de ese mes)
 * - Días 30–31:   `YYYY-(MM+1)-Q1` (paga el 15 del mes siguiente)
 *
 * El corte real RD: del 30 al 14 → Q1 del mes siguiente; del 15 al 29 → Q2 del mes actual.
 */
export function calcularQuincenaActual(fecha: Date): string {
  const d = fecha.getDate();
  let year = fecha.getFullYear();
  let month = fecha.getMonth() + 1; // 1-indexed
  let q: 'Q1' | 'Q2';
  if (d >= 1 && d <= 14) {
    q = 'Q1';
  } else if (d >= 15 && d <= 29) {
    q = 'Q2';
  } else {
    // 30 o 31 → Q1 del mes siguiente
    q = 'Q1';
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}-${q}`;
}

/** Devuelve { inicio, fin } como Date para una quincena dada (`YYYY-MM-Q1` o `Q2`). */
export function rangoQuincena(quincena: string): { inicio: Date; fin: Date } {
  const [yStr, mStr, qStr] = quincena.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (qStr === 'Q1') {
    // Q1 cubre días 30-31 del mes anterior + 1-14 de este mes (ambos pertenecen a Q1 de este YYYY-MM)
    const inicio = new Date(y, m - 2, 30, 0, 0, 0); // mes anterior día 30
    const fin = new Date(y, m - 1, 14, 23, 59, 59);
    return { inicio, fin };
  }
  // Q2 cubre 15-29 del mes (o hasta el último día si febrero no bisiesto, 28
  // días). Sin este clamp, `new Date(y, 1, 29)` para feb no bisiesto hace
  // rollover a 1 de marzo, incluyendo un día extra en el rango. Fix #77.
  const ultimoDia = new Date(y, m, 0).getDate();
  const diaFin = Math.min(29, ultimoDia);
  const inicio = new Date(y, m - 1, 15, 0, 0, 0);
  const fin = new Date(y, m - 1, diaFin, 23, 59, 59);
  return { inicio, fin };
}

/** Lista las últimas N quincenas en orden descendente, partiendo de la actual. */
export function listarUltimasQuincenas(n: number = 12): string[] {
  const out: string[] = [];
  const hoy = new Date();
  // Empezar por la quincena actual y retroceder
  const cursor = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let actual = calcularQuincenaActual(cursor);
  out.push(actual);
  // Saltos de 15 días aprox para enumerar
  while (out.length < n) {
    cursor.setDate(cursor.getDate() - 15);
    const q = calcularQuincenaActual(cursor);
    if (q !== actual && !out.includes(q)) {
      out.push(q);
      actual = q;
    }
  }
  return out;
}

const COMISION_DEFAULT_SENIOR = 10;
const COMISION_DEFAULT_JUNIOR = 8;
const COMISION_DEFAULT_FALLBACK = 10;

function obtenerPorcentajeComision(personal: Personal | null | undefined): number {
  if (!personal) return COMISION_DEFAULT_FALLBACK;
  if (typeof personal.comisionPorcentaje === 'number') return personal.comisionPorcentaje;
  if (personal.nivel === 'senior') return COMISION_DEFAULT_SENIOR;
  if (personal.nivel === 'junior') return COMISION_DEFAULT_JUNIOR;
  return COMISION_DEFAULT_FALLBACK;
}

/**
 * Resuelve el % de comisión del técnico asignado a una orden.
 * Devuelve también el doc de Personal por si el caller necesita `nombre`.
 */
export async function obtenerTecnicoParaComision(
  tecnicoId: string | undefined,
): Promise<{ personal: Personal | null; porcentaje: number }> {
  if (!tecnicoId) return { personal: null, porcentaje: COMISION_DEFAULT_FALLBACK };
  try {
    const snap = await getDoc(doc(db, 'personal', tecnicoId));
    if (snap.exists()) {
      const personal = { id: snap.id, ...snap.data() } as Personal;
      return { personal, porcentaje: obtenerPorcentajeComision(personal) };
    }
  } catch (err) {
    console.warn('No se pudo leer técnico:', err);
  }
  return { personal: null, porcentaje: COMISION_DEFAULT_FALLBACK };
}

/**
 * Crea o actualiza un ComisionRegistro a partir de una factura recién generada.
 * Es idempotente por `ordenId` — si ya existe una comisión, actualiza sus montos
 * en lugar de duplicarla. Devuelve el id del registro creado/actualizado.
 */
export async function registrarComisionPorFactura(args: {
  orden: OrdenServicio;
  facturaId: string;
  facturaNumero: string;
  totalFactura: number;
  items?: ItemCotizacion[];
  userProfile: Usuario | null;
  /** Si no se pasa, usa el default 18% */
  itbisPorcentaje?: number;
}): Promise<{ comisionId: string | null; comisionMonto: number; gananciaNeta: number; subtotal: number; itbis: number; costoPiezas: number; porcentaje: number; tecnicoId: string; tecnicoNombre: string }> {
  const { orden, facturaId, facturaNumero, totalFactura, items, userProfile, itbisPorcentaje } = args;
  const usuario = userProfile?.nombre || 'Sistema';

  if (!orden.tecnicoId) {
    return {
      comisionId: null, comisionMonto: 0, gananciaNeta: 0, subtotal: 0, itbis: 0, costoPiezas: 0,
      porcentaje: 0, tecnicoId: '', tecnicoNombre: '',
    };
  }
  if (orden.soloChequeo) {
    return {
      comisionId: null, comisionMonto: 0, gananciaNeta: 0, subtotal: 0, itbis: 0, costoPiezas: 0,
      porcentaje: 0, tecnicoId: orden.tecnicoId, tecnicoNombre: orden.tecnicoNombre || '',
    };
  }

  const { personal, porcentaje } = await obtenerTecnicoParaComision(orden.tecnicoId);
  const tecnicoNombre = orden.tecnicoNombre || personal?.nombre || 'Técnico';

  const desglose = calcularDesgloseFactura({ total: totalFactura, items, porcentajeTecnico: porcentaje, itbisPorcentaje });

  const fechaCobro = new Date();
  const quincena = calcularQuincenaActual(fechaCobro);

  // Buscar si ya existe comisión para esta orden (idempotencia + actualización)
  let comisionExistenteId: string | null = null;
  try {
    const existQ = await getDocs(query(
      collection(db, 'comisiones'),
      where('ordenId', '==', orden.id),
    ));
    if (!existQ.empty) comisionExistenteId = existQ.docs[0].id;
  } catch (err) {
    console.warn('No se pudo buscar comisión existente:', err);
  }

  const payload: Record<string, unknown> = {
    tecnicoId: orden.tecnicoId,
    tecnicoNombre,
    ordenId: orden.id,
    ordenNumero: orden.numero || '',
    clienteNombre: orden.clienteNombre || '',
    fechaCobro: Timestamp.fromDate(fechaCobro),
    precioFinal: totalFactura,
    subtotal: desglose.subtotal,
    itbisMonto: desglose.itbis,
    costoPiezas: desglose.costoPiezas,
    basePendienteComision: desglose.gananciaNeta,
    comisionPorcentaje: desglose.comisionPorcentaje,
    comisionMonto: desglose.comisionMonto,
    facturaId,
    facturaNumero,
    estadoLiquidacion: 'pendiente',
    quincenaAsignada: quincena,
    updatedAt: Timestamp.now(),
  };

  let comisionId = comisionExistenteId;
  try {
    if (comisionExistenteId) {
      await updateDoc(doc(db, 'comisiones', comisionExistenteId), payload);
    } else {
      payload.createdAt = Timestamp.now();
      const ref = await addDoc(collection(db, 'comisiones'), payload);
      comisionId = ref.id;
    }

    // Auditoría en la orden (no bloqueante)
    try {
      const reg = crearRegistroAuditoria(
        usuario,
        'cierre',
        `Factura ${facturaNumero} generada — Comisión RD$${desglose.comisionMonto.toLocaleString('es-DO')} para ${tecnicoNombre} (${porcentaje}%)`,
        'comision',
        '',
        `RD$${desglose.comisionMonto.toLocaleString('es-DO')}`,
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        auditoria: arrayUnion(reg),
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.warn('No se pudo registrar auditoría de comisión:', err);
    }
  } catch (err) {
    console.error('Error registrando comisión por factura:', err);
  }

  return {
    comisionId,
    comisionMonto: desglose.comisionMonto,
    gananciaNeta: desglose.gananciaNeta,
    subtotal: desglose.subtotal,
    itbis: desglose.itbis,
    costoPiezas: desglose.costoPiezas,
    porcentaje,
    tecnicoId: orden.tecnicoId,
    tecnicoNombre,
  };
}

/**
 * Registra una comisión por una orden cerrada con cobro.
 * Idempotente: si ya existe un ComisionRegistro con `ordenId`, no inserta otro.
 * Maneja errores internos sin propagar (caller no debe revertir nada).
 */
export async function registrarComisionPorOrden(
  orden: OrdenServicio,
  userProfile: Usuario | null,
): Promise<{ creada: boolean; razon?: string; comisionMonto?: number }> {
  try {
    if (orden.fase !== 'cerrado' && orden.fase !== 'trabajo_realizado') {
      return { creada: false, razon: 'orden no está cerrada' };
    }
    if (orden.soloChequeo) {
      return { creada: false, razon: 'orden de solo chequeo (sin comisión)' };
    }
    if (!orden.precioFinal || orden.precioFinal <= 0) {
      return { creada: false, razon: 'sin precio final' };
    }
    if (!orden.tecnicoId) {
      return { creada: false, razon: 'sin técnico asignado' };
    }
    // Defense-in-depth (server-side gate): si la orden tiene precio sugerido
    // pero NO está aprobada por oficina, no se genera comisión. Esto protege
    // contra writes directos a Firestore (admin SDK, scripts) que bypassen
    // la validación del UI.
    if (orden.precioSugerido !== undefined && orden.estadoAprobacion !== 'aprobado') {
      return { creada: false, razon: 'precio sugerido pero no aprobado por oficina' };
    }
    // Idempotencia
    const existeQ = await getDocs(query(
      collection(db, 'comisiones'),
      where('ordenId', '==', orden.id),
    ));
    if (!existeQ.empty) {
      return { creada: false, razon: 'comisión ya registrada' };
    }

    // Resolver técnico
    let tecnicoDoc: Personal | null = null;
    try {
      const snap = await getDoc(doc(db, 'personal', orden.tecnicoId));
      if (snap.exists()) tecnicoDoc = { id: snap.id, ...snap.data() } as Personal;
    } catch (err) {
      console.warn('No se pudo leer técnico para comisión:', err);
    }

    const porcentaje = obtenerPorcentajeComision(tecnicoDoc);
    const costoPiezas = await obtenerCostoPiezasDeOrden(orden);
    const base = Math.max(0, orden.precioFinal - costoPiezas);
    const comisionMonto = Math.round(base * (porcentaje / 100) * 100) / 100;

    const fechaCobro = new Date();
    const data: Record<string, unknown> = {
      tecnicoId: orden.tecnicoId,
      tecnicoNombre: orden.tecnicoNombre || tecnicoDoc?.nombre || 'Sin nombre',
      ordenId: orden.id,
      ordenNumero: orden.numero || '',
      clienteNombre: orden.clienteNombre || '',
      fechaCobro: Timestamp.fromDate(fechaCobro),
      precioFinal: orden.precioFinal,
      costoPiezas,
      basePendienteComision: base,
      comisionPorcentaje: porcentaje,
      comisionMonto,
      estadoLiquidacion: 'pendiente',
      quincenaAsignada: calcularQuincenaActual(fechaCobro),
      createdAt: Timestamp.now(),
    };

    await addDoc(collection(db, 'comisiones'), data);

    // Auditoría en la orden (no bloqueante)
    try {
      const usuario = userProfile?.nombre || 'Sistema';
      const reg = crearRegistroAuditoria(
        usuario, 'cierre',
        `Comisión RD$ ${comisionMonto.toLocaleString('es-DO')} registrada para ${orden.tecnicoNombre || tecnicoDoc?.nombre || 'técnico'}`,
        'comision', '', `RD$ ${comisionMonto.toLocaleString('es-DO')}`
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        auditoria: arrayUnion(reg),
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.warn('No se pudo registrar auditoría de comisión:', err);
    }

    return { creada: true, comisionMonto };
  } catch (err) {
    console.error('Error registrando comisión:', err);
    return { creada: false, razon: 'error interno' };
  }
}
