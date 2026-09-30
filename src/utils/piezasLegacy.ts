import { fechaFinanciera } from './fechaFinanciera';
/** Mantiene visibles piezas históricas aunque no tengan fechas. */
export function piezasLegacyVisibles<T extends { createdAt?: unknown; fechaInicio?: unknown }>(piezas: T[]) {
  return piezas.map(p => ({ ...p, createdAt: fechaFinanciera(p.createdAt) || new Date(NaN), fechaInicio: fechaFinanciera(p.fechaInicio) || new Date(NaN) }))
    .sort((a,b) => (Number.isFinite(b.createdAt.getTime()) ? b.createdAt.getTime() : 0) - (Number.isFinite(a.createdAt.getTime()) ? a.createdAt.getTime() : 0));
}
