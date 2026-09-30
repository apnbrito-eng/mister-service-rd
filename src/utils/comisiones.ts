import { planificarAjusteGarantia } from './ajusteGarantia';
import {
  collection, addDoc, doc, getDoc, getDocs, query, where, Timestamp, arrayUnion,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
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
    // Febrero no tiene día 30: en marzo Q1 comienza el día 1.
    // Construir '30 de febrero' directamente saltaba al 1/2 de marzo.
    const diasMesAnterior = new Date(y, m - 1, 0).getDate();
    const inicio = diasMesAnterior >= 30
      ? new Date(y, m - 2, 30, 0, 0, 0)
      : new Date(y, m - 1, 1, 0, 0, 0);
    const fin = new Date(y, m - 1, 14, 23, 59, 59, 999);
    return { inicio, fin };
  }
  // Q2 cubre 15-29 del mes (o hasta el último día si febrero no bisiesto, 28
  // días). Sin este clamp, `new Date(y, 1, 29)` para feb no bisiesto hace
  // rollover a 1 de marzo, incluyendo un día extra en el rango. Fix #77.
  const ultimoDia = new Date(y, m, 0).getDate();
  const diaFin = Math.min(29, ultimoDia);
  const inicio = new Date(y, m - 1, 15, 0, 0, 0);
  const fin = new Date(y, m - 1, diaFin, 23, 59, 59, 999);
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

function obtenerPorcentajeComision(personal: Personal): number {
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
  if (!tecnicoId) throw new Error('Comisión bloqueada: falta técnico asignado.');
  const [directo, porUid] = await Promise.all([
    getDoc(doc(db, 'personal', tecnicoId)),
    getDocs(query(collection(db, 'personal'), where('uid', '==', tecnicoId))),
  ]);
  const candidatos = new Map<string, Personal>();
  if (directo.exists()) candidatos.set(directo.id, { ...directo.data(), id: directo.id } as Personal);
  porUid.docs.forEach(d => candidatos.set(d.id, { ...d.data(), id: d.id } as Personal));
  if (candidatos.size !== 1) throw new Error(`Comisión bloqueada: identidad del técnico ${tecnicoId} ${candidatos.size ? 'ambigua' : 'no encontrada'}. Revisar Personal.`);
  const personal = [...candidatos.values()][0];
  const porcentaje = obtenerPorcentajeComision(personal);
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) throw new Error('Comisión bloqueada: porcentaje del técnico inválido.');
  return { personal, porcentaje };
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
      baseSinItbisAsignada: redondearMonto(gananciaNeta * proporcionItems),
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
async function reflejarDevengosOrden(orden: OrdenServicio) {
  const snap = await getDocs(query(collection(db, 'comisiones'), where('ordenId', '==', orden.id)));
  const comisiones = snap.docs.filter(d => !d.data().estaAnulada && d.data().estadoLiquidacion !== 'anulada').map(d => {
    const c = d.data();
    if (typeof c.comisionMonto !== 'number' || !Number.isFinite(c.comisionMonto) || !Number.isFinite(c.descuentoPorGarantia?.monto ?? 0)) throw new Error('Devengo con importe inválido; requiere conciliación.');
    return { comisionId: d.id, tecnicoId: c.tecnicoId || '', tecnicoNombre: c.tecnicoNombre || '',
      monto: Math.round((c.comisionMonto + (c.descuentoPorGarantia?.monto ?? 0)) * 100) / 100,
      porcentaje: typeof c.comisionPorcentaje === 'number' ? c.comisionPorcentaje : 0 };
  });
  return { comisiones, totalAgregado: comisiones.reduce((s, c) => s + c.monto, 0), preservadasPorLiquidacion: snap.docs.filter(d => d.data().estadoLiquidacion === 'liquidada').length,
    eliminadasHuerfanas: 0, fallidas: snap.docs.length || orden.soloChequeo ? [] : [{ tecnicoId: orden.tecnicoId || '', tecnicoNombre: orden.tecnicoNombre || '', monto: 0, error: 'No hay devengo registrado. Revisar comisión del trabajo terminado; emitir conduce no genera otro cálculo.' }] };
}

