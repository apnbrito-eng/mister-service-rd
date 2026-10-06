import { equipoApi } from './equipoApi';
export type AccionOrden = 'abrir' | 'llamar' | 'whatsapp' | 'ubicacion' | 'salida';
export async function registrarActividadOrden(ordenId: string, accion: AccionOrden) {
  return equipoApi('/api/movil/actividad-orden', { ordenId, accion, intentoId: crypto.randomUUID() });
}
