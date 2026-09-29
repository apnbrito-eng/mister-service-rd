import type { Transition } from 'motion/react';

/**
 * Movimiento compartido. Solo transform/opacity; nunca cifras ni lógica de negocio.
 * Springs físicos: duration+bounce no conserva velocidad en Motion.
 * Respuesta de referencia ~0.4s; el tiempo real depende del recorrido y velocidad.
 */
export const RESORTE_PREDETERMINADO = {
  type: 'spring',
  mass: 1,
  stiffness: 400,
  damping: 40,
} as const satisfies Transition;

/** ζ=0.8: rebote leve permitido únicamente después de un gesto físico. */
export const RESORTE_GESTO = {
  type: 'spring',
  mass: 1,
  stiffness: 400,
  damping: 32,
} as const satisfies Transition;

/** Sin desplazamiento autónomo ni fundido obligatorio. No es un spring. */
export const MOVIMIENTO_REDUCIDO = { duration: 0 } as const satisfies Transition;
export const ESCALA_PRESION = 0.97;
export const ESCALA_ENTRADA = 0.97;
export const DESPLAZAMIENTO_PANEL = 16;
export const UMBRAL_ARRASTRE = 6;
export const MUESTRA_VELOCIDAD_MS = 100;
export const DESACELERACION_GESTO = 0.998;

/** Motion recibe velocidad absoluta (px/s), nunca dividida entre distancia. */
export function obtenerTransicionMovimiento(
  reducido: boolean,
  gesto = false,
  velocidad?: number,
): Transition {
  if (reducido) return MOVIMIENTO_REDUCIDO;
  const resorte = gesto ? RESORTE_GESTO : RESORTE_PREDETERMINADO;
  return velocidad === undefined || !Number.isFinite(velocidad)
    ? resorte
    : { ...resorte, velocity: velocidad };
}

/** Proyectar primero; el consumidor elige destino válido y limita al viewport. */
export function proyectarDestinoMovimiento(posicion: number, velocidad: number): number {
  if (!Number.isFinite(velocidad)) return posicion;
  return posicion + (velocidad / 1000) * DESACELERACION_GESTO / (1 - DESACELERACION_GESTO);
}

/** Solo presentación inicial de imágenes decorativas; nunca retrasa controles. */
export const SEPARACION_ENTRADA_EQUIPOS = 0.055;
