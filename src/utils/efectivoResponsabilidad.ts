/** El recibo del cliente y la entrega a caja son hechos distintos de verificar el pago. */
export type DatosEfectivo = Record<string, unknown>;
export interface ActorEfectivo { uid: string; rol: string; nombre: string; activo?: boolean }
export const mapaEfectivo = (v: unknown): DatosEfectivo => v && typeof v === 'object' && !Array.isArray(v) ? v as DatosEfectivo : {};
export function pagoEfectivoActual(orden: DatosEfectivo, pagoId: string, monto: number) {
  if (orden.eliminada === true) throw new Error('La orden ya no está disponible');
  const pagos = Array.isArray(orden.pagos) ? orden.pagos.map(mapaEfectivo).filter(p => p.id === pagoId) : [];
  if (pagos.length !== 1 || pagos[0].metodo !== 'efectivo' || !Number.isFinite(monto) || monto <= 0 || pagos[0].monto !== monto) throw new Error('El pago cambió o no es válido. Actualiza la orden.');
  return pagos[0];
}
export function puedeRecibirEfectivo(actor: ActorEfectivo, orden: DatosEfectivo) {
  if (!actor.uid || actor.activo === false) return false;
  return ['administrador', 'coordinadora'].includes(actor.rol) || (['operaria', 'secretaria'].includes(actor.rol) && [orden.operariaId, orden.secretariaId].includes(actor.uid));
}
export function prepararAceptacionEfectivo(orden: DatosEfectivo, pagoId: string, monto: number, actor: ActorEfectivo, ahora: unknown) {
  const pago = pagoEfectivoActual(orden, pagoId, monto);
  if (actor.activo === false || actor.rol !== 'tecnico' || orden.tecnicoId !== actor.uid || pago.recibidoPorId !== actor.uid) throw new Error('Solo el técnico receptor asignado puede aceptar este efectivo');
  if (pago.requiereAceptacionEfectivo !== true) throw new Error('Pago histórico: requiere conciliación en caja');
  const mapa = mapaEfectivo(orden.efectivoAceptaciones);
  if (mapa[pagoId]) {
    const previo = mapaEfectivo(mapa[pagoId]);
    if (previo.monto !== monto || previo.tecnicoUid !== actor.uid) throw new Error('La aceptación anterior requiere conciliación');
    return null;
  }
  return { ...mapa, [pagoId]: { monto, tecnicoUid: actor.uid, aceptadoEn: ahora } };
}
export function prepararEntregaEfectivo(orden: DatosEfectivo, pagoId: string, monto: number, actor: ActorEfectivo, ahora: unknown) {
  const pago = pagoEfectivoActual(orden, pagoId, monto);
  if (!puedeRecibirEfectivo(actor, orden)) throw new Error('No tienes permiso para recibir efectivo de esta orden');
  const aceptacion = mapaEfectivo(mapaEfectivo(orden.efectivoAceptaciones)[pagoId]);
  if (aceptacion.monto !== monto || aceptacion.tecnicoUid !== pago.recibidoPorId) throw new Error('El técnico debe confirmar primero que recibió este monto');
  const mapa = mapaEfectivo(orden.efectivoEntregas);
  if (orden.efectivoEntregado === true && !Object.keys(mapa).length) throw new Error('Entrega histórica: requiere conciliación');
  if (mapa[pagoId]) {
    if (mapaEfectivo(mapa[pagoId]).monto !== monto) throw new Error('La entrega anterior requiere conciliación');
    return null;
  }
  return { ...mapa, [pagoId]: { monto, entregadoEn: ahora, entregadoPor: actor.uid, entregadoPorNombre: actor.nombre } };
}
