import { diaCobroRD, proyectarCobrosCaja } from './movimientosCobros';
import { fechaFinanciera } from './fechaFinanciera';

/**
 * Seguimiento de marketing a partir de datos que ya existen.
 * Solo cuenta vínculos registrados (IDs); nunca deduce por nombre y
 * nunca trata un clic o una consulta como una venta.
 */

export interface DocCrudo { id: string; datos: Record<string, unknown> }
export interface Rango { desde: Date; hasta: Date }

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const registro = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const dentro = (f: Date | null, r: Rango) => !!f && f >= r.desde && f <= r.hasta;

/** Rango de días completos en hora de RD (UTC-4, sin horario de verano). */
export function rangoDiasRD(desde: string, hasta: string): Rango | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) return null;
  const d = new Date(`${desde}T00:00:00-04:00`), h = new Date(`${hasta}T23:59:59.999-04:00`);
  return Number.isFinite(d.getTime()) && Number.isFinite(h.getTime()) && diaCobroRD(d) === desde && diaCobroRD(h) === hasta ? { desde: d, hasta: h } : null;
}

export interface ResultadoOrdenes { ordenes: number; cerradas: number; canceladas: number; conCobroVerificado: number; cobrosVerificados: number }
const vacio = (): ResultadoOrdenes => ({ ordenes: 0, cerradas: 0, canceladas: 0, conCobroVerificado: 0, cobrosVerificados: 0 });

/** Misma proyección RAW de Caja; la fecha del pago también debe pertenecer al rango. */
export function cobrosVerificadosOrden(orden: DocCrudo, rango: Rango): number {
  return proyectarCobrosCaja([orden], undefined, diaCobroRD(rango.desde), diaCobroRD(rango.hasta)).totalConfirmado;
}

function acumular(r: ResultadoOrdenes, orden: DocCrudo, rango: Rango): number {
  r.ordenes++;
  if (orden.datos.fase === 'cerrado') r.cerradas++;
  if (orden.datos.fase === 'cancelado') r.canceladas++;
  const caja = proyectarCobrosCaja([orden], undefined, diaCobroRD(rango.desde), diaCobroRD(rango.hasta));
  const cobro = caja.totalConfirmado;
  if (cobro > 0) { r.conCobroVerificado++; r.cobrosVerificados = Math.round((r.cobrosVerificados + cobro) * 100) / 100; }
  return caja.incidencias.length;
}

export const ETIQUETA_ORIGEN: Record<string, string> = {
  formulario_publico: 'Formulario web',
  calendario_publico: 'Calendario público',
  solicitud_formulario: 'Formulario dinámico',
  oficina: 'Oficina',
  garantia: 'Garantía',
  sin_registro: 'Sin origen registrado',
};

export interface FilaOrigen extends ResultadoOrdenes { origen: string; etiqueta: string }

/** Órdenes creadas en el rango, agrupadas por metadatosCita.origen. */
export function resumirPorOrigen(ordenes: DocCrudo[], rango: Rango): { filas: FilaOrigen[]; sinFecha: number; incidenciasCobros: number } {
  const grupos = new Map<string, ResultadoOrdenes>();
  let sinFecha = 0, incidenciasCobros = 0;
  for (const o of ordenes) {
    if (o.datos.eliminada === true) continue;
    const creada = fechaFinanciera(o.datos.createdAt);
    if (!creada) { sinFecha++; continue; }
    if (!dentro(creada, rango)) continue;
    const origen = texto(registro(o.datos.metadatosCita).origen);
    const clave = origen && ETIQUETA_ORIGEN[origen] ? origen : 'sin_registro';
    if (!grupos.has(clave)) grupos.set(clave, vacio());
    incidenciasCobros += acumular(grupos.get(clave)!, o, rango);
  }
  const filas = [...grupos.entries()].map(([origen, r]) => ({ origen, etiqueta: ETIQUETA_ORIGEN[origen], ...r }))
    .sort((a, b) => b.ordenes - a.ordenes || a.etiqueta.localeCompare(b.etiqueta, 'es'));
  return { filas, sinFecha, incidenciasCobros };
}

export interface FilaAnuncio extends ResultadoOrdenes { anuncioId: string; consultas: number; conCliente: number }

