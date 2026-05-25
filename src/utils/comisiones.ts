import {
  collection, addDoc, doc, getDoc, getDocs, query, where, Timestamp, updateDoc, arrayUnion, deleteDoc,
  runTransaction, serverTimestamp,
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

/**
 * Lee la cotización vinculada (si existe) o factura para sumar costo de piezas.
 *
 * IMPORTANTE: una orden reactivada post-chequeo tendrá 2 facturas asociadas
 * por `ordenId` — la del chequeo previo (CG, sin piezas) y la de la reparación
 * (con piezas). Usar `docs[0]` no es determinístico y puede devolver la del
 * chequeo, reportando `costoPiezas=0` y inflando la comisión.
 *
 * Estrategia (de más explícita a más laxa):
 *  1. Si `orden.facturaId` está seteado, leer ese doc directamente. Es la
 *     factura activa: el reactivar limpia este campo y `FacturacionPendiente`
 *     lo repunta al emitir la nueva factura.
 *  2. Fallback: query por `ordenId` + filtrado client-side excluyendo
 *     facturas con `tipoCierre === 'solo_chequeo'` (denormalizado en
 *     creación). Si hay varias, prefiere la de mayor `createdAt`.
 *  3. Si todo lo anterior falla, usar la cotización vinculada.
 */
async function obtenerCostoPiezasDeOrden(orden: OrdenServicio): Promise<number> {
  // 1) Vía determinística: orden.facturaId apunta a la factura activa.
  if (orden.facturaId) {
    try {
      const facSnap = await getDoc(doc(db, 'facturas', orden.facturaId));
      if (facSnap.exists()) {
        const items = facSnap.data().items as ItemCotizacion[] | undefined;
        return calcularCostoPiezasDeItems(items);
      }
    } catch (err) {
      console.warn('No se pudo leer factura por orden.facturaId:', err);
    }
  }
  // 2) Fallback: query por ordenId con filtrado client-side
  try {
    const facturaQ = await getDocs(query(
      collection(db, 'facturas'),
      where('ordenId', '==', orden.id),
    ));
    if (!facturaQ.empty) {
      // Excluir facturas del chequeo previo (denormalizado en factura)
      const facturasReparacion = facturaQ.docs.filter(d => {
        const data = d.data();
        return data.tipoCierre !== 'solo_chequeo';
      });
      // Si tras filtrar quedan candidatas, tomar la más reciente
      const candidatas = facturasReparacion.length > 0 ? facturasReparacion : facturaQ.docs;
      const ordenadas = [...candidatas].sort((a, b) => {
        const ta = (a.data().createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
        const tb = (b.data().createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
        return tb - ta;
      });
      const items = ordenadas[0].data().items as ItemCotizacion[] | undefined;
      const costo = calcularCostoPiezasDeItems(items);
      if (costo > 0) return costo;
    }
  } catch (err) {
    console.warn('No se pudo leer factura vinculada para costo de piezas:', err);
  }
  // 3) Fallback a cotización vinculada
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
 * Resultado del cálculo proporcional por técnico — función pura.
 *
 * - `proporcionItems` está en [0..1] y representa la suma de proporciones
 *   de los items asignados a este técnico, sobre la suma total de
 *   `montoBase` de TODOS los items (incluso los que no tienen tecnicoId).
 * - `baseSinItbisAsignada` es la suma de `precio * cantidad` de SUS items
 *   (ya sin ITBIS, ver convención en JSDoc de `calcularComisionesProporcionales`).
 */
export interface ComisionPorTecnicoCalculada {
  tecnicoId: string;
  tecnicoNombre: string;
  monto: number;
  porcentaje: number;
  proporcionItems: number;
  itemsAsignados: number;
  baseSinItbisAsignada: number;
}

/** Helper interno: redondeo a 2 decimales monetarios. */
function redondearMonto(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula comisiones proporcionales por técnico a partir de un array de
 * `ItemCotizacion` con vendedor por línea. **Función pura**: no toca
 * Firestore. El caller debe pre-cargar los `Personal` y pasar `getTecnico`
 * como lookup sincrónico.
 *
 * Algoritmo (decisión 12 del sprint Conduces SIBS — orden estricto):
 *  1. `subtotalSinItbis = desglosarTotalConITBIS(totalConItbis, itbisPct).subtotal`
 *  2. Para cada item: `montoBase = item.precio * item.cantidad`.
 *     **NOTA**: `item.precio` en este sistema YA viene SIN ITBIS porque
 *     el ITBIS se aplica solo al total. La función NO desglosa el ITBIS
 *     por item — el caller debe pasar precios sin ITBIS.
 *  3. `sumaMontoBase = Σ(montoBase de TODOS los items)`.
 *  4. `gananciaNeta = subtotalSinItbis - costoPiezasTotal`.
 *     Si `gananciaNeta <= 0` → `[]` (sin ganancia, sin comisión).
 *  5. Para cada técnico (con porcentaje > 0):
 *     `proporcionItems = Σ(montoBase de SUS items) / sumaMontoBase`
 *     `monto = round2(gananciaNeta * proporcionItems * porcentaje / 100)`.
 *
 * **Anti-patrón prohibido (NO hacer):** usar `totalConItbis` en numerador
 * o denominador de `proporcionItems`. Siempre `montoBase` (sin ITBIS) en
 * ambos lados. Si el ITBIS entrara al cálculo, las comisiones quedarían
 * infladas ~18%. Ver decisión 12 del sprint.
 *
 * Orden de retorno: estable, por orden de aparición del PRIMER item del
 * técnico en el array `items`.
 */
export function calcularComisionesProporcionales(args: {
  items: ItemCotizacion[];
  totalConItbis: number;
  costoPiezasTotal: number;
  itbisPorcentaje?: number;
  getTecnico: (tecnicoId: string) => { nombre: string; porcentaje: number };
}): ComisionPorTecnicoCalculada[] {
  const { items, totalConItbis, costoPiezasTotal, itbisPorcentaje, getTecnico } = args;
  if (!Array.isArray(items) || items.length === 0) return [];

  const itbisPct = typeof itbisPorcentaje === 'number' && itbisPorcentaje >= 0
    ? itbisPorcentaje
    : ITBIS_PORCENTAJE;

  const { subtotal: subtotalSinItbis } = desglosarTotalConITBIS(totalConItbis, itbisPct);

  // Suma del montoBase de TODOS los items (incluyendo los sin tecnicoId).
  // Esto es el denominador de proporciones — la sumaMontoBase representa el
  // 100% del precio facturado SIN ITBIS.
  const sumaMontoBase = items.reduce((acc, it) => {
    const cantidad = typeof it.cantidad === 'number' ? it.cantidad : 0;
    const precio = typeof it.precio === 'number' ? it.precio : 0;
    return acc + (precio * cantidad);
  }, 0);

  if (sumaMontoBase <= 0) return [];

  const gananciaNeta = subtotalSinItbis - costoPiezasTotal;
  if (gananciaNeta <= 0) return [];

  // Acumular por técnico, manteniendo orden de primera aparición.
  const orden: string[] = [];
  const acumuladores = new Map<string, {
    tecnicoId: string;
    tecnicoNombre: string;
    porcentaje: number;
    baseSinItbisAsignada: number;
    itemsAsignados: number;
  }>();

  for (const it of items) {
    const tecnicoId = it.tecnicoId;
    if (!tecnicoId) continue; // línea sin técnico → no genera comisión
    const cantidad = typeof it.cantidad === 'number' ? it.cantidad : 0;
    const precio = typeof it.precio === 'number' ? it.precio : 0;
    const montoBase = precio * cantidad;

    let bucket = acumuladores.get(tecnicoId);
    if (!bucket) {
      const info = getTecnico(tecnicoId);
      // Si retorna porcentaje 0 o falsy, el técnico no genera comisión (línea muerta).
      if (!info || !info.porcentaje || info.porcentaje <= 0) continue;
      bucket = {
        tecnicoId,
        tecnicoNombre: info.nombre || it.tecnicoNombre || 'Técnico',
        porcentaje: info.porcentaje,
        baseSinItbisAsignada: 0,
        itemsAsignados: 0,
      };
      acumuladores.set(tecnicoId, bucket);
      orden.push(tecnicoId);
    }
    bucket.baseSinItbisAsignada += montoBase;
    bucket.itemsAsignados += 1;
  }

  const resultados: ComisionPorTecnicoCalculada[] = [];
  for (const tecnicoId of orden) {
    const b = acumuladores.get(tecnicoId)!;
    const proporcionItems = b.baseSinItbisAsignada / sumaMontoBase;
    const monto = redondearMonto(gananciaNeta * proporcionItems * (b.porcentaje / 100));
    resultados.push({
      tecnicoId: b.tecnicoId,
      tecnicoNombre: b.tecnicoNombre,
      monto,
      porcentaje: b.porcentaje,
      proporcionItems: redondearMonto(proporcionItems * 10000) / 10000, // 4 decimales para reportes
      itemsAsignados: b.itemsAsignados,
      baseSinItbisAsignada: redondearMonto(b.baseSinItbisAsignada),
    });
  }

  return resultados;
}

/**
 * Wrapper Firestore para `calcularComisionesProporcionales`. Crea/actualiza
 * docs en `comisiones` (uno por técnico distinto) usando idempotencia por
 * `(ordenId, tecnicoId)` y limpia comisiones huérfanas tras una re-emisión
 * de conduce con técnicos distintos a los previos.
 *
 * Política de re-emisión (decisión 20 #3 + H9 del sprint):
 *  - Comisión existente para tecnicoId que YA NO aparece en items:
 *      - Si está `liquidada` → preservar + marcar `obsoletaPorReemisionConduce: true`.
 *      - Si está `pendiente` → eliminar.
 *  - Comisión existente para tecnicoId que SÍ aparece (recalculo):
 *      - Si está `liquidada` → preservar tal cual (no se modifican montos).
 *      - Si está `pendiente` → updateDoc con nuevos montos + nueva quincena.
 *
 * Fallback legacy: si NINGÚN item trae `tecnicoId`, sintetiza una entrada
 * con `orden.tecnicoId`/`orden.tecnicoNombre` para preservar el flujo previo
 * a vendedor por línea (FaseStepper / OrdenesTablero / FacturacionPendiente).
 *
 * **NO**:
 *  - genera comisión si `orden.soloChequeo`.
 *  - lanza si Firestore falla en una sub-operación; loguea warn y continúa.
 */
export async function registrarComisionesPorItems(args: {
  orden: OrdenServicio;
  facturaId: string;
  facturaNumero: string;
  totalFactura: number;
  items: ItemCotizacion[];
  userProfile: Usuario | null;
  itbisPorcentaje?: number;
}): Promise<{
  comisiones: Array<{
    comisionId: string;
    tecnicoId: string;
    tecnicoNombre: string;
    monto: number;
    porcentaje: number;
  }>;
  totalAgregado: number;
  preservadasPorLiquidacion: number;
  eliminadasHuerfanas: number;
}> {
  const { orden, facturaId, facturaNumero, totalFactura, userProfile, itbisPorcentaje } = args;
  const items = args.items || [];
  const usuario = userProfile?.nombre || 'Sistema';

  // Detectar órdenes sintéticas creadas por flujos manuales (`FacturaCrearModal`
  // arma una `OrdenServicio`-like con id `factura-manual-{facturaRef.id}`).
  // Estas IDs NO existen en `ordenes_servicio`, así que cualquier `updateDoc`
  // contra esa colección emite warn ruidoso (`not-found`). El audit de la
  // orden se skipea — pero las comisiones siguen escribiéndose normalmente
  // en la colección `comisiones` (la auditoría detallada se registra ahí).
  const esOrdenSintetica = typeof orden.id === 'string' && orden.id.startsWith('factura-manual-');

  // Caso 1: chequeo nunca genera comisión.
  if (orden.soloChequeo) {
    return { comisiones: [], totalAgregado: 0, preservadasPorLiquidacion: 0, eliminadasHuerfanas: 0 };
  }
  // Caso 2: sin items, nada que calcular.
  if (items.length === 0) {
    return { comisiones: [], totalAgregado: 0, preservadasPorLiquidacion: 0, eliminadasHuerfanas: 0 };
  }

  // Caso 3 (legacy fallback): si ningún item trae tecnicoId, sintetizar
  // todos con orden.tecnicoId — preserva flujo legacy y mantiene única
  // ruta de cálculo (usa la misma función pura). Si la orden tampoco tiene
  // técnico, retornamos vacío (no hay a quién pagar comisión).
  let itemsParaCalculo: ItemCotizacion[] = items;
  const algunoConTecnico = items.some(i => !!i.tecnicoId);
  if (!algunoConTecnico) {
    if (!orden.tecnicoId) {
      return { comisiones: [], totalAgregado: 0, preservadasPorLiquidacion: 0, eliminadasHuerfanas: 0 };
    }
    itemsParaCalculo = items.map(i => ({
      ...i,
      tecnicoId: orden.tecnicoId,
      tecnicoNombre: orden.tecnicoNombre,
    }));
  }

  const costoPiezasTotal = calcularCostoPiezasDeItems(items);

  // Pre-cargar Personal de los técnicos distintos (en paralelo).
  const tecnicoIdsDistintos = Array.from(new Set(
    itemsParaCalculo.flatMap(i => (i.tecnicoId ? [i.tecnicoId] : [])),
  ));
  const lookup = new Map<string, { nombre: string; porcentaje: number }>();
  await Promise.all(tecnicoIdsDistintos.map(async tid => {
    try {
      const snap = await getDoc(doc(db, 'personal', tid));
      if (snap.exists()) {
        const personal = { id: snap.id, ...snap.data() } as Personal;
        lookup.set(tid, {
          nombre: personal.nombre || 'Técnico',
          porcentaje: obtenerPorcentajeComision(personal),
        });
      } else {
        console.error(`[comisiones] Tecnico huerfano detectado: tecnicoId=${tid} en orden=${orden.id}. Comision skipeada (0%)`);
      }
    } catch (err) {
      console.warn(`[comisiones] error leyendo personal/${tid}:`, err);
    }
  }));

  const calculadas = calcularComisionesProporcionales({
    items: itemsParaCalculo,
    totalConItbis: totalFactura,
    costoPiezasTotal,
    itbisPorcentaje,
    getTecnico: tid => lookup.get(tid) || { nombre: '', porcentaje: 0 },
  });

  const tecnicoIdsCalculados = new Set(calculadas.map(c => c.tecnicoId));
  const fechaCobro = new Date();
  const quincena = calcularQuincenaActual(fechaCobro);
  const desgloseTotal = desglosarTotalConITBIS(totalFactura, itbisPorcentaje);

  // Leer todas las comisiones existentes para esta orden (cleanup huérfanas
  // + idempotencia por tecnicoId).
  let docsExistentes: Array<{ id: string; data: Record<string, unknown> }> = [];
  try {
    const existQ = await getDocs(query(
      collection(db, 'comisiones'),
      where('ordenId', '==', orden.id),
    ));
    docsExistentes = existQ.docs.map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  } catch (err) {
    console.warn('[comisiones] no se pudo leer comisiones existentes:', err);
  }

  let preservadasPorLiquidacion = 0;
  let eliminadasHuerfanas = 0;

  // Cleanup: comisiones existentes cuyo tecnicoId YA NO aparece en items.
  for (const ex of docsExistentes) {
    const exTecnicoId = (ex.data.tecnicoId as string) || '';
    if (!exTecnicoId) continue;
    if (tecnicoIdsCalculados.has(exTecnicoId)) continue; // se maneja en el upsert abajo
    const estadoLiq = ex.data.estadoLiquidacion as string | undefined;
    if (estadoLiq === 'liquidada') {
      // Preservar + marcar como obsoleta por re-emisión.
      try {
        await updateDoc(doc(db, 'comisiones', ex.id), {
          obsoletaPorReemisionConduce: true,
          updatedAt: Timestamp.now(),
        });
        preservadasPorLiquidacion += 1;
      } catch (err) {
        console.warn(`[comisiones] no se pudo marcar obsoleta ${ex.id}:`, err);
      }
    } else {
      // Pendiente: borrar.
      try {
        await deleteDoc(doc(db, 'comisiones', ex.id));
        eliminadasHuerfanas += 1;
      } catch (err) {
        console.warn(`[comisiones] no se pudo eliminar huérfana ${ex.id}:`, err);
      }
    }
  }

  // Upsert por (ordenId, tecnicoId).
  const comisionesEscritas: Array<{
    comisionId: string;
    tecnicoId: string;
    tecnicoNombre: string;
    monto: number;
    porcentaje: number;
  }> = [];

  for (const c of calculadas) {
    const existente = docsExistentes.find(d => (d.data.tecnicoId as string) === c.tecnicoId);
    const itbisMontoTotal = desgloseTotal.itbis;

    // Si existe Y está liquidada: preservar tal cual. NO reescribir montos
    // ni quincena (decisión 20 H9: respetar lo que ya pagó nómina).
    if (existente && (existente.data.estadoLiquidacion as string) === 'liquidada') {
      comisionesEscritas.push({
        comisionId: existente.id,
        tecnicoId: c.tecnicoId,
        tecnicoNombre: c.tecnicoNombre,
        monto: typeof existente.data.comisionMonto === 'number'
          ? (existente.data.comisionMonto as number)
          : c.monto,
        porcentaje: typeof existente.data.comisionPorcentaje === 'number'
          ? (existente.data.comisionPorcentaje as number)
          : c.porcentaje,
      });
      continue;
    }

    // Strip undefined antes de Firestore — convención CLAUDE.md.
    const payload: Record<string, unknown> = {
      tecnicoId: c.tecnicoId,
      tecnicoNombre: c.tecnicoNombre,
      ordenId: orden.id,
      ordenNumero: orden.numero || '',
      clienteNombre: orden.clienteNombre || '',
      fechaCobro: Timestamp.fromDate(fechaCobro),
      precioFinal: totalFactura,
      subtotal: desgloseTotal.subtotal,
      itbisMonto: itbisMontoTotal,
      costoPiezas: costoPiezasTotal,
      basePendienteComision: c.baseSinItbisAsignada,
      comisionPorcentaje: c.porcentaje,
      comisionMonto: c.monto,
      facturaId,
      facturaNumero,
      estadoLiquidacion: 'pendiente',
      quincenaAsignada: quincena,
      // Metadata específica del flujo proporcional (informativa, no rompe shape legacy)
      proporcionItems: c.proporcionItems,
      itemsAsignados: c.itemsAsignados,
      updatedAt: Timestamp.now(),
    };

    try {
      if (existente) {
        await updateDoc(doc(db, 'comisiones', existente.id), payload);
        comisionesEscritas.push({
          comisionId: existente.id,
          tecnicoId: c.tecnicoId,
          tecnicoNombre: c.tecnicoNombre,
          monto: c.monto,
          porcentaje: c.porcentaje,
        });
      } else {
        payload.createdAt = Timestamp.now();
        const ref = await addDoc(collection(db, 'comisiones'), payload);
        comisionesEscritas.push({
          comisionId: ref.id,
          tecnicoId: c.tecnicoId,
          tecnicoNombre: c.tecnicoNombre,
          monto: c.monto,
          porcentaje: c.porcentaje,
        });
      }
    } catch (err) {
      console.warn(`[comisiones] error escribiendo comisión para ${c.tecnicoId}:`, err);
    }
  }

  const totalAgregado = comisionesEscritas.reduce((acc, c) => acc + c.monto, 0);

  // Auditoría única (resumen) — no bloqueante. Skip para órdenes sintéticas
  // (`factura-manual-...`) porque no existen en `ordenes_servicio` y el
  // updateDoc emite warn ruidoso por cada conduce manual con técnicos.
  if (
    !esOrdenSintetica &&
    (comisionesEscritas.length > 0 || preservadasPorLiquidacion > 0 || eliminadasHuerfanas > 0)
  ) {
    try {
      const partes: string[] = [];
      if (comisionesEscritas.length > 0) {
        partes.push(`Comisiones generadas/actualizadas: ${comisionesEscritas.length} técnico(s) por RD$${redondearMonto(totalAgregado).toLocaleString('es-DO')}`);
      }
      if (preservadasPorLiquidacion > 0) {
        partes.push(`${preservadasPorLiquidacion} liquidada(s) preservada(s)`);
      }
      if (eliminadasHuerfanas > 0) {
        partes.push(`${eliminadasHuerfanas} pendiente(s) eliminada(s)`);
      }
      const reg = crearRegistroAuditoria(
        usuario,
        'cierre',
        `Factura ${facturaNumero} — ${partes.join('. ')}`,
        'comision',
        '',
        `RD$${redondearMonto(totalAgregado).toLocaleString('es-DO')}`,
      );
      await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
        auditoria: arrayUnion(reg),
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.warn('[comisiones] no se pudo registrar auditoría agregada:', err);
    }
  }

  return {
    comisiones: comisionesEscritas,
    totalAgregado: redondearMonto(totalAgregado),
    preservadasPorLiquidacion,
    eliminadasHuerfanas,
  };
}

/**
 * Crea o actualiza un ComisionRegistro a partir de una factura recién generada.
 * Wrapper backwards-compat: si los items traen `tecnicoId` por línea (vendedor
 * por línea), delega a `registrarComisionesPorItems` y adapta el shape de
 * retorno. Si NO traen `tecnicoId`, usa el flujo legacy (1 técnico por orden).
 *
 * **Shape de retorno**:
 *  - 1 técnico (legacy o N=1): `comisionId`, `tecnicoId`, `tecnicoNombre`,
 *    `comisionMonto` poblados.
 *  - N>1 técnicos: `comisionId=null`, `tecnicoId=''`, `tecnicoNombre='N técnicos'`,
 *    `comisionMonto=totalAgregado`. El caller debe denormalizar como agregado.
 *  - 0 técnicos válidos: `comisionId=null`, `comisionMonto=0`.
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
  const itemsArr = items || [];

  // Detectar vendedor por línea — si CUALQUIER item trae tecnicoId, delegar
  // al nuevo flujo proporcional. Una vez delegamos, registrarComisionesPorItems
  // hace todo: cleanup, upsert, auditoría.
  const algunItemConTecnico = itemsArr.some(i => !!i.tecnicoId);

  if (algunItemConTecnico) {
    // Pre-calculamos desglose para retornar shape compatible.
    const itbisPct = typeof itbisPorcentaje === 'number' && itbisPorcentaje >= 0
      ? itbisPorcentaje
      : ITBIS_PORCENTAJE;
    const desg = desglosarTotalConITBIS(totalFactura, itbisPct);
    const costoPiezas = calcularCostoPiezasDeItems(itemsArr);
    const gananciaNeta = Math.max(0, redondearMonto(desg.subtotal - costoPiezas));

    const result = await registrarComisionesPorItems({
      orden,
      facturaId,
      facturaNumero,
      totalFactura,
      items: itemsArr,
      userProfile,
      itbisPorcentaje,
    });

    if (result.comisiones.length === 1) {
      const c = result.comisiones[0];
      return {
        comisionId: c.comisionId,
        comisionMonto: c.monto,
        gananciaNeta,
        subtotal: desg.subtotal,
        itbis: desg.itbis,
        costoPiezas,
        porcentaje: c.porcentaje,
        tecnicoId: c.tecnicoId,
        tecnicoNombre: c.tecnicoNombre,
      };
    }
    if (result.comisiones.length > 1) {
      // N>1: shape "agregado". Caller (en C4) detecta por tecnicoId='' o comisionId=null.
      return {
        comisionId: null,
        comisionMonto: result.totalAgregado,
        gananciaNeta,
        subtotal: desg.subtotal,
        itbis: desg.itbis,
        costoPiezas,
        porcentaje: 0, // mixto, no aplica un único %
        tecnicoId: '',
        tecnicoNombre: 'N técnicos',
      };
    }
    // 0 técnicos válidos
    return {
      comisionId: null, comisionMonto: 0, gananciaNeta, subtotal: desg.subtotal, itbis: desg.itbis,
      costoPiezas, porcentaje: 0, tecnicoId: '', tecnicoNombre: '',
    };
  }

  // ---------------- Flujo legacy (sin tecnicoId por línea) ----------------
  // Se preserva exactamente el comportamiento previo a Conduces SIBS C1.

  if (!orden.tecnicoId) {
    return {
      comisionId: null, comisionMonto: 0, gananciaNeta: 0, subtotal: 0, itbis: 0, costoPiezas: 0,
      porcentaje: 0, tecnicoId: '', tecnicoNombre: '',
    };
  }
  // El chequeo (RD$2,000) NUNCA genera comisión, ni siquiera si el cliente
  // luego regresa para reparar. Si el cliente regresa, esa nueva orden se
  // reactiva con `reactivadaPostChequeo=true` y la comisión se paga sobre el
  // monto de la reparación, no incluye los 2,000 del chequeo previo.
  if (orden.soloChequeo) {
    return {
      comisionId: null, comisionMonto: 0, gananciaNeta: 0, subtotal: 0, itbis: 0, costoPiezas: 0,
      porcentaje: 0, tecnicoId: orden.tecnicoId, tecnicoNombre: orden.tecnicoNombre || '',
    };
  }

  const { personal, porcentaje } = await obtenerTecnicoParaComision(orden.tecnicoId);
  const tecnicoNombre = orden.tecnicoNombre || personal?.nombre || 'Técnico';

  const desglose = calcularDesgloseFactura({ total: totalFactura, items: itemsArr, porcentajeTecnico: porcentaje, itbisPorcentaje });

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
    // El chequeo (RD$2,000) NUNCA genera comisión, ni siquiera si el cliente
    // luego regresa para reparar. Si el cliente regresa, esa nueva orden se
    // reactiva con `reactivadaPostChequeo=true` y la comisión se paga sobre el
    // monto de la reparación (no incluye los 2,000 del chequeo previo).
    if (orden.soloChequeo) {
      return { creada: false, razon: 'solo_chequeo_sin_comision' };
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

/**
 * Elimina/obsoleta las comisiones asociadas a una factura. Se invoca cuando
 * la factura se borra (cascade desde `Facturas.tsx:handleDelete` o desde el
 * flujo de eliminación de orden si llegara a borrar la factura).
 *
 * Reglas (sprint Conduces SIBS C4b — security audit):
 *  - Comisiones `pendientes` → DELETE (no se pagaron, se pueden borrar limpio).
 *  - Comisiones `liquidadas` → preservar + setear `obsoletaPorEliminacionFactura: true`
 *    (forensia contable: nómina ya pagó, no se debe perder el registro).
 *  - Comisiones ya marcadas `obsoletaPorEliminacionFactura === true` → SKIP
 *    (idempotencia: la 2da invocación es no-op real).
 *  - Una sola transacción por comisión (evita race delete-vs-liquidación).
 *  - Audit log en `auditoria_admin` con snapshot completo (`comisionesAfectadas`).
 *
 * Flag `obsoletaPorEliminacionFactura` es ortogonal a `obsoletaPorReemisionConduce`:
 * una comisión puede tener ambos true. Esta función NUNCA toca el flag de re-emisión.
 *
 * No bloquea el caller si una sub-operación falla — loguea warn y continúa.
 *
 * @param facturaId — ID del doc de factura. Validado: `''` o falsy lanza.
 * @param motivoEliminacion — texto opcional para forensia.
 * @param solicitanteUid — `userProfile?.id` (ya unificado en C4b).
 * @param solicitanteNombre — `userProfile?.nombre`.
 * @returns conteo `{ eliminadas, preservadas }`.
 */
export async function eliminarComisionesDeFactura(args: {
  facturaId: string;
  motivoEliminacion?: string;
  solicitanteUid?: string;
  solicitanteNombre?: string;
}): Promise<{ eliminadas: number; preservadas: number }> {
  const { facturaId, motivoEliminacion, solicitanteUid, solicitanteNombre } = args;

  // Security #5: validación shape — sin esto un bug podría disparar wipe masivo.
  if (!facturaId || facturaId.trim() === '') {
    throw new Error('facturaId requerido');
  }

  let docs: Array<{ id: string; data: Record<string, unknown> }> = [];
  try {
    const snap = await getDocs(query(
      collection(db, 'comisiones'),
      where('facturaId', '==', facturaId),
    ));
    docs = snap.docs.map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  } catch (err) {
    // Security #6: PII fuera de logs — solo facturaId.
    console.warn(`[comisiones] eliminarComisionesDeFactura: no se pudo leer comisiones para facturaId=${facturaId}:`, err);
    return { eliminadas: 0, preservadas: 0 };
  }

  let eliminadas = 0;
  let preservadas = 0;
  // Snapshot completo para audit log (forensia contable). NO incluye PII en
  // logs de consola — solo se persiste en la colección `auditoria_admin`.
  // Los campos `quincenaAsignada` y `comisionPorcentaje` se incluyen para
  // permitir reconstrucción contable post-incidente (N3 cleanup post-SIBS):
  // sin ellos, recuperar a qué quincena se asignó originalmente la comisión
  // requería leer el snapshot de Firestore. Ambos pueden ser `null` si la
  // comisión vieja no los tenía persistidos.
  const comisionesAfectadas: Array<{
    comisionId: string;
    tecnicoId: string;
    tecnicoNombre: string;
    monto: number;
    estadoPrevio: string;
    accion: 'eliminada' | 'preservada' | 'skip_ya_obsoleta';
    quincenaAsignada: string | null;
    comisionPorcentaje: number | null;
  }> = [];

  for (const ex of docs) {
    const comisionId = ex.id;
    const tecnicoId = (ex.data.tecnicoId as string) || '';
    const tecnicoNombre = (ex.data.tecnicoNombre as string) || '';
    const monto = typeof ex.data.comisionMonto === 'number' ? (ex.data.comisionMonto as number) : 0;
    const quincenaAsignada = typeof ex.data.quincenaAsignada === 'string'
      ? (ex.data.quincenaAsignada as string)
      : null;
    const comisionPorcentaje = typeof ex.data.comisionPorcentaje === 'number'
      ? (ex.data.comisionPorcentaje as number)
      : null;
    const yaObsoleta = ex.data.obsoletaPorEliminacionFactura === true;

    // Security #4: idempotencia — skip si ya está marcada por esta misma causa.
    if (yaObsoleta) {
      comisionesAfectadas.push({
        comisionId,
        tecnicoId,
        tecnicoNombre,
        monto,
        estadoPrevio: (ex.data.estadoLiquidacion as string) || 'desconocido',
        accion: 'skip_ya_obsoleta',
        quincenaAsignada,
        comisionPorcentaje,
      });
      continue;
    }

    try {
      // Security #2: runTransaction por comisión — evita race delete-vs-liquidación.
      const accionFinal = await runTransaction(db, async tx => {
        const ref = doc(db, 'comisiones', comisionId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return 'skip' as const;
        const data = snap.data();
        // Re-check idempotencia dentro de la transacción.
        if (data.obsoletaPorEliminacionFactura === true) return 'skip' as const;
        // Security #1: CAMPO CORRECTO — `estadoLiquidacion`.
        if (data.estadoLiquidacion === 'liquidada') {
          // Security #7: NO sobrescribir `obsoletaPorReemisionConduce` —
          // los flags son ortogonales. Solo setea el flag de eliminación.
          const payload: Record<string, unknown> = {
            obsoletaPorEliminacionFactura: true,
            eliminadaEn: serverTimestamp(),
          };
          if (motivoEliminacion) payload.motivoEliminacion = motivoEliminacion;
          tx.update(ref, payload);
          return 'preservada' as const;
        }
        // Pendiente (o cualquier otro estado no liquidado) → delete real.
        tx.delete(ref);
        return 'eliminada' as const;
      });

      if (accionFinal === 'eliminada') {
        eliminadas += 1;
        comisionesAfectadas.push({
          comisionId,
          tecnicoId,
          tecnicoNombre,
          monto,
          estadoPrevio: (ex.data.estadoLiquidacion as string) || 'pendiente',
          accion: 'eliminada',
          quincenaAsignada,
          comisionPorcentaje,
        });
      } else if (accionFinal === 'preservada') {
        preservadas += 1;
        comisionesAfectadas.push({
          comisionId,
          tecnicoId,
          tecnicoNombre,
          monto,
          estadoPrevio: 'liquidada',
          accion: 'preservada',
          quincenaAsignada,
          comisionPorcentaje,
        });
      }
      // 'skip' (race ganada por otro write) — no contamos ni audita.
    } catch (err) {
      // Security #6: PII fuera de logs — solo IDs.
      console.warn(`[comisiones] eliminarComisionesDeFactura: error procesando comisionId=${comisionId} facturaId=${facturaId}:`, err);
    }
  }

  // Security #3: audit log con snapshot completo, solo si hubo cambios reales
  // (idempotencia: 2da invocación sin cambios no duplica audit).
  const huboCambios = eliminadas > 0 || preservadas > 0;
  if (huboCambios) {
    try {
      const auditPayload: Record<string, unknown> = {
        accion: 'eliminar_comisiones_factura',
        objetivoTipo: 'factura',
        objetivoId: facturaId,
        comisionesAfectadas,
        eliminadas,
        preservadas,
        timestamp: serverTimestamp(),
      };
      if (motivoEliminacion) auditPayload.motivoEliminacion = motivoEliminacion;
      if (solicitanteUid) auditPayload.solicitanteUid = solicitanteUid;
      if (solicitanteNombre) auditPayload.solicitanteNombre = solicitanteNombre;
      // Strip undefined defensivo.
      const auditLimpio = Object.fromEntries(
        Object.entries(auditPayload).filter(([, v]) => v !== undefined),
      );
      await addDoc(collection(db, 'auditoria_admin'), auditLimpio);
    } catch (err) {
      // Audit no bloquea — pero loggeamos sin PII.
      console.error(`[comisiones] eliminarComisionesDeFactura: audit log falló para facturaId=${facturaId}:`, err);
    }
  }

  return { eliminadas, preservadas };
}

/**
 * SPRINT-GARANTIA-FLUJO-COMPLETO Fase A (2026-05-25).
 *
 * Aplica el descuento por garantía al técnico ORIGINAL cuando se cierra una
 * orden marcada como `esGarantia: true`. Las reglas de Jorge (entrevista
 * 2026-05-24):
 *
 *  1. El descuento es el 10% del costo de PIEZAS de la re-reparación
 *     (NO el 100% de la comisión, como hacía la lógica vieja en Citas.tsx).
 *  2. El técnico ORIGINAL conserva su comisión original (NO se marca
 *     `estaAnulada=true`).
 *  3. Si no hay gasto en piezas (costoPiezas = 0), no se aplica descuento.
 *  4. El descuento se aplica al original siempre que haya piezas, cubra él
 *     mismo u otro técnico la garantía.
 *
 * Idempotente: si re-corremos el cierre (caso edge — wizard reabierto y vuelve
 * a guardar), reemplaza el descuento previo con el nuevo cálculo. Audit log
 * `descuento_garantia_tecnico` siempre se emite con el monto efectivo.
 *
 * Devuelve el monto efectivamente descontado (0 si no se aplicó). No tira
 * excepciones — si la comisión original no existe (orden previa sin
 * comisión registrada), retorna 0 silenciosamente y loggea. El caller debe
 * llamarse desde un try/catch para que el cierre no se rompa por esto.
 */
export async function aplicarDescuentoGarantiaPorPiezas(args: {
  ordenGarantiaId: string;
  ordenOriginalId: string;
  tecnicoOriginalUid: string;
  costoPiezasReReparacion: number;
  facturaIdReasignada?: string;
  conduceNumeroOriginal?: string;
  solicitanteUid?: string;
  solicitanteNombre?: string;
  motivoLabel?: string;
}): Promise<{ aplicado: boolean; monto: number; comisionId: string | null; razon?: string }> {
  const {
    ordenGarantiaId,
    ordenOriginalId,
    tecnicoOriginalUid,
    costoPiezasReReparacion,
    facturaIdReasignada,
    conduceNumeroOriginal,
    solicitanteUid,
    solicitanteNombre,
    motivoLabel,
  } = args;

  // Guardrails.
  if (!ordenOriginalId || !tecnicoOriginalUid) {
    return { aplicado: false, monto: 0, comisionId: null, razon: 'faltan_referencias' };
  }
  if (!Number.isFinite(costoPiezasReReparacion) || costoPiezasReReparacion <= 0) {
    return { aplicado: false, monto: 0, comisionId: null, razon: 'sin_piezas' };
  }

  const PORCENTAJE = 0.10; // 10% del costo de piezas — regla de Jorge.
  const montoDescuento = -Math.round(costoPiezasReReparacion * PORCENTAJE * 100) / 100;

  // Buscar la comisión original — por ordenId + tecnicoId. La indexación
  // viene del flujo legacy (P-006: tecnicoId persiste auth.uid post-c4be345).
  let comisionId: string | null = null;
  try {
    const snap = await getDocs(query(
      collection(db, 'comisiones'),
      where('ordenId', '==', ordenOriginalId),
      where('tecnicoId', '==', tecnicoOriginalUid),
    ));
    if (snap.empty) {
      console.warn(
        `[garantia-fase-A] No se encontró comisión original para descontar (ordenOriginal=${ordenOriginalId}, tecnicoOriginal=${tecnicoOriginalUid}). Probablemente la orden previa no generó comisión.`,
      );
      return { aplicado: false, monto: 0, comisionId: null, razon: 'comision_original_no_existe' };
    }
    comisionId = snap.docs[0].id;
  } catch (err) {
    console.error(
      `[garantia-fase-A] Error buscando comisión original (ordenOriginal=${ordenOriginalId}):`,
      err,
    );
    return { aplicado: false, monto: 0, comisionId: null, razon: 'error_buscando_comision' };
  }

  const ahoraTs = Timestamp.now();
  const descuentoPayload: Record<string, unknown> = {
    monto: montoDescuento,
    facturaIdReasignada: facturaIdReasignada || '',
    conduceNumero: conduceNumeroOriginal || '',
    ordenIdReasignada: ordenGarantiaId,
    motivo: motivoLabel || 'Garantía — 10% de piezas',
    aplicadoEn: ahoraTs,
    aplicadoPor: solicitanteUid || '',
    aplicadoPorNombre: solicitanteNombre || 'Sistema',
  };
  // Notas opcionales removidas — el motivo ya captura el contexto.
  const descuentoLimpio = Object.fromEntries(
    Object.entries(descuentoPayload).filter(([, v]) => v !== undefined),
  );

  try {
    // SPRINT-GARANTIA Fase A: NO marcar `estaAnulada=true` — la comisión
    // original se conserva, solo se aplica el descuento parcial del 10%.
    await updateDoc(doc(db, 'comisiones', comisionId), {
      descuentoPorGarantia: descuentoLimpio,
      updatedAt: ahoraTs,
    });
  } catch (err) {
    console.error(
      `[garantia-fase-A] Error actualizando comisión ${comisionId}:`,
      err,
    );
    return { aplicado: false, monto: 0, comisionId, razon: 'error_update_comision' };
  }

  // Audit log (no crítico — si falla, el descuento ya se aplicó).
  try {
    const auditPayload: Record<string, unknown> = {
      accion: 'descuento_garantia_tecnico',
      solicitanteUid: solicitanteUid || null,
      solicitanteNombre: solicitanteNombre || null,
      objetivoTipo: 'comision',
      objetivoId: comisionId,
      tecnicoAfectadoUid: tecnicoOriginalUid,
      monto: montoDescuento,
      costoPiezasReReparacion,
      porcentajeAplicado: PORCENTAJE,
      ordenIdOriginal: ordenOriginalId,
      ordenIdReasignada: ordenGarantiaId,
      conduceNumero: conduceNumeroOriginal || null,
      motivo: motivoLabel || 'Garantía — 10% de piezas',
      timestamp: ahoraTs,
    };
    await addDoc(
      collection(db, 'auditoria_admin'),
      Object.fromEntries(Object.entries(auditPayload).filter(([, v]) => v !== undefined)),
    );
  } catch (errAudit) {
    console.warn('[garantia-fase-A] audit log descuento_garantia_tecnico falló:', errAudit);
  }

  return { aplicado: true, monto: montoDescuento, comisionId };
}
