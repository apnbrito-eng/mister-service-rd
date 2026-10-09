/**
 * Helpers del catálogo de severidad (Lote A auditoría alertas 2026-10-08).
 *
 * Vive en un archivo .ts separado del componente `Alerta.tsx` para no
 * disparar la regla `react-refresh/only-export-components` del repo:
 * un archivo .tsx de componente no puede exportar funciones no-componente.
 *
 * Devuelve la clase CSS asociada a cada severidad. Útil cuando no se puede
 * usar el componente (markup legacy, elementos sin JSX propio) pero se
 * necesita consistencia visual.
 */

export type SeveridadAlerta = 'exito' | 'atencion' | 'fallo' | 'info' | 'neutro';

export function claseAlerta(severidad: SeveridadAlerta): string {
  return `alerta alerta-${severidad}`;
}
