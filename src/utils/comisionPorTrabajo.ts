// Fundamento puro y tipado del modelo "comisión por trabajo" (Jorge, 2026-10-09).
//
// Un trabajo es la unidad real de reparación dentro de una orden. Al alta se
// congela un snapshot inmutable con tecnicoUid, porcentaje copiado de la ficha,
// importe cobrado y costo de materiales asignados a ese trabajo. Cambios
// posteriores a la ficha NO alteran el snapshot ya existente.
//
// Base de comisión por trabajo = max(0, importeCobrado - costoMateriales).
// La liquidación es PURA: solo propone devengos cuando TODOS los trabajos
// están finalizados y el cobro total de la orden está verificado al 100%.
// Si falta cualquier condición devuelve estado pendiente con CERO devengos;
// nunca produce abonos parciales ni toca registros históricos.
//
// Este módulo no depende de Firestore ni de React y no realiza escrituras.
// El adaptador transaccional, el modelo de trabajos en producción y la UI
// quedan pendientes de implementar en una fase posterior; este archivo es
// únicamente el contrato de datos y las reglas aritméticas.
//
// Explícitamente fuera de alcance (bloqueado para decisión futura, no
// soportado por este módulo): redistribución de descuentos entre trabajos,
// devoluciones parciales, cancelaciones, garantías repetidas y comisión por
// venta independiente del técnico.

export interface EntradaTrabajo {
  readonly ordenId: string;
  readonly trabajoId: string;
  readonly tecnicoUid: string;
  readonly porcentajeComisionFicha: number;
  readonly importeCobrado: number;
  readonly costoMateriales: number;
  readonly creadoEn: unknown;
  readonly finalizado?: boolean;
}

export interface TrabajoSnapshot {
  readonly ordenId: string;
  readonly trabajoId: string;
  readonly tecnicoUid: string;
  readonly porcentajeComision: number;
  readonly importeCobrado: number;
  readonly costoMateriales: number;
  readonly finalizado: boolean;
  readonly creadoEn: unknown;
}

export interface PagoVerificadoTrabajo {
  readonly id: string;
  readonly monto: number;
  readonly verificado: boolean;
}

export interface OrdenConTrabajos {
  readonly ordenId: string;
  readonly totalOrden: number;
  readonly trabajos: readonly TrabajoSnapshot[];
  readonly pagos: readonly PagoVerificadoTrabajo[];
  readonly eliminada?: boolean;
  readonly soloChequeo?: boolean;
}

export interface DevengoPropuesto {
  readonly comisionId: string;
  readonly ordenId: string;
  readonly trabajoId: string;
  readonly tecnicoUid: string;
  readonly importeCobrado: number;
  readonly costoMateriales: number;
  readonly baseComision: number;
  readonly porcentajeComision: number;
  readonly montoComision: number;
}

export type MotivoPendiente =
  | 'orden_eliminada'
  | 'orden_solo_chequeo'
  | 'orden_sin_trabajos'
  | 'trabajos_sin_finalizar'
  | 'cobro_total_incompleto'
  | 'total_orden_inconsistente';

export type ResultadoLiquidacion =
  | {
      readonly estado: 'liquidable';
      readonly ordenId: string;
      readonly devengos: readonly DevengoPropuesto[];
      readonly totalImporte: number;
      readonly totalCobradoVerificado: number;
    }
  | {
      readonly estado: 'pendiente';
      readonly ordenId: string;
      readonly motivo: MotivoPendiente;
      readonly devengos: readonly DevengoPropuesto[];
      readonly totalImporte: number;
      readonly totalCobradoVerificado: number;
    };

// Caracteres prohibidos en identificadores. `_` queda prohibido porque el id
// determinista de devengo usa `_` como separador entre ordenId y trabajoId;
// `/` colisiona con rutas de Firestore; los espacios y controles no son
// seguros como fragmentos de id.
const ID_INVALIDO = /[\s/_]/;

function validarId(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new Error(`Trabajo inválido: ${campo} vacío.`);
  }
  if (ID_INVALIDO.test(valor)) {
    throw new Error(`Trabajo inválido: ${campo} con caracter prohibido (barra, guion bajo o espacio).`);
  }
  return valor;
}

function validarPorcentaje(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 100) {
    throw new Error('Trabajo inválido: porcentaje de comisión fuera de rango (0..100).');
  }
  const centesimas = Math.round(valor * 100);
  if (Math.abs(valor * 100 - centesimas) > 1e-6) {
    throw new Error('Trabajo inválido: porcentaje con precisión mayor a 2 decimales.');
  }
  return centesimas / 100;
}

