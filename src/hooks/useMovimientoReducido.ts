import { useEffect, useState } from 'react';

/** Escucha cambios de accesibilidad durante la sesión, incluso durante un gesto. */
export function useMovimientoReducido(): boolean {
  const consultar = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  const [reducido, setReducido] = useState(consultar);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const actualizar = () => setReducido(consulta.matches);
    actualizar();
    if (typeof consulta.addEventListener === 'function') {
      consulta.addEventListener('change', actualizar);
      return () => consulta.removeEventListener('change', actualizar);
    }
    consulta.addListener(actualizar);
    return () => consulta.removeListener(actualizar);
  }, []);
  return reducido;
}