export async function registrarComisionesPorItems(args: {
  orden: OrdenServicio;
  /** Creación manual: conduce y todos sus devengos se persisten en una sola transacción. */
  conduceNuevo?: Record<string, unknown>;
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
  /**
   * SPRINT-FIX-COMISIONES-SILENCIOSAS (2026-09-09) — auditoría hallazgo E-1.
   * Comisiones que se calcularon pero NO se pudieron persistir en Firestore.
   * Antes el catch del bucle de escritura sólo hacía `console.warn` y seguía:
   * la comisión no entraba en `comisionesEscritas`, `totalAgregado` cuadraba
   * con las exitosas y el registro de auditoría quedaba internamente
   * coherente — el técnico se quedaba sin su comisión sin que nadie se
   * enterara. El caller DEBE revisar este array y avisar al usuario.
   */
  fallidas: Array<{
    tecnicoId: string;
    tecnicoNombre: string;
    monto: number;
    error: string;
  }>;
}> {
  const { orden, facturaId, facturaNumero, totalFactura, itbisPorcentaje, conduceNuevo } = args;
  if (!orden.id.startsWith('factura-manual-')) {
    if (conduceNuevo) throw new Error('Creación manual requiere orden sintética.');
    return reflejarDevengosOrden(orden);
  }
  const items = args.items || [];
  const asignados = items.some(i => i.tecnicoId) ? items : items.map(i => ({ ...i, tecnicoId: orden.tecnicoId }));
  const personas = new Map<string, { personal: Personal; porcentaje: number }>();
  for (const id of new Set(asignados.map(i => i.tecnicoId).filter((id): id is string => !!id))) {
    const r = await obtenerTecnicoParaComision(id);
    personas.set(id, { personal: r.personal!, porcentaje: r.porcentaje });
  }
  const normalizados = asignados.map(i => i.tecnicoId ? { ...i, tecnicoId: personas.get(i.tecnicoId)!.personal.id } : i);
  const porId = new Map([...personas.values()].map(p => [p.personal.id, p]));
  const costoPiezas = calcularCostoPiezasDeItems(items);
  const calculadas = orden.soloChequeo ? [] : calcularComisionesProporcionales({ items: normalizados, totalConItbis: totalFactura, costoPiezasTotal: costoPiezas, itbisPorcentaje,
    getTecnico: id => { const p = porId.get(id); if (!p) throw new Error('Técnico no identificado.'); return { nombre: p.personal.nombre || 'Técnico', porcentaje: p.porcentaje }; } });
  const legacy = await getDocs(query(collection(db, 'comisiones'), where('ordenId', '==', orden.id)));
  const facturaRef = doc(db, 'facturas', facturaId);
  const desglose = desglosarTotalConITBIS(totalFactura, itbisPorcentaje);
  return runTransaction(db, async tx => {
    const factura = await tx.get(facturaRef);
    const referencias = calculadas.map(c => doc(db, 'comisiones', `manual_${encodeURIComponent(facturaId)}_${encodeURIComponent(c.tecnicoId)}`));
    const actuales = await Promise.all(referencias.map(r => tx.get(r)));
    const anteriores = await Promise.all(legacy.docs.filter(d => !referencias.some(r => r.id === d.id)).map(d => tx.get(doc(db, 'comisiones', d.id))));
    const personalActual = await Promise.all([...porId.keys()].map(id => tx.get(doc(db, 'personal', id))));
    for (const p of personalActual) {
      const esperado = porId.get(p.id)!;
      if (!p.exists() || p.data().uid !== esperado.personal.uid || obtenerPorcentajeComision({ ...p.data(), id: p.id } as Personal) !== esperado.porcentaje) throw new Error('Configuración del técnico cambió; recarga.');
    }
    if (factura.exists() && factura.data().estado === 'anulada') throw new Error('Conduce anulado.');
    if (!conduceNuevo && !factura.exists()) throw new Error('El conduce debe existir antes de registrar comisiones.');
    if (factura.exists() && factura.data().total !== totalFactura) throw new Error('El total del conduce cambió.');
    const firmaItems = (lista: ItemCotizacion[]) => JSON.stringify(lista.map(i => [i.tipoItem || '', i.precio, i.cantidad || 1, i.costoCompra ?? null, i.tecnicoId || '']));
    if (factura.exists() && firmaItems(factura.data().items || []) !== firmaItems(items)) throw new Error('Los ítems del conduce cambiaron; no se recalcula un devengo existente.');
    const escritos: { comisionId: string; tecnicoId: string; tecnicoNombre: string; monto: number; porcentaje: number }[] = [];
    const nuevos: { ref: typeof facturaRef; payload: Record<string, unknown> }[] = [];
    let preservadasPorLiquidacion = 0;
    for (let i = 0; i < calculadas.length; i++) {
      const c = calculadas[i], p = porId.get(c.tecnicoId)!;
      const aliases = new Set([p.personal.id, p.personal.uid].filter(Boolean));
      const coincidentes = [...actuales, ...anteriores].filter(d => d.exists() && aliases.has(d.data().tecnicoId));
      if (coincidentes.length > 1) throw new Error('Comisiones duplicadas previas requieren conciliación.');
      if (coincidentes.length) {
        const d = coincidentes[0], raw = d.data()!;
        if (raw.estadoLiquidacion === 'liquidada') preservadasPorLiquidacion++;
        escritos.push({ comisionId: d.id, tecnicoId: raw.tecnicoId, tecnicoNombre: raw.tecnicoNombre, monto: raw.comisionMonto, porcentaje: raw.comisionPorcentaje });
        continue;
      }
      if (actuales[i].exists()) throw new Error('Identidad de comisión canónica inconsistente.');
      const ahora = Timestamp.now();
      const payload = { tecnicoId: p.personal.uid || p.personal.id, tecnicoNombre: c.tecnicoNombre,
        ordenId: orden.id, ordenNumero: orden.numero || '', clienteNombre: orden.clienteNombre || '',
        fechaCobro: ahora, precioFinal: totalFactura, subtotal: desglose.subtotal, itbisMonto: desglose.itbis,
        costoPiezas, basePendienteComision: c.baseSinItbisAsignada, comisionPorcentaje: c.porcentaje, comisionMonto: c.monto,
        facturaId, facturaNumero, estadoLiquidacion: 'pendiente', quincenaAsignada: calcularQuincenaActual(ahora.toDate()),
        proporcionItems: c.proporcionItems, itemsAsignados: c.itemsAsignados, createdAt: ahora, updatedAt: ahora };
      nuevos.push({ ref: referencias[i], payload });
      escritos.push({ comisionId: referencias[i].id, tecnicoId: payload.tecnicoId, tecnicoNombre: c.tecnicoNombre, monto: c.monto, porcentaje: c.porcentaje });
    }
    const totalAgregado = redondearMonto(escritos.reduce((s, c) => s + c.monto, 0));
    if (conduceNuevo && !factura.exists()) {
      const unica = escritos.length === 1 ? escritos[0] : null;
      const payload: Record<string, unknown> = { ...conduceNuevo, comisionTecnicoMonto: totalAgregado,
        comisionTecnicoId: unica?.tecnicoId || '', comisionTecnicoNombre: unica?.tecnicoNombre || (escritos.length ? 'N técnicos' : ''), comisionTecnicoPorcentaje: unica?.porcentaje || 0 };
      if (unica) payload.comisionRegistroId = unica.comisionId;
      tx.set(facturaRef, Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)));
    }
    for (const n of nuevos) tx.set(n.ref, n.payload);
    return { comisiones: escritos, totalAgregado, preservadasPorLiquidacion, eliminadasHuerfanas: 0, fallidas: [] };
  });
}

