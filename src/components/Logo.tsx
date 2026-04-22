interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  /**
   * Prop heredada. Ya no afecta la apariencia porque los PNGs del brand
   * tienen colores propios. Se mantiene para compatibilidad con call sites.
   */
  white?: boolean;
  /**
   * Fuerza la variante compacta (solo personaje). Si no se pasa, la variante
   * se deriva de `size`: `sm` usa compacto, `md`/`lg` usan el logo completo.
   */
  compact?: boolean;
}

/**
 * Logo oficial de Mister Service RD.
 *
 * Renderiza directamente los PNGs servidos desde `public/`:
 *  - `/logo-full.png`      → logo completo (personaje + texto).
 *  - `/logo-compacto.png`  → solo personaje, para espacios reducidos.
 *
 * Ambas imágenes tienen fondo transparente y el texto ya incrustado, por eso
 * no se renderiza texto adicional dentro de este componente.
 */
export default function Logo({ size = 'md', compact }: LogoProps) {
  const useCompact = compact ?? size === 'sm';

  // Altura en píxeles por variante. Ancho queda "auto" para preservar aspect ratio.
  const heights = {
    sm: useCompact ? 36 : 32,
    md: useCompact ? 48 : 52,
    lg: useCompact ? 64 : 72,
  };

  const src = useCompact ? '/logo-compacto.png' : '/logo-full.png';
  const alt = 'Mister Service RD';
  const height = heights[size];

  return (
    <img
      src={src}
      alt={alt}
      style={{ height, width: 'auto' }}
      className="block select-none"
      draggable={false}
    />
  );
}
