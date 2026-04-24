import type { CondicionPieza, OrigenPieza } from '../types';

/**
 * Helpers compartidos para presentación de piezas usadas en el cierre de
 * servicio. Antes estaban duplicados en CierreServicioWizard, ModalEditarPiezasOrden
 * y FacturacionPendiente — task #85 los unificó aquí. Si necesitas cambiar el
 * ícono o la etiqueta, hazlo solo en este archivo.
 */

export function iconoCondicion(c: CondicionPieza): string {
  return c === 'nueva' ? '✨' : '♻️';
}

export function iconoOrigen(o: OrigenPieza): string {
  return o === 'inventario_taller' ? '🏭' : o === 'inventario_vehiculo' ? '🚗' : '🛒';
}

export function etiquetaOrigen(o: OrigenPieza): string {
  return o === 'inventario_taller' ? 'Taller' : o === 'inventario_vehiculo' ? 'Vehículo' : 'Externa';
}
