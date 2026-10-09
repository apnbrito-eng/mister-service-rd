import { OrdenServicio, Personal } from '../types';
import { parseOrden } from './index';
import { fechaFinanciera } from './fechaFinanciera';
import { diaCobroRD, OrdenCobrosCruda, proyectarCobrosCaja } from './movimientosCobros';

export const rangoMesRD = (mes: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { inicio: new Date(NaN), fin: new Date(NaN) };
  const inicio = fechaFinanciera(`${mes}-01`) || new Date(NaN);
  const [y, m] = mes.split('-').map(Number);
  const siguiente = fechaFinanciera(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`);
  return { inicio, fin: new Date((siguiente?.getTime() ?? NaN) - 1) };
};
export function identidadPersonal(id: unknown, personal: Personal[]): Personal | undefined {
  if (typeof id !== 'string' || !id) return undefined;
  const candidatos = personal.filter(p => p.id === id || p.uid === id);
  return candidatos.length === 1 ? candidatos[0] : undefined;
}
export function fechaCierreMetrica(o: OrdenServicio): Date | null {
  return fechaFinanciera(o.cierreServicio?.fechaCierre) || o.historialFases
    .filter(h => h.fase === 'cerrado').map(h => fechaFinanciera(h.timestamp)).filter((f): f is Date => !!f)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}
export function enPeriodo(fecha: unknown, inicio: Date, fin: Date) {
  const f = fechaFinanciera(fecha); return !!f && f >= inicio && f <= fin;
}
export function ordenMetrica(id: string, raw: Record<string, unknown>): OrdenServicio {
  const o = parseOrden(id, raw);
  o.createdAt = fechaFinanciera(raw.createdAt) || new Date(NaN);
  o.historialFases = (Array.isArray(raw.historialFases) ? raw.historialFases : []).filter(h => h && typeof h === 'object').map(h => ({ ...h, timestamp: fechaFinanciera(h.timestamp) || new Date(NaN) }));
  if (o.cierreServicio) o.cierreServicio.fechaCierre = fechaFinanciera((raw.cierreServicio as Record<string, unknown> | undefined)?.fechaCierre) || new Date(NaN);
  return o;
}
export function comisionAjustada(c: { comisionMonto?: number; descuentoPorGarantia?: { monto?: number }; estaAnulada?: boolean; estadoLiquidacion?: string }) {
  if (c.estaAnulada || c.estadoLiquidacion === 'anulada') return 0;
  return Number.isFinite(c.comisionMonto) && Number.isFinite(c.descuentoPorGarantia?.monto ?? 0)
    ? c.comisionMonto! + (c.descuentoPorGarantia?.monto ?? 0) : 0;
}
export function resumenNegocio(raw: OrdenCobrosCruda[], gastos: { fecha?: unknown; monto?: unknown }[], inicio: Date, fin: Date) {
  const caja = proyectarCobrosCaja(raw, undefined, periodoValido(inicio, fin) ? diaCobroRD(inicio) : '9999-01-01', periodoValido(inicio, fin) ? diaCobroRD(fin) : '0001-01-01');
  const gastosValidos = gastos.filter(g => enPeriodo(g.fecha, inicio, fin) && typeof g.monto === 'number' && Number.isFinite(g.monto) && g.monto > 0);
  return { ...caja, gastos: gastosValidos.reduce((s, g) => s + (g.monto as number), 0), incidenciasGastos: gastos.filter(g => !fechaFinanciera(g.fecha) || typeof g.monto !== 'number' || !Number.isFinite(g.monto) || g.monto <= 0).length };
}
type EvaluacionCalidad = { ordenId: string; numero: string; comentario: string; categorias: Record<string, number>; participanteUid: string | null };
function objetoCalidad(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : null;
}
function categoriasCalidad(valor: unknown, claves: readonly string[]): Record<string, number> | null {
  const objeto = objetoCalidad(valor);
  if (!objeto || !claves.every(c => typeof objeto[c] === 'number' && Number.isInteger(objeto[c]) && Number(objeto[c]) >= 1 && Number(objeto[c]) <= 5)) return null;
  return Object.fromEntries(claves.map(c => [c, Number(objeto[c])]));
}
function promediosCalidad(evaluaciones: { categorias: Record<string, number> }[], claves: readonly string[]) {
  return claves.map(c => ({ categoria: c, promedio: evaluaciones.length ? evaluaciones.reduce((s, e) => s + e.categorias[c], 0) / evaluaciones.length : null }));
}
export function calidadServicio(raw: OrdenCobrosCruda[], inicio: Date, fin: Date) {
  const categorias = ['puntualidad', 'trato', 'claridad', 'calidad'] as const;
  const categoriasAtencion = ['puntualidad', 'trato', 'claridad'] as const;
  const atencion: EvaluacionCalidad[] = [];
  const tecnico: EvaluacionCalidad[] = [];
  const evaluaciones: Array<EvaluacionCalidad & { tecnicoId: unknown; responsableId: unknown }> = [];
  const ordenesRespuesta = new Set<string>();
  let incidencias = 0;
  for (const o of raw) {
    const e = objetoCalidad(o.datos.evaluacionServicio);
    if (!e || o.datos.eliminada || o.datos.eliminado) continue;
    if (!fechaFinanciera(e.fecha)) { incidencias++; continue; }
    if (!enPeriodo(e.fecha, inicio, fin)) continue;
    const comun = { ordenId: o.id, numero: String(o.datos.numero || o.id), comentario: typeof e.comentario === 'string' ? e.comentario : '' };
    if (e.version === 2) {
      const participantes = objetoCalidad(e.participantes);
      const valoresAtencion = categoriasCalidad(e.atencion, categoriasAtencion);
      const valoresTecnico = categoriasCalidad(e.tecnico, categorias);
      if (valoresAtencion) {
        const uid = participantes?.atribucionAtencionConfiable === true && typeof participantes.atencionUid === 'string' && participantes.atencionUid.trim() ? participantes.atencionUid : null;
        atencion.push({ ...comun, categorias: valoresAtencion, participanteUid: uid });
      }
      if (valoresTecnico) {
        const uid = participantes?.atribucionTecnicoConfiable === true && typeof participantes.tecnicoUid === 'string' && participantes.tecnicoUid.trim() ? participantes.tecnicoUid : null;
        tecnico.push({ ...comun, categorias: valoresTecnico, participanteUid: uid });
      }
      if (valoresAtencion || valoresTecnico) ordenesRespuesta.add(o.id);
      if ((!valoresAtencion && !valoresTecnico) || (e.atencion != null && !valoresAtencion) || (e.tecnico != null && !valoresTecnico)) incidencias++;
    } else {
      if (e.version !== undefined && e.version !== 1) { incidencias++; continue; }
      const valores = categoriasCalidad(e.categorias, categorias);
      if (!valores) { incidencias++; continue; }
      // Legacy: la encuesta evalúa el servicio completo, nunca un rol individual.
      evaluaciones.push({ ...comun, categorias: valores, participanteUid: null, tecnicoId: o.datos.tecnicoId, responsableId: o.datos.operariaId || o.datos.responsableId });
      ordenesRespuesta.add(o.id);
    }
  }
  return { evaluaciones, promedios: promediosCalidad(evaluaciones, categorias), atencion: { evaluaciones: atencion, promedios: promediosCalidad(atencion, categoriasAtencion) }, tecnico: { evaluaciones: tecnico, promedios: promediosCalidad(tecnico, categorias) }, respuestas: ordenesRespuesta.size, incidencias };
}

export function periodoValido(inicio: Date, fin: Date): boolean {
  return Number.isFinite(inicio.getTime()) && Number.isFinite(fin.getTime()) && inicio <= fin;
}
export function creadorIdentificable(orden: OrdenServicio, personal: Personal[]) {
  // Los escritores legacy guardan nombre en creadoPor. Solo una identidad explícita
  // que resuelva de manera única puede participar; nunca buscar por nombre.
  return identidadPersonal(orden.creadoPorId || orden.creadoPor, personal);
}
export function coberturaCreadores(ordenes: OrdenServicio[], personal: Personal[], inicio: Date, fin: Date) {
  return ordenes.filter(o => !o.eliminada && (!fechaFinanciera(o.createdAt) || enPeriodo(o.createdAt, inicio, fin)) && !creadorIdentificable(o, personal)).length;
}
export function cerradasDelPeriodo(ordenes: OrdenServicio[], personal: Personal[], inicio: Date, fin: Date, responsableId = '') {
  return ordenes.filter(o => !o.eliminada && o.fase === 'cerrado' && enPeriodo(fechaCierreMetrica(o), inicio, fin)
    && (!responsableId || identidadPersonal(o.operariaId || o.responsableId || o.creadoPorId || o.creadoPor, personal)?.id === responsableId));
}
