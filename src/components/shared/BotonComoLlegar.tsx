import { Navigation } from 'lucide-react';
import { googleMapsDirectionsUrl, type CoordsGPS } from '../../utils/maps';

interface Props {
  ubicacion?: CoordsGPS | null;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'inline' | 'block';
  className?: string;
  /** Texto del botón. Default: "Cómo llegar". */
  label?: string;
}

const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-1.5',
  lg: 'px-4 py-2.5 text-base gap-2',
};

const ICON_SIZE: Record<NonNullable<Props['size']>, number> = {
  sm: 12,
  md: 14,
  lg: 18,
};

/**
 * Botón reusable que abre Google Maps con direcciones desde la ubicación
 * actual del usuario hasta `ubicacion`. Si `ubicacion` está ausente o es
 * inválida, el botón queda deshabilitado con tooltip explicativo.
 *
 * Detiene la propagación del click (`stopPropagation`) para que se pueda
 * usar adentro de filas/cards clickeables sin disparar el handler del row.
 */
export default function BotonComoLlegar({
  ubicacion,
  size = 'md',
  variant = 'inline',
  className = '',
  label = 'Cómo llegar',
}: Props) {
  const url = googleMapsDirectionsUrl(ubicacion);
  const blockClass = variant === 'block' ? 'w-full justify-center' : '';

  if (!url) {
    return (
      <button
        type="button"
        disabled
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center ${SIZE_CLASSES[size]} bg-gray-100 text-gray-400 font-medium rounded-lg cursor-not-allowed ${blockClass} ${className}`}
        title="Sin coordenadas GPS — agregar dirección con ubicación"
        aria-label="Cómo llegar (sin coordenadas GPS disponibles)"
      >
        <Navigation size={ICON_SIZE[size]} />
        {label}
      </button>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center ${SIZE_CLASSES[size]} bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors ${blockClass} ${className}`}
      title="Abrir Google Maps con direcciones"
      aria-label="Cómo llegar a la ubicación con Google Maps"
    >
      <Navigation size={ICON_SIZE[size]} />
      {label}
    </a>
  );
}
