import { useEffect, useRef, useState } from 'react';
import { MapPin, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  cargarGooglePlaces,
  detectarCoordenadasURL,
  reverseGeocode,
} from '../../utils/direccion';

/**
 * Datos que el campo emite hacia el padre cada vez que cambia el texto
 * o se selecciona una sugerencia / GPS / URL.
 */
export interface CampoDireccionValor {
  direccion: string;
  lat?: number;
  lng?: number;
}

interface Props {
  valor: string;
  /** Opcional — si el padre ya tiene lat/lng (ej. al rehidratar) se reflejan en el badge */
  lat?: number;
  lng?: number;
  onChange: (datos: CampoDireccionValor) => void;
  placeholder?: string;
  /** Botón "Mi ubicación" — true por defecto. */
  mostrarBotonMiUbicacion?: boolean;
  className?: string;
  required?: boolean;
  inputClassName?: string;
}

// Tipo mínimo del Autocomplete que usamos (Google Maps API)
interface PlaceAutocompleteLike {
  getPlace: () => {
    formatted_address?: string;
    name?: string;
    geometry?: { location: { lat: () => number; lng: () => number } };
  };
  addListener: (event: string, cb: () => void) => void;
}

/**
 * Campo reutilizable de captura de dirección con:
 *   - Autocompletado Google Places (restringido a RD).
 *   - Botón "Mi ubicación" → geolocation + reverse geocode.
 *   - Detección de URL pegada (Google Maps, Apple Maps, Waze, "lat,lng" puro de
 *     compartir-ubicación de WhatsApp) → extrae coordenadas y reverse geocode.
 *
 * Si `VITE_GOOGLE_MAPS_KEY` no está disponible, degrada a input normal sin
 * autocomplete y deja el botón de geolocalización funcionando.
 */
export default function CampoDireccionConPlaces({
  valor,
  lat,
  lng,
  onChange,
  placeholder = 'Escribe un lugar, dirección o pega URL de Google Maps',
  mostrarBotonMiUbicacion = true,
  className = '',
  required = false,
  inputClassName = 'flex-1 px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition',
}: Props) {
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [placesDisponible, setPlacesDisponible] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<PlaceAutocompleteLike | null>(null);

  // Cargar el script de Google Places + inicializar Autocomplete sobre el input
  useEffect(() => {
    let cancelado = false;

    const init = () => {
      if (cancelado) return;
      const w = window as unknown as {
        google?: {
          maps?: {
            places?: {
              Autocomplete: new (i: HTMLInputElement, o: object) => PlaceAutocompleteLike;
            };
          };
        };
      };
      const places = w.google?.maps?.places;
      if (!places || !inputRef.current) return;
      try {
        acRef.current = new places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'do' },
          fields: ['formatted_address', 'geometry', 'name'],
        });
        acRef.current.addListener('place_changed', () => {
          if (!acRef.current) return;
          const place = acRef.current.getPlace();
          if (!place.geometry) return;
          const nombre = place.name || '';
          const dir = place.formatted_address || '';
          const textoFinal = nombre && !dir.startsWith(nombre) ? `${nombre}, ${dir}` : dir;
          onChange({
            direccion: textoFinal,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
          toast.success('Ubicación capturada');
        });
        setPlacesDisponible(true);
      } catch (err) {
        console.warn('Error inicializando Google Places:', err);
      }
    };

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
    if (!apiKey) {
      console.warn(
        'VITE_GOOGLE_MAPS_KEY no está definida — el campo de dirección funcionará sin autocompletado.',
      );
    }
    cargarGooglePlaces(apiKey).then(ok => {
      if (cancelado) return;
      if (!ok) return;
      // Pequeño delay por si el input recién montó
      setTimeout(init, 50);
    });

    return () => {
      cancelado = true;
      acRef.current = null;
    };
    // onChange intencionalmente NO en deps — no queremos re-inicializar el AC
    // si el padre re-crea el callback en cada render. La ref a la última versión
    // se mantiene viva por el closure dentro de `place_changed`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Detecta si lo que el usuario escribió o pegó es una URL con coordenadas.
   * Si lo es, extrae lat/lng y dispara reverse geocode para obtener una
   * dirección legible. Si no, pasa el texto tal cual.
   */
  const handleTextoChange = async (texto: string) => {
    const coords = detectarCoordenadasURL(texto);
    if (coords) {
      onChange({
        direccion: 'Obteniendo dirección...',
        lat: coords.lat,
        lng: coords.lng,
      });
      toast.success('Coordenadas exactas guardadas');
      const legible = await reverseGeocode(coords.lat, coords.lng);
      onChange({
        direccion: legible || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        lat: coords.lat,
        lng: coords.lng,
      });
      return;
    }
    // Texto normal — no tocar coords si ya estaban (Places ya las setteó)
    onChange({ direccion: texto, lat, lng });
  };

  const handleUbicacionActual = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización');
      return;
    }
    setCapturandoGps(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        const legible = await reverseGeocode(latitude, longitude);
        onChange({
          direccion: legible || valor || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          lat: latitude,
          lng: longitude,
        });
        setCapturandoGps(false);
        toast.success('Ubicación capturada');
      },
      err => {
        setCapturandoGps(false);
        toast.error('No se pudo obtener la ubicación: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const tieneCoords = typeof lat === 'number' && typeof lng === 'number';

  return (
    <div className={className}>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={valor}
          onChange={e => handleTextoChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={inputClassName}
        />
        {mostrarBotonMiUbicacion && (
          <button
            type="button"
            onClick={handleUbicacionActual}
            disabled={capturandoGps}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 disabled:opacity-50"
          >
            <MapPin size={12} />
            {capturandoGps ? 'Obteniendo...' : 'Mi ubicación'}
          </button>
        )}
      </div>
      {tieneCoords && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1 flex-wrap">
          <Check size={12} /> Coordenadas exactas guardadas ·{' '}
          <a
            href={`https://maps.google.com/?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-700 hover:underline font-medium"
          >
            Ver en Maps
          </a>
        </p>
      )}
      {!placesDisponible && (
        <p className="text-[10px] text-gray-400 mt-1">
          Tip: pega una URL de Google Maps o usa &quot;Mi ubicación&quot; para guardar coordenadas exactas.
        </p>
      )}
    </div>
  );
}
