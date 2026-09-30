import { fechaFinanciera } from './fechaFinanciera';
import { diaCobroRD, type OrdenCobrosCruda } from './movimientosCobros';
export function resumenOperativoDia(ordenes: OrdenCobrosCruda[], gastos: OrdenCobrosCruda[], dia: string) {
  const incidencias: string[] = [];
  const cerradas = ordenes.flatMap(({ id, datos: o }) => {
    if (o.eliminada || !['cerrado', 'trabajo_realizado'].includes(String(o.fase))) return [];
    const cierre = o.cierreServicio as { fechaCierre?: unknown } | undefined;
    const historial = Array.isArray(o.historialFases) ? o.historialFases : [];
    const fecha = fechaFinanciera(cierre?.fechaCierre) || historial.filter(h => h && ['cerrado', 'trabajo_realizado'].includes(h.fase)).map(h => fechaFinanciera(h.timestamp)).filter((f): f is Date => !!f).sort((a, b) => b.getTime() - a.getTime())[0];
    if (!fecha) { incidencias.push(`Orden ${o.numero || id}: cierre sin fecha verificable.`); return []; }
    if (diaCobroRD(fecha) !== dia) return [];
    return [{ id, numero: String(o.numero || id), clienteNombre: String(o.clienteNombre || ''), tecnicoNombre: String(o.tecnicoNombre || ''), soloChequeo: o.soloChequeo === true, fechaCierre: fecha.toISOString() }];
  });
  const gastosDia = gastos.flatMap(({ id, datos: g }) => {
    const fecha = fechaFinanciera(g.fecha);
    if (!fecha) { incidencias.push(`Gasto ${id}: sin fecha verificable.`); return []; }
    if (diaCobroRD(fecha) !== dia) return [];
    if (typeof g.monto !== 'number' || !Number.isFinite(g.monto) || g.monto <= 0) { incidencias.push(`Gasto ${id}: importe inválido.`); return []; }
    return [{ id, descripcion: String(g.descripcion || ''), categoria: String(g.categoria || 'otros'), monto: g.monto }];
  });
  return { cerradas, chequeos: cerradas.filter(o => o.soloChequeo), gastos: gastosDia, totalGastos: Math.round(gastosDia.reduce((s, g) => s + g.monto, 0) * 100) / 100, incidencias };
}

/** Selección de conduces independiente de la zona del navegador. */
export function conducesDelDiaRD<T extends { fechaEmision?: unknown }>(conduces: T[], dia: string): T[] {
  return conduces.filter(c => { const fecha = fechaFinanciera(c.fechaEmision); return fecha !== null && diaCobroRD(fecha) === dia; });
}
