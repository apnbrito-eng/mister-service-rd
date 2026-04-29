import { GradientPreset } from '../services/configWeb.service';

/**
 * Mapping fijo de los 6 presets de gradient. Cada preset define `from`,
 * `via`, `to` (hex literales) que se usan en `linear-gradient(to bottom
 * right, from, via, to)`. NO usar clases dinámicas de Tailwind: el JIT
 * compiler no puede resolverlas en runtime. Style inline es la opción
 * correcta — sin necesidad de safelist.
 */
const PRESETS_GRADIENT: Record<
  Exclude<GradientPreset, 'personalizado'>,
  { from: string; via: string; to: string }
> = {
  'navy': { from: '#0f3460', via: '#0f3460', to: '#1a5fa8' },
  'azul-profesional': { from: '#1e40af', via: '#1d4ed8', to: '#2563eb' },
  'verde-corporate': { from: '#064e3b', via: '#047857', to: '#10b981' },
  'negro-elegante': { from: '#18181b', via: '#27272a', to: '#3f3f46' },
  'rojo-energy': { from: '#7f1d1d', via: '#991b1b', to: '#dc2626' },
  'gris-minimalista': { from: '#374151', via: '#4b5563', to: '#6b7280' },
};

/**
 * Resuelve los colores `{ from, via, to }` que se aplicarán al
 * `linear-gradient`. Si el preset es `'personalizado'` y los hex
 * personalizados son válidos, se usan. Si están ausentes o inválidos,
 * fallback a los del preset `'navy'` para no dejar el hero sin fondo.
 *
 * Compartido entre el componente público (`HeroConGradient`) y el editor
 * admin (`ConfiguracionWeb`) que muestra previews.
 */
export function obtenerColoresGradient(
  preset: GradientPreset,
  customFrom?: string,
  customTo?: string,
): { from: string; via: string; to: string } {
  if (preset === 'personalizado') {
    const from = customFrom || '#0f3460';
    const to = customTo || '#1a5fa8';
    // En el modo personalizado no hay punto medio explícito; reusamos
    // `from` para que el gradient sea suave de un color a otro sin
    // introducir un tercer tono.
    return { from, via: from, to };
  }
  return PRESETS_GRADIENT[preset] ?? PRESETS_GRADIENT['navy'];
}
