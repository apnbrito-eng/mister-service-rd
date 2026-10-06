import { equipoApi } from './equipoApi';
export async function registrarResponsabilidadEfectivo(ordenId: string, pagoId: string, monto: number, accion: 'aceptar' | 'recibir') {
  return equipoApi<{ ok: boolean; modificado: boolean }>('/api/ordenes/efectivo', { ordenId, pagoId, monto, accion });
}