/**
 * Consultas que llegaron desde un anuncio (whatsapp_conversaciones.origenMarketing)
 * y órdenes posteriores del MISMO cliente vinculado por ID. Es seguimiento, no
 * prueba que el anuncio causó la orden.
 */
export function resumirAnuncios(conversaciones: DocCrudo[], ordenes: DocCrudo[], rango: Rango): { filas: FilaAnuncio[]; sinFecha: number; ordenesSinFecha: number; ordenesAmbiguas: number; incidenciasCobros: number } {
  const filas = new Map<string, FilaAnuncio & { clientes: Map<string, Date> }>();
  let sinFecha = 0;
  for (const c of conversaciones) {
    const origen = registro(c.datos.origenMarketing);
    const anuncioId = texto(origen.anuncioId);
    if (!anuncioId) continue;
    const fecha = fechaFinanciera(origen.fecha);
    if (!fecha) { sinFecha++; continue; }
    if (!dentro(fecha, rango)) continue;
    if (!filas.has(anuncioId)) filas.set(anuncioId, { anuncioId, consultas: 0, conCliente: 0, ...vacio(), clientes: new Map() });
    const f = filas.get(anuncioId)!;
    f.consultas++;
    const clienteId = texto(c.datos.clienteId);
    if (clienteId) {
      f.conCliente++;
      const previo = f.clientes.get(clienteId);
      if (!previo || fecha < previo) f.clientes.set(clienteId, fecha);
    }
  }
  let ordenesSinFecha = 0, ordenesAmbiguas = 0, incidenciasCobros = 0;
  const contadas = new Set<string>();
  for (const o of ordenes) {
    if (o.datos.eliminada === true) continue;
    const clienteId = texto(o.datos.clienteId);
    const creada = fechaFinanciera(o.datos.createdAt);
    if (!creada) { ordenesSinFecha++; continue; }
    if (!clienteId || !dentro(creada, rango) || contadas.has(o.id)) continue;
    contadas.add(o.id);
    const candidatos = [...filas.values()].filter(f => { const toque = f.clientes.get(clienteId); return toque && creada >= toque; });
    if (candidatos.length > 1) { ordenesAmbiguas++; continue; }
    if (candidatos.length === 1) incidenciasCobros += acumular(candidatos[0], o, rango);
  }
  return {
    filas: [...filas.values()].map(f => ({ anuncioId: f.anuncioId, consultas: f.consultas, conCliente: f.conCliente, ordenes: f.ordenes, cerradas: f.cerradas, canceladas: f.canceladas, conCobroVerificado: f.conCobroVerificado, cobrosVerificados: f.cobrosVerificados })).sort((a, b) => b.consultas - a.consultas || a.anuncioId.localeCompare(b.anuncioId)),
    sinFecha, ordenesSinFecha, ordenesAmbiguas, incidenciasCobros,
  };
}

export interface FilaCampana { id: string; nombre: string; fecha: Date; contactados: number; enviados: number; reactivados: number | null }

/** Campañas de reactivación creadas en el rango. `reactivados` null = la campaña no tiene medición guardada. */
export function resumirCampanas(campanas: DocCrudo[], rango: Rango): { filas: FilaCampana[]; clientesRepetidos: number; sinFecha: number } {
  const filas: FilaCampana[] = [];
  const conteo = new Map<string, number>();
  let sinFecha = 0;
  for (const c of campanas) {
    const fecha = fechaFinanciera(c.datos.fecha) ?? fechaFinanciera(c.datos.creadaEn);
    if (!fecha) { sinFecha++; continue; }
    if (!dentro(fecha, rango)) continue;
    const contactos = Array.isArray(c.datos.clientesContactados) ? c.datos.clientesContactados.map(registro) : [];
    const enviados = contactos.filter(x => x.enviado === true);
    for (const x of new Set(enviados.map(e => texto(e.clienteId)).filter(Boolean))) conteo.set(x, (conteo.get(x) || 0) + 1);
    const r = c.datos.totalReactivados;
    filas.push({
      id: c.id, nombre: texto(c.datos.plantillaNombre) || 'Campaña sin nombre', fecha: fecha!,
      contactados: contactos.length, enviados: enviados.length,
      reactivados: typeof r === 'number' && Number.isFinite(r) && r >= 0 ? r : null,
    });
  }
  filas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return { filas, sinFecha, clientesRepetidos: [...conteo.values()].filter(n => n > 1).length };
}