/** Compatibilidad: orden real refleja devengos vigentes; manual conserva reparto por ítems.
 * Emitir un conduce de orden nunca crea ni recalcula su comisión del trabajo.
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
}): Promise<{
  comisionId: string | null;
  comisionMonto: number;
  gananciaNeta: number;
  subtotal: number;
  itbis: number;
  costoPiezas: number;
  porcentaje: number;
  tecnicoId: string;
  tecnicoNombre: string;
  /**
   * SPRINT-FIX-COMISIONES-SILENCIOSAS (2026-09-09) — auditoría hallazgo E-1.
   * Cantidad de comisiones que se calcularon pero Firestore rechazó.
   * `> 0` significa que hay un técnico sin su comisión: el caller debe
   * avisar al usuario, NO tratar la operación como exitosa. Sin esto,
   * `comisionId: null` era indistinguible entre "no había a quién pagarle"
   * y "la escritura falló".
   */
  comisionesFallidas: number;
}> {
  const { orden, facturaId, facturaNumero, totalFactura, items, userProfile, itbisPorcentaje } = args;
  if (!orden.id.startsWith('factura-manual-')) {
    const r = await reflejarDevengosOrden(orden);
    const unica = r.comisiones.length === 1 ? r.comisiones[0] : null;
    return { comisionId: unica?.comisionId || null, comisionMonto: r.totalAgregado, gananciaNeta: 0, subtotal: 0, itbis: 0, costoPiezas: 0,
      porcentaje: unica?.porcentaje || 0, tecnicoId: unica?.tecnicoId || '', tecnicoNombre: unica?.tecnicoNombre || (r.comisiones.length ? 'Varios técnicos' : ''), comisionesFallidas: r.fallidas.length };
  }

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
        comisionesFallidas: result.fallidas.length,
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
        comisionesFallidas: result.fallidas.length,
      };
    }
    // 0 técnicos válidos
    return {
      comisionId: null, comisionMonto: 0, gananciaNeta, subtotal: desg.subtotal, itbis: desg.itbis,
      costoPiezas, porcentaje: 0, tecnicoId: '', tecnicoNombre: '',
      comisionesFallidas: result.fallidas.length,
    };
  }

  const r = await registrarComisionesPorItems({ ...args, items: itemsArr });
  const unica = r.comisiones.length === 1 ? r.comisiones[0] : null;
  return { comisionId: unica?.comisionId || null, comisionMonto: r.totalAgregado, gananciaNeta: 0, subtotal: 0, itbis: 0, costoPiezas: 0,
    porcentaje: unica?.porcentaje || 0, tecnicoId: unica?.tecnicoId || '', tecnicoNombre: unica?.tecnicoNombre || '', comisionesFallidas: r.fallidas.length };
}

