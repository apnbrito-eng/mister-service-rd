/**
 * Testimonios de la HomePage pública.
 *
 * SPRINT-DISENO-D (2026-05-31). El negocio está en fase pre-launch:
 * NO inventar testimonios reales (sub-regla CLAUDE.md "no inventar
 * contenido de cliente").
 *
 * En producción la sección queda **oculta** mientras `activo === false`.
 * En desarrollo (`import.meta.env.DEV`) la sección se renderiza con
 * placeholders visuales para que Jorge pueda previsualizar el diseño
 * sin que se publiquen testimonios falsos.
 *
 * Cómo activar cuando Jorge tenga 3 testimonios reales del lanzamiento:
 *   1. Editar este archivo.
 *   2. Cambiar `activo: false` → `activo: true`.
 *   3. Reemplazar cada objeto del array `testimonios` con los datos
 *      reales (nombre, barrio, equipo, frase, fotoUrl opcional).
 *   4. Commit + push. La sección aparecerá automáticamente en la
 *      HomePage pública.
 *
 * Notas:
 * - `fotoUrl` es opcional. Si falta, el componente muestra la inicial
 *   del nombre sobre un círculo brand.
 * - `frase` debe ser corta (1-3 líneas). Si el cliente dio un audio o
 *   un texto largo, Jorge resume.
 * - El orden del array es el orden visual.
 */
export interface TestimonioConfig {
  nombre: string;
  barrio: string;
  equipo: string;
  frase: string;
  fotoUrl?: string;
}

export interface TestimoniosHomePageConfig {
  /** Si false (default), la sección NO se renderiza en producción. */
  activo: boolean;
  testimonios: TestimonioConfig[];
}

export const testimoniosHomePage: TestimoniosHomePageConfig = {
  activo: false,
  testimonios: [
    {
      nombre: '[Nombre del cliente]',
      barrio: '[Barrio o sector]',
      equipo: '[Equipo reparado]',
      frase: '[Frase corta del cliente, 1-3 líneas]',
    },
    {
      nombre: '[Nombre del cliente]',
      barrio: '[Barrio o sector]',
      equipo: '[Equipo reparado]',
      frase: '[Frase corta del cliente, 1-3 líneas]',
    },
    {
      nombre: '[Nombre del cliente]',
      barrio: '[Barrio o sector]',
      equipo: '[Equipo reparado]',
      frase: '[Frase corta del cliente, 1-3 líneas]',
    },
  ],
};
