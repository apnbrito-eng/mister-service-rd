/**
 * clusterPantalla.ts — agrupa clientes en la pantalla sin librerías.
 * Destino: src/utils/clusterPantalla.ts
 *
 * Con 10,000+ clientes no se pueden crear 10,000 marcadores. En cada «idle» del mapa:
 *  1) se toman solo los clientes dentro de lo visible,
 *  2) se agrupan en celdas de N píxeles,
 *  3) se dibujan los grupos (con su número y la mezcla de antigüedad) y los sueltos.
 * Resultado: nunca más de ~300 marcadores en pantalla.
 */
import type { LatLng } from './geo';

export interface Limites { norte: number; sur: number; este: number; oeste: number }
export interface Grupo<T> { id: string; centro: LatLng; items: T[] }

/** Proyección Web Mercator a píxeles del mundo para un zoom dado (la misma de Google). */
export function aPixel(p: LatLng, zoom: number): { x: number; y: number } {
  const escala = 256 * 2 ** zoom;
  const s = Math.min(Math.max(Math.sin((p.lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: ((p.lng + 180) / 360) * escala, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * escala };
}

export const dentro = (p: LatLng, l: Limites) => p.lat <= l.norte && p.lat >= l.sur && p.lng <= l.este && p.lng >= l.oeste;

const MAX_INTENTOS = 30;

/**
 * Agrupa los puntos visibles. Desde `zoomSueltos` en adelante no agrupa (se ven todos).
 * `max` corta por seguridad: si aun así hay demasiados sueltos, agrupa con celdas más grandes.
 *
 * Fix hallazgo QA 2026-10-01 §3: antes se intentaban SOLO 4 tamaños, así que con
 * 10,000 puntos a zoom 22 devolvía 10,000 grupos. Ahora se duplica el tamaño de celda
 * mientras `celdas.size > max`, con tope duro de MAX_INTENTOS para no colgar.
 * Siempre se preservan TODOS los puntos (cada punto aparece exactamente en un grupo).
 */
export function agruparEnPantalla<T extends LatLng & { id: string }>(
  puntos: T[], limites: Limites, zoom: number, opts: { celdaPx?: number; zoomSueltos?: number; max?: number } = {},
): Grupo<T>[] {
  const celda = opts.celdaPx ?? 56, zoomSueltos = opts.zoomSueltos ?? 16, max = opts.max ?? 300;
  // margen de media pantalla para que no "salten" al mover
  const dLat = (limites.norte - limites.sur) * 0.25, dLng = (limites.este - limites.oeste) * 0.25;
  const l = { norte: limites.norte + dLat, sur: limites.sur - dLat, este: limites.este + dLng, oeste: limites.oeste - dLng };
  const vis = puntos.filter(p => dentro(p, l));
  if (!vis.length) return [];
  if (zoom >= zoomSueltos && vis.length <= max) return vis.map(p => ({ id: p.id, centro: { lat: p.lat, lng: p.lng }, items: [p] }));

  // Precalculamos las coordenadas en píxel una sola vez para no repetir aPixel en cada intento.
  const px = new Array<{ x: number; y: number; p: T }>(vis.length);
  for (let i = 0; i < vis.length; i++) px[i] = { ...aPixel(vis[i], zoom), p: vis[i] };

  let tam = celda;
  let ultimo: Map<string, T[]> | null = null;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const celdas = new Map<string, T[]>();
    for (const { x, y, p } of px) {
      const k = `${Math.floor(x / tam)}_${Math.floor(y / tam)}`;
      const bucket = celdas.get(k);
      if (bucket) bucket.push(p); else celdas.set(k, [p]);
    }
    ultimo = celdas;
    if (celdas.size <= max) break;
    tam *= 2;
  }
  const celdas = ultimo!;
  return [...celdas.entries()].map(([k, items]) => ({
    id: items.length === 1 ? items[0].id : `g_${zoom}_${tam}_${k}`,
    centro: { lat: items.reduce((a, p) => a + p.lat, 0) / items.length, lng: items.reduce((a, p) => a + p.lng, 0) / items.length },
    items,
  }));
}