/**
 * Registra la comisión del trabajo terminado al cerrar la orden, independientemente del cobro.
 * Política confirmada por Jorge el 28/09/2026. fechaCobro es un nombre legacy: aquí representa el devengo.
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
    const { personal, porcentaje } = await obtenerTecnicoParaComision(orden.tecnicoId);
    const [legacy, facturas] = await Promise.all([
      getDocs(query(collection(db, 'comisiones'), where('ordenId', '==', orden.id))),
      getDocs(query(collection(db, 'facturas'), where('ordenId', '==', orden.id))),
    ]);
    const canonica = doc(db, 'comisiones', `orden_${encodeURIComponent(orden.id)}`);
    const ordenRef = doc(db, 'ordenes_servicio', orden.id);
    return await runTransaction(db, async tx => {
      // Lecturas antes de escrituras; conflictos sobre orden/canónica fuerzan reintento.
      const actual = await tx.get(ordenRef);
      const existente = await tx.get(canonica);
      const antiguas = await Promise.all(legacy.docs.filter(d => d.id !== canonica.id).map(d => tx.get(doc(db, 'comisiones', d.id))));
      if (!actual.exists()) throw new Error('La orden ya no existe.');
      if (existente.exists() || antiguas.some(d => d.exists())) return { creada: false, razon: 'comisión ya registrada' };
      const o = actual.data();
      if (o.eliminada || !['cerrado', 'trabajo_realizado'].includes(o.fase) || o.soloChequeo) throw new Error('La orden no tiene trabajo terminado comisionable.');
      if (o.tecnicoId !== orden.tecnicoId || o.precioFinal !== orden.precioFinal || o.cotizacionId !== orden.cotizacionId || o.facturaId !== orden.facturaId) throw new Error('La orden cambió; recarga antes de calcular comisión.');
      if (typeof o.precioFinal !== 'number' || !Number.isFinite(o.precioFinal) || o.precioFinal <= 0) throw new Error('Precio final inválido.');
      if (o.precioSugerido !== undefined && o.estadoAprobacion !== 'aprobado') throw new Error('Precio sin aprobación de oficina.');
      const persona = await tx.get(doc(db, 'personal', personal!.id));
      if (!persona.exists()) throw new Error('El técnico ya no existe.');
      const p = { ...persona.data(), id: persona.id } as Personal;
      if (p.id !== o.tecnicoId && p.uid !== o.tecnicoId) throw new Error('La identidad del técnico cambió.');
      if (obtenerPorcentajeComision(p) !== porcentaje) throw new Error('El porcentaje cambió; recarga antes de calcular comisión.');
      const idsFacturas = new Set(facturas.docs.map(d => d.id));
      if (o.facturaId) idsFacturas.add(o.facturaId);
      const fuentes = await Promise.all([...idsFacturas].map(id => tx.get(doc(db, 'facturas', id))));
      const cot = o.cotizacionId ? await tx.get(doc(db, 'cotizaciones', o.cotizacionId)) : null;
      const activas = fuentes.filter(d => d.exists() && d.data().estado !== 'anulada' && d.data().tipoCierre !== 'solo_chequeo');
      const fuente = activas.find(d => d.id === o.facturaId) || activas.sort((a, b) => (b.data()!.createdAt?.toMillis?.() || 0) - (a.data()!.createdAt?.toMillis?.() || 0))[0];
      const items = fuente?.data()?.items || (cot?.exists() && cot.data().estado === 'aceptada' ? cot.data().items : []);
      const tecnicosItems = new Set((Array.isArray(items) ? items : []).map(i => i.tecnicoId).filter(Boolean));
      if (tecnicosItems.size > 1) throw new Error('Reparto entre varios técnicos requiere revisión antes del devengo.');
      const costoPiezas = calcularCostoPiezasDeItems(items);
      if (!Number.isFinite(costoPiezas) || costoPiezas < 0) throw new Error('Costo de piezas inválido.');
      const base = Math.max(0, o.precioFinal - costoPiezas);
      const comisionMonto = Math.round(base * (porcentaje / 100) * 100) / 100;
      const ahora = Timestamp.now();
      const data = {
        tecnicoId: p.uid || p.id, tecnicoNombre: p.nombre || orden.tecnicoNombre || 'Sin nombre',
        ordenId: orden.id, ordenNumero: o.numero || '', clienteNombre: o.clienteNombre || '',
        fechaCobro: ahora, precioFinal: o.precioFinal, costoPiezas, basePendienteComision: base,
        comisionPorcentaje: porcentaje, comisionMonto, estadoLiquidacion: 'pendiente',
        quincenaAsignada: calcularQuincenaActual(ahora.toDate()), createdAt: ahora,
      };
      tx.set(canonica, data);
      tx.update(ordenRef, { auditoria: arrayUnion(crearRegistroAuditoria(userProfile?.nombre || 'Sistema', 'cierre', `Comisión registrada RD$ ${comisionMonto}`, 'comision', '', canonica.id)), updatedAt: ahora });
      return { creada: true, comisionMonto };
    });
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
 * @param solicitanteUid — UID autenticado de quien solicita la eliminación.
 * @param solicitanteNombre — `userProfile?.nombre`.
 * @returns conteo `{ eliminadas, preservadas }`.
 */
