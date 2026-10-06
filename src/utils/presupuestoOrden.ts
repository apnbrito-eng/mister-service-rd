import type { OrdenServicio, Rol } from '../types';

export function puedeGestionarRespuestaPresupuesto(orden: Pick<OrdenServicio, 'operariaId' | 'responsableId'>, rol: Rol, uid: string): boolean {
  return rol === 'administrador' || rol === 'coordinadora' ||
    ((rol === 'operaria' || rol === 'secretaria') && !!uid && [orden.operariaId, orden.responsableId].includes(uid));
}

export function validarAccionPresupuesto(orden: Pick<OrdenServicio, 'fase' | 'estadoAprobacion' | 'presupuestoEstado' | 'precioAprobado' | 'precioSugerido' | 'presupuestoMontoPropuesto'>, accion: 'aprobar' | 'aceptar' | 'proponer', monto: number): void {
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Ingresa un monto mayor que cero.');
  if (['cerrado', 'cancelado', 'trabajo_realizado'].includes(orden.fase) || orden.estadoAprobacion === 'aprobado') throw new Error('Esta orden ya no admite cambios de presupuesto.');
  if (accion === 'aprobar' && orden.presupuestoEstado === 'pendiente_cliente') throw new Error('El presupuesto ya fue aprobado; falta la respuesta del cliente.');
  if (accion !== 'aprobar' && orden.presupuestoEstado !== 'pendiente_cliente') throw new Error('Primero la coordinadora debe aprobar el presupuesto.');
  if (accion === 'aceptar' && monto !== orden.precioAprobado) throw new Error('El importe cambió. Revisa el presupuesto actualizado antes de confirmar.');
  if (accion === 'proponer' && monto === orden.precioAprobado) throw new Error('El monto propuesto debe ser diferente del aprobado.');
}