function validarMontoRD(valor: unknown, campo: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
    throw new Error(`Trabajo inválido: ${campo} no es un monto finito mayor o igual a 0.`);
  }
  const cents = Math.round(valor * 100);
  if (Math.abs(valor * 100 - cents) > 1e-6) {
    throw new Error(`Trabajo inválido: ${campo} con precisión mayor a centavos.`);
  }
  if (!Number.isSafeInteger(cents)) throw new Error(`Trabajo inválido: ${campo} excede precisión segura.`);
  return cents / 100;
}

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

export function crearSnapshotTrabajo(entrada: EntradaTrabajo): TrabajoSnapshot {
  if (!entrada || typeof entrada !== 'object') {
    throw new Error('Trabajo inválido: entrada no es un objeto.');
  }
  if (entrada.finalizado !== undefined && typeof entrada.finalizado !== 'boolean') {
    throw new Error('Trabajo inválido: finalizado debe ser boolean.');
  }
  const snapshot: TrabajoSnapshot = {
    ordenId: validarId(entrada.ordenId, 'ordenId'),
    trabajoId: validarId(entrada.trabajoId, 'trabajoId'),
    tecnicoUid: validarId(entrada.tecnicoUid, 'tecnicoUid'),
    porcentajeComision: validarPorcentaje(entrada.porcentajeComisionFicha),
    importeCobrado: validarMontoRD(entrada.importeCobrado, 'importeCobrado'),
    costoMateriales: validarMontoRD(entrada.costoMateriales, 'costoMateriales'),
    finalizado: entrada.finalizado === true,
    creadoEn: entrada.creadoEn,
  };
  return Object.freeze(snapshot);
}

export function finalizarTrabajo(snapshot: TrabajoSnapshot): TrabajoSnapshot {
  if (snapshot.finalizado) return snapshot;
  return Object.freeze({ ...snapshot, finalizado: true });
}

export function idDevengoDeterminista(ordenId: string, trabajoId: string): string {
  validarId(ordenId, 'ordenId');
  validarId(trabajoId, 'trabajoId');
  return `trabajo_${encodeURIComponent(ordenId)}_${encodeURIComponent(trabajoId)}`;
}

export function calcularBaseComision(snapshot: TrabajoSnapshot): number {
  const baseC = Math.max(0, centavos(snapshot.importeCobrado) - centavos(snapshot.costoMateriales));
  return baseC / 100;
}

export function calcularMontoComision(snapshot: TrabajoSnapshot): number {
  const baseC = Math.max(0, centavos(snapshot.importeCobrado) - centavos(snapshot.costoMateriales));
  const centesimasPct = Math.round(snapshot.porcentajeComision * 100);
  const producto = BigInt(baseC) * BigInt(centesimasPct);
  const montoC = Number((producto + 5000n) / 10000n);
  return montoC / 100;
}

function validarPagosYSumar(pagos: readonly PagoVerificadoTrabajo[]): number {
  const idsVistos = new Set<string>();
  let totalCent = 0;
  for (const pago of pagos) {
    if (!pago || typeof pago !== 'object') {
      throw new Error('Pago inválido: shape incorrecto.');
    }
    if (typeof pago.id !== 'string' || pago.id.length === 0) {
      throw new Error('Pago inválido: id vacío.');
    }
    if (idsVistos.has(pago.id)) {
      throw new Error('Pago inválido: id repetido.');
    }
    idsVistos.add(pago.id);
    if (typeof pago.monto !== 'number' || !Number.isFinite(pago.monto) || pago.monto <= 0) {
      throw new Error('Pago inválido: monto no finito o menor o igual a 0.');
    }
    const c = Math.round(pago.monto * 100);
    if (Math.abs(pago.monto * 100 - c) > 1e-6) {
      throw new Error('Pago inválido: precisión mayor a centavos.');
    }
    if (typeof pago.verificado !== 'boolean') {
      throw new Error('Pago inválido: verificado debe ser boolean.');
    }
    validarMontoRD(pago.monto, 'pago.monto');
    if (pago.verificado) {
      totalCent += c;
      if (!Number.isSafeInteger(totalCent)) throw new Error('Pago inválido: total excede precisión segura.');
    }
  }
  return totalCent;
}

function congelarResultadoPendiente(
  ordenId: string,
  motivo: MotivoPendiente,
  totalImporte: number,
  totalCobradoVerificado: number,
): ResultadoLiquidacion {
  return Object.freeze({
    estado: 'pendiente' as const,
    ordenId,
    motivo,
    devengos: Object.freeze([] as DevengoPropuesto[]),
    totalImporte,
    totalCobradoVerificado,
  });
}

