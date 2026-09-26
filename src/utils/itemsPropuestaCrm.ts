import type { ItemCotizacion } from '../types';

interface Propuesta {
  estado: string;
  diagnostico: string;
  piezas: { nombre: string; cantidad: number; costoUnitario: number }[];
}

/** Conserva costos aprobados y el total acordado; oficina revisa las líneas antes de emitir. */
export function itemsPropuestaCrm(propuesta: Propuesta, total: number): ItemCotizacion[] {
  if (propuesta.estado !== 'aprobado') throw new Error('La propuesta debe estar aprobada antes de facturar.');
  if (!Number.isFinite(total) || total < 0) throw new Error('Total aprobado inválido.');
  const piezas = propuesta.piezas.map(p => {
    if (!Number.isFinite(p.cantidad) || p.cantidad <= 0 || !Number.isFinite(p.costoUnitario) || p.costoUnitario < 0)
      throw new Error('Revisa las cantidades y costos de las piezas aprobadas.');
    return { descripcion: p.nombre, cantidad: p.cantidad, precio: p.costoUnitario,
      costoCompra: p.costoUnitario, tipoItem: 'pieza' as const };
  });
  const costo = piezas.reduce((s, p) => s + Math.round(p.cantidad * p.precio * 100), 0);
  const resto = Math.round(total * 100) - costo;
  if (resto < 0) throw new Error('El costo de piezas supera el total acordado. Revisa el presupuesto antes de emitir.');
  return [...piezas, { descripcion: propuesta.diagnostico || 'Servicio aprobado', cantidad: 1,
    precio: resto / 100, tipoItem: 'servicio' }];
}
