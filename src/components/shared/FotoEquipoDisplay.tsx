import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface FotoEquipoDisplayProps {
  /** URL pública de la foto del equipo. Si está vacía o undefined, no
   *  renderiza nada (no ocupa espacio). */
  url?: string;
  /** Tamaño del thumbnail. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  /** Clase extra que se concatena al contenedor del thumbnail. */
  className?: string;
  /** Texto alternativo accesible. Default "Foto del equipo". */
  alt?: string;
}

const SIZE_CLASSES: Record<NonNullable<FotoEquipoDisplayProps['size']>, string> = {
  sm: 'w-16 h-16 rounded-md',
  md: 'w-[120px] h-[120px] rounded-lg',
  lg: 'w-[200px] h-[200px] rounded-lg',
};

/**
 * Muestra un thumbnail clickeable con la foto del equipo. Al hacer click se
 * abre un lightbox modal full-screen con la imagen a tamaño completo.
 * Cierra con tecla ESC, click en backdrop, o botón X.
 *
 * Si `url` no está poblada, no renderiza nada — los callers no necesitan
 * envolver con condicional, pero por claridad varios sí lo hacen.
 */
export default function FotoEquipoDisplay({
  url,
  size = 'md',
  className = '',
  alt = 'Foto del equipo',
}: FotoEquipoDisplayProps) {
  const [abierto, setAbierto] = useState(false);

  // Cerrar lightbox con ESC
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto]);

  if (!url) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`block overflow-hidden border border-gray-200 hover:border-primary-medium transition-colors ${SIZE_CLASSES[size]} ${className}`}
        title="Ver foto del equipo"
      >
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          // z-[60] (NO z-50): el Modal genérico del repo usa z-50, así que
          // si el lightbox se abre desde dentro de un modal (ej.
          // OrdenDetailModal) necesita estar por encima. Sin portal — el
          // bump de z-index es suficiente para v1.
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setAbierto(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAbierto(false);
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          <img
            src={url}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