export function calcularLiquidacionOrden(orden: OrdenConTrabajos): ResultadoLiquidacion {
  if (!orden || typeof orden !== 'object') {
    throw new Error('Orden inválida: no es un objeto.');
  }
  const ordenId = validarId(orden.ordenId, 'ordenId');
  const totalOrden = validarMontoRD(orden.totalOrden, 'totalOrden');
  for (const flag of [orden.eliminada, orden.soloChequeo]) {
    if (flag !== undefined && typeof flag !== 'boolean') throw new Error('Orden inválida: estado debe ser boolean.');
  }
  if (!Array.isArray(orden.trabajos)) {
    throw new Error('Orden inválida: trabajos no es array.');
  }
  if (!Array.isArray(orden.pagos)) {
    throw new Error('Orden inválida: pagos no es array.');
  }

  const idsVistos = new Set<string>();
  let totalImporteCent = 0;
  for (const trabajo of orden.trabajos) {
    if (!trabajo || typeof trabajo !== 'object') {
      throw new Error('Trabajo inválido: shape incorrecto.');
    }
    if (trabajo.ordenId !== ordenId) {
      throw new Error('Trabajo inválido: pertenece a otra orden.');
    }
    if (idsVistos.has(trabajo.trabajoId)) {
      throw new Error('Trabajo inválido: trabajoId repetido dentro de la orden.');
    }
    idsVistos.add(trabajo.trabajoId);
    crearSnapshotTrabajo({ ...trabajo, porcentajeComisionFicha: trabajo.porcentajeComision });
    // Revalidación defensiva: aunque el snapshot ya validó al construirse,
    // bloqueamos cualquier doc armado a mano con montos no normalizados.
    const importeCent = Math.round(trabajo.importeCobrado * 100);
    const costoCent = Math.round(trabajo.costoMateriales * 100);
    if (!Number.isFinite(trabajo.importeCobrado) || trabajo.importeCobrado < 0 ||
        Math.abs(trabajo.importeCobrado * 100 - importeCent) > 1e-6) {
      throw new Error('Trabajo inválido: importeCobrado no normalizado.');
    }
    if (!Number.isFinite(trabajo.costoMateriales) || trabajo.costoMateriales < 0 ||
        Math.abs(trabajo.costoMateriales * 100 - costoCent) > 1e-6) {
      throw new Error('Trabajo inválido: costoMateriales no normalizado.');
    }
    if (typeof trabajo.porcentajeComision !== 'number' ||
        !Number.isFinite(trabajo.porcentajeComision) ||
        trabajo.porcentajeComision < 0 || trabajo.porcentajeComision > 100) {
      throw new Error('Trabajo inválido: porcentajeComision fuera de rango.');
    }
    totalImporteCent += importeCent;
    if (!Number.isSafeInteger(totalImporteCent)) throw new Error('Orden inválida: total excede precisión segura.');
  }

  const totalImporte = totalImporteCent / 100;
  const totalCobradoVerificado = validarPagosYSumar(orden.pagos) / 100;

  if (orden.eliminada === true) {
    return congelarResultadoPendiente(ordenId, 'orden_eliminada', totalImporte, totalCobradoVerificado);
  }
  if (orden.soloChequeo === true) {
    return congelarResultadoPendiente(ordenId, 'orden_solo_chequeo', totalImporte, totalCobradoVerificado);
  }
  if (orden.trabajos.length === 0) {
    return congelarResultadoPendiente(ordenId, 'orden_sin_trabajos', totalImporte, totalCobradoVerificado);
  }
  if (orden.trabajos.some(t => !t.finalizado)) {
    return congelarResultadoPendiente(ordenId, 'trabajos_sin_finalizar', totalImporte, totalCobradoVerificado);
  }
  if (totalOrden < totalImporte) {
    return congelarResultadoPendiente(ordenId, 'total_orden_inconsistente', totalImporte, totalCobradoVerificado);
  }
  if (centavos(totalCobradoVerificado) < centavos(totalOrden)) {
    return congelarResultadoPendiente(ordenId, 'cobro_total_incompleto', totalImporte, totalCobradoVerificado);
  }

  const devengos: DevengoPropuesto[] = [];
  for (const trabajo of orden.trabajos) {
    devengos.push(Object.freeze({
      comisionId: idDevengoDeterminista(trabajo.ordenId, trabajo.trabajoId),
      ordenId: trabajo.ordenId,
      trabajoId: trabajo.trabajoId,
      tecnicoUid: trabajo.tecnicoUid,
      importeCobrado: trabajo.importeCobrado,
      costoMateriales: trabajo.costoMateriales,
      baseComision: calcularBaseComision(trabajo),
      porcentajeComision: trabajo.porcentajeComision,
      montoComision: calcularMontoComision(trabajo),
    }));
  }

  return Object.freeze({
    estado: 'liquidable' as const,
    ordenId,
    devengos: Object.freeze(devengos),
    totalImporte,
    totalCobradoVerificado,
  });
}