export async function eliminarComisionesDeFactura(args: {
  facturaId: string;
  motivoEliminacion?: string;
  solicitanteUid?: string;
  solicitanteNombre?: string;
}): Promise<{ eliminadas: number; preservadas: number }> {
  const { facturaId, motivoEliminacion, solicitanteNombre } = args;
  const solicitanteUid = auth.currentUser?.uid;
  if (!solicitanteUid) throw new Error('Se requiere una sesión para auditar la eliminación de comisiones.');

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
 * Se ejecuta desde la revisión administrativa después de validar piezas.
 * Relee orden y comisión en una transacción; ajuste e historial de auditoría
 * se guardan juntos. Un reintento no escribe; costos cambiados, comisiones
 * ambiguas o ya liquidadas requieren revisión, sin ampliar permisos.
 * Los descuentos legacy se conservan al iniciar el historial por garantía.
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
    solicitanteNombre,
    motivoLabel,
  } = args;

  const solicitanteUid = auth.currentUser?.uid;
  if (!solicitanteUid) return { aplicado: false, monto: 0, comisionId: null, razon: 'Se requiere una sesión para aplicar el descuento.' };

  // Guardrails.
  if (!ordenGarantiaId || !ordenOriginalId || !tecnicoOriginalUid) {
    return { aplicado: false, monto: 0, comisionId: null, razon: 'Falta la referencia de la orden o del técnico original.' };
  }
  if (!Number.isFinite(costoPiezasReReparacion) || costoPiezasReReparacion <= 0) {
    return { aplicado: false, monto: 0, comisionId: null, razon: 'No hay un costo de piezas válido para descontar.' };
  }

  const PORCENTAJE = 0.10; // 10% del costo de piezas — regla de Jorge.
  // Misma operación que la vista previa: evita diferencias de centavos
  // por multiplicar sucesivamente por 0.1 y por 100 (p. ej. costo 0.35).
  const montoDescuento = -Math.round(costoPiezasReReparacion * 10) / 100;

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
      return { aplicado: false, monto: 0, comisionId: null, razon: 'No se encontró la comisión original; requiere revisión administrativa.' };
    }
    if (snap.docs.length !== 1) return { aplicado: false, monto: 0, comisionId: null, razon: 'Hay varias comisiones originales; requiere revisión.' };
    comisionId = snap.docs[0].id;
  } catch (err) {
    console.error(
      `[garantia-fase-A] Error buscando comisión original (ordenOriginal=${ordenOriginalId}):`,
      err,
    );
    return { aplicado: false, monto: 0, comisionId: null, razon: 'No se pudo consultar la comisión original. Revisa tu conexión y tus permisos.' };
  }

  const ahoraTs = Timestamp.now();
  const descuentoPayload: Record<string, unknown> = {
    monto: montoDescuento,
    facturaIdReasignada: facturaIdReasignada || '',
    conduceNumero: conduceNumeroOriginal || '',
    ordenIdReasignada: ordenGarantiaId,
    motivo: motivoLabel || 'Garantía — 10% de piezas',
    aplicadoEn: ahoraTs,
    aplicadoPor: solicitanteUid,
    aplicadoPorNombre: solicitanteNombre || 'Sistema',
  };
  // Notas opcionales removidas — el motivo ya captura el contexto.
  const descuentoLimpio = Object.fromEntries(
    Object.entries(descuentoPayload).filter(([, v]) => v !== undefined),
  );

  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'comisiones', comisionId!);
      const ordenRef = doc(db, 'ordenes_servicio', ordenGarantiaId);
      const [comisionSnap, ordenSnap] = await Promise.all([tx.get(ref), tx.get(ordenRef)]);
      const actual = comisionSnap.data();
      const garantia = ordenSnap.data();
      if (!actual || !garantia || garantia.eliminada === true || garantia.esGarantia !== true ||
          garantia.referenciaOrdenId !== ordenOriginalId || garantia.tecnicoOriginalUid !== tecnicoOriginalUid ||
          actual.ordenId !== ordenOriginalId || actual.tecnicoId !== tecnicoOriginalUid) {
        throw new Error('La orden o la comisión cambió. Recarga antes de continuar.');
      }
      const cierre = garantia.cierreServicio;
      if (!cierre?.fechaCierre || cierre.piezasValidadasPorAdmin !== true || !Array.isArray(cierre.piezasUsadas)) {
        throw new Error('Primero deben validarse las piezas de la garantía.');
      }
      let costoActual = 0;
      for (const pieza of cierre.piezasUsadas) {
        if (!Number.isFinite(pieza.cantidad) || pieza.cantidad <= 0 || !Number.isFinite(pieza.costoUnitario) || pieza.costoUnitario < 0) {
          throw new Error('Hay piezas con cantidades o costos inválidos.');
        }
        costoActual += pieza.cantidad * pieza.costoUnitario;
      }
      if (Math.abs(costoActual - costoPiezasReReparacion) > 0.005) throw new Error('El costo de piezas cambió. Recarga y revisa el importe.');
      const cambio = planificarAjusteGarantia(actual, descuentoLimpio);
      if (!cambio) return;
      tx.update(ref, { ...cambio, updatedAt: ahoraTs });
      tx.set(doc(collection(db, 'auditoria_admin')), {
        accion: 'descuento_garantia_tecnico', solicitanteUid: solicitanteUid,
        objetivoTipo: 'comision', objetivoId: comisionId, ordenIdReasignada: ordenGarantiaId,
        ordenIdOriginal: ordenOriginalId, monto: montoDescuento, timestamp: ahoraTs,
        tecnicoAfectadoUid: tecnicoOriginalUid, costoPiezasReReparacion: costoActual,
        porcentajeAplicado: PORCENTAJE, solicitanteNombre: solicitanteNombre || '',
        conduceNumero: conduceNumeroOriginal || '', motivo: motivoLabel || 'Garantía — 10% de piezas',
      });
    });
  } catch (err) {
    return { aplicado: false, monto: 0, comisionId,
      razon: err instanceof Error ? err.message : 'No se pudo aplicar el ajuste.' };
  }

  return { aplicado: true, monto: montoDescuento, comisionId };
}
