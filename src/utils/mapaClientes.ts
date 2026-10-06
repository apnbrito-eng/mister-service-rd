import { kmLineaRecta as kmEntre, tieneCoord } from './geo';
export { kmLineaRecta as kmEntre } from './geo';
/**
 * mapaClientes.ts — lógica pura del Mapa de clientes mejorado.
 * Destino: src/utils/mapaClientes.ts (probado con vitest). No toca Firestore.
 *
 * Reemplaza en el MAPA (no en otros sitios) a colorAntiguedadPin/etiquetaAntiguedadPin:
 * el rojo queda reservado para garantías (decisión de Jorge, 01/10/2026).
 */
import type { Cliente } from '../types';
import { mesesDesdeUltimoServicio } from './clientesFiltros';
import { inferirZona } from './zonas';

/* ---------- Antigüedad del último servicio ---------- */

export type Antiguedad = 'activo' | 'reciente' | 'enfriando' | 'frio' | 'sin_registro';

export const ANTIGUEDAD: Record<Antiguedad, { color: string; etiqueta: string }> = {
  activo: { color: '#15803d', etiqueta: 'Activo · menos de 3 meses' },
  reciente: { color: '#4a6fa5', etiqueta: '3 a 6 meses' },
  enfriando: { color: '#b45309', etiqueta: '6 a 12 meses' },
  frio: { color: '#64748b', etiqueta: 'Frío · más de 12 meses' },
  sin_registro: { color: '#cbd5e1', etiqueta: 'Sin registro' },
};
export const ORDEN_ANTIGUEDAD: Antiguedad[] = ['activo', 'reciente', 'enfriando', 'frio', 'sin_registro'];

export function antiguedadDe(meses: number | null): Antiguedad {
  if (meses === null) return 'sin_registro';
  if (meses < 3) return 'activo';
  if (meses < 6) return 'reciente';
  if (meses < 12) return 'enfriando';
  return 'frio';
}

/* ---------- Sector ---------- */

/**
 * Sector para agrupar: `cliente.sector` si existe (campo ya presente en la ficha),
 * si no la zona manual, si no la zona inferida por coordenadas. Normaliza mayúsculas/espacios.
 */
export function sectorDe(c: Pick<Cliente, 'sector' | 'zona' | 'lat' | 'lng'>): string {
  const limpio = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ');
  const s = limpio(c.sector);
  if (s) return s.replace(/\b\p{L}/gu, l => l.toUpperCase());
  return limpio(c.zona) || inferirZona(c.lat, c.lng) || 'Sin sector';
}

/* ---------- Métricas ---------- */

export type Metrica = 'clientes' | 'frios' | 'facturacion' | 'activos';
export const METRICA: Record<Metrica, string> = {
  clientes: 'Clientes',
  frios: 'Oportunidad: fríos +12 meses',
  facturacion: 'Facturación histórica',
  activos: 'Activos (−6 meses)',
};

/** Peso de un cliente en la capa de calor según la métrica (0 = no aparece). */
export function pesoCalor(c: Cliente, m: Metrica): number {
  const a = antiguedadDe(mesesDesdeUltimoServicio(c));
  switch (m) {
    case 'clientes': return 1;
    case 'frios': return a === 'frio' ? 1 : 0;
    case 'activos': return a === 'activo' || a === 'reciente' ? 1 : 0;
    case 'facturacion': return Math.min((c.legacyMetricas?.montoTotalHistorico ?? 0) / 40000, 1);
  }
}

export interface ResumenSector {
  sector: string;
  clientes: number;
  porAntiguedad: Record<Antiguedad, number>;
  friosConWhatsApp: number;
  facturacion: number;
  centro: { lat: number; lng: number } | null;
}

export function resumenPorSector(clientes: Cliente[], tieneWhatsApp: (c: Cliente) => boolean): ResumenSector[] {
  const m = new Map<string, ResumenSector & { _lat: number; _lng: number; _n: number }>();
  for (const c of clientes) {
    const s = sectorDe(c);
    const r = m.get(s) ?? { sector: s, clientes: 0, porAntiguedad: { activo: 0, reciente: 0, enfriando: 0, frio: 0, sin_registro: 0 }, friosConWhatsApp: 0, facturacion: 0, centro: null, _lat: 0, _lng: 0, _n: 0 };
    const a = antiguedadDe(mesesDesdeUltimoServicio(c));
    r.clientes++;
    r.porAntiguedad[a]++;
    if (a === 'frio' && tieneWhatsApp(c)) r.friosConWhatsApp++;
    r.facturacion += c.legacyMetricas?.montoTotalHistorico ?? 0;
    // Fix hallazgo QA 2026-10-01 §17: antes se validaba lat/lng por typeof number.
    // Eso dejaba pasar 0,0 (fuera de RD) y NaN. tieneCoord descarta ambos.
    if (tieneCoord(c)) { r._lat += c.lat; r._lng += c.lng; r._n++; }
    m.set(s, r);
  }
  return [...m.values()].map(({ _lat, _lng, _n, ...r }) => ({ ...r, centro: _n ? { lat: _lat / _n, lng: _lng / _n } : null }));
}

