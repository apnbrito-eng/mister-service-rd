/**
 * selectoresPanel.ts — selectores PUROS que resuelven qué contenido mostrar
 * en el panel del Mapa dado un `vista.modo + ordenId` y las fuentes
 * disponibles (`ordenesRango`, `abiertosPorTec`, etc.). Son puros: no tocan
 * window, no navegan, no leen hooks de React. Esto permite probarlos sin
 * jsdom y, sobre todo, evita el bug `setTimeout(navigate, 100)` dentro del
 * render que expulsaba al usuario del Mapa.
 */
import type { OrdenServicio } from '../../types';
import type { EstadoAbiertosTecnico } from '../../hooks/useMapaDatos';

export type ResultadoAccesoCita =
  | { tipo: 'en_rango'; orden: OrdenServicio }
  | { tipo: 'backlog'; orden: OrdenServicio }
  | { tipo: 'cargando' }
  | { tipo: 'ausente' };

/**
 * Resuelve una orden por id contra la caja de órdenes del rango activo + el
 * backlog por técnico ya consultado. Si aún no está, reporta `cargando` (si
 * algún backlog está cargando) o `ausente` (todos listos y no apareció).
 *
 * NUNCA navega. El consumidor decide: botón "Abrir en Órdenes" si quiere.
 */
export function resolverCita(
  ordenId: string,
  ordenesRango: OrdenServicio[],
  abiertosPorTec: Record<string, EstadoAbiertosTecnico>,
): ResultadoAccesoCita {
  const enRango = ordenesRango.find((o) => o.id === ordenId);
  if (enRango) return { tipo: 'en_rango', orden: enRango };
  for (const est of Object.values(abiertosPorTec)) {
    const encontrada = est.ordenes.find((o) => o.id === ordenId);
    if (encontrada) return { tipo: 'backlog', orden: encontrada };
  }
  const algunoCargando = Object.values(abiertosPorTec).some((e) => e.cargando);
  if (algunoCargando) return { tipo: 'cargando' };
  return { tipo: 'ausente' };
}

/**
 * Devuelve la unión de ordenes de backlog para los alias de un técnico
 * (uid + docId) sin duplicar por id. Usado al abrir ficha técnico.
 */
export function unionBacklog(
  aliases: string[],
  abiertosPorTec: Record<string, EstadoAbiertosTecnico>,
): OrdenServicio[] {
  const seen = new Set<string>();
  const out: OrdenServicio[] = [];
  for (const id of aliases) {
    const est = abiertosPorTec[id];
    if (!est) continue;
    for (const o of est.ordenes) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
    }
  }
  return out;
}

/**
 * Huella estable que identifica si un resultado de Routes aún aplica para la
 * ruta visible: técnico + día + secuencia exacta de coordenadas. Un cambio en
 * cualquiera invalida el resultado. Se incluye `trafico` porque el cálculo
 * sin/con tráfico tiene edades distintas y Routes los diferencia.
 */
export function huellaRuta(
  tecnicoId: string,
  diaRD: string,
  coords: ReadonlyArray<{ lat: number; lng: number }>,
  trafico: boolean,
): string {
  const paradas = coords.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join(';');
  return `${tecnicoId}|${diaRD}|${trafico ? 'T' : 'N'}|${paradas}`;
}

/** Edad máxima permitida al pintar geometría Google en pantalla. */
export const MAX_EDAD_RUTA_MS_SIN_TRAFICO = 30 * 60_000;
export const MAX_EDAD_RUTA_MS_CON_TRAFICO = 10 * 60_000;

/**
 * ¿El resultado de Routes puede pintarse ahora? False cuando:
 *  - La huella no coincide (otro técnico/día/coords/tráfico).
 *  - La respuesta no es Google.
 *  - La edad excede el umbral.
 */
export function rutaPintable(
  resultado: { huella: string; calculadoEn: number; fuente: 'google' | 'estimado'; trafico: boolean } | null,
  huellaActual: string,
  ahoraMs: number,
): boolean {
  if (!resultado) return false;
  if (resultado.huella !== huellaActual) return false;
  if (resultado.fuente !== 'google') return false;
  const edad = ahoraMs - resultado.calculadoEn;
  const limite = resultado.trafico ? MAX_EDAD_RUTA_MS_CON_TRAFICO : MAX_EDAD_RUTA_MS_SIN_TRAFICO;
  return edad >= 0 && edad <= limite;
}