export function valorMetrica(r: ResumenSector, m: Metrica): number {
  switch (m) {
    case 'clientes': return r.clientes;
    case 'frios': return r.porAntiguedad.frio;
    case 'activos': return r.porAntiguedad.activo + r.porAntiguedad.reciente;
    case 'facturacion': return r.facturacion;
  }
}

export function ordenarSectores(rs: ResumenSector[], m: Metrica): ResumenSector[] {
  return [...rs].sort((a, b) => valorMetrica(b, m) - valorMetrica(a, m) || a.sector.localeCompare(b.sector));
}

/* ---------- Cerca de la ruta ---------- */



export interface ParadaRuta { lat: number; lng: number; hora: Date; ordenId: string }
export interface Oportunidad { cliente: Cliente; km: number; parada: number /* índice 0-based */ }

/**
 * Clientes fríos (+12 meses) con WhatsApp válido a menos de `radioKm` (línea recta) de alguna parada.
 * Excluye clientes que ya tienen cita en esa ruta. Ordena por cercanía.
 *
 * Fix hallazgo QA 2026-10-01 §17 + §18: solo cuenta clientes con coordenadas reales
 * (`tieneCoord`) y paradas con coordenadas válidas. Sin coordenadas, no se puede computar
 * cercanía y el cliente queda fuera (no se infiere).
 */
export function oportunidadesCercaDeRuta(
  clientes: Cliente[], paradas: ParadaRuta[], tieneWhatsApp: (c: Cliente) => boolean,
  opciones: { radioKm?: number; excluirIds?: Set<string> } = {},
): Oportunidad[] {
  const radio = opciones.radioKm ?? 2;
  const paradasValidas = paradas.filter(tieneCoord);
  if (!paradasValidas.length) return [];
  const out: Oportunidad[] = [];
  for (const c of clientes) {
    if (!tieneCoord(c)) continue;
    if (opciones.excluirIds?.has(c.id)) continue;
    if (antiguedadDe(mesesDesdeUltimoServicio(c)) !== 'frio' || !tieneWhatsApp(c)) continue;
    let mejor: Oportunidad | null = null;
    paradasValidas.forEach((p, i) => {
      const d = kmEntre({ lat: c.lat, lng: c.lng }, p);
      if (d <= radio && (!mejor || d < mejor.km)) mejor = { cliente: c, km: d, parada: i };
    });
    if (mejor) out.push(mejor);
  }
  return out.sort((a, b) => a.km - b.km);
}

export interface TextoOfertaOpts {
  /**
   * Cuando el rango elegido no es «mañana» (p. ej. una fecha específica o «hoy»), la operaria
   * necesita el texto correcto. Si no se pasa, se asume «mañana» por retrocompatibilidad.
   * Fix hallazgo QA 2026-10-01 §18: `DiaTecnico` decía siempre «mañana» aunque el rango fuera otro.
   */
  diaOferta?: 'manana' | 'hoy' | string; // string = texto literal (ej. «el viernes 10»)
}

/**
 * Texto prellenado para el compositor de WhatsApp (la operaria lo revisa y envía).
 * NO envía — solo compone. Jorge decide el canal final.
 */
export function textoOferta(nombreCliente: string, tecnico: string, sector: string, equipo?: string, opts: TextoOfertaOpts = {}): string {
  const primer = nombreCliente.trim().split(/\s+/)[0] ?? '';
  const cuando = opts.diaOferta === 'hoy' ? 'hoy'
    : opts.diaOferta && opts.diaOferta !== 'manana' ? opts.diaOferta
    : 'mañana';
  return `Hola ${primer}, le saluda Mister Service. ${cuando.charAt(0).toUpperCase() + cuando.slice(1)} ${tecnico} va a estar por ${sector}. ` +
    `¿Le gustaría aprovechar para darle mantenimiento a su ${equipo?.toLowerCase() || 'equipo'}?`;
}
