import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import MiniMapaCliente from '../ordenes/MiniMapaCliente';
import { DireccionCliente } from '../../types';
import { agregarDireccionCliente } from '../../services/clientes.service';
import { detectarCoordenadasURL, reverseGeocode, cargarGooglePlaces } from '../../utils/direccion';
import { MapPin, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNombre: string;
  onSaved?: (direccion: DireccionCliente) => void;
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

export default function AgregarDireccionModal({
  isOpen,
  onClose,
  clienteId,
  clienteNombre,
  onSaved,
}: Props) {
  const [etiqueta, setEtiqueta] = useState('');
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<PlaceAutocompleteLike | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setEtiqueta('');
      setDireccion('');
      setReferencia('');
      setLat(undefined);
      setLng(undefined);
    }
  }, [isOpen]);

  // Cargar e inicializar Google Places
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;

    const init = () => {
      if (cancelado) return;
      const w = window as unknown as {
        google?: { maps?: { places?: { Autocomplete: new (i: HTMLInputElement, o: object) => PlaceAutocompleteLike } } };
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
          setDireccion(textoFinal);
          setLat(place.geometry.location.lat());
          setLng(place.geometry.location.lng());
          toast.success('📍 Ubicación de Google capturada');
        });
      } catch (err) {
        console.warn('Error inicializando Places:', err);
      }
    };

    cargarGooglePlaces(import.meta.env.VITE_GOOGLE_MAPS_KEY).then(ok => {
      if (cancelado) return;
      if (!ok) return;
      // Esperar a que el input esté montado
      setTimeout(init, 100);
    });

    return () => {
      cancelado = true;
      acRef.current = null;
    };
  }, [isOpen]);

  /**
   * onChange del input — además del texto, detecta si pegaron una URL de Google Maps,
   * Apple Maps, Waze, share-location de WhatsApp, etc., y extrae las coordenadas.
   */
  const handleDireccionChange = async (texto: string) => {
    const coords = detectarCoordenadasURL(texto);
    if (coords) {
      setLat(coords.lat);
      setLng(coords.lng);
      setDireccion('Obteniendo dirección...');
      toast.success('📍 Coordenadas exactas guardadas');
      const legible = await reverseGeocode(coords.lat, coords.lng);
      setDireccion(legible || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
      return;
    }
    setDireccion(texto);
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
        setLat(latitude);
        setLng(longitude);
        const legible = await reverseGeocode(latitude, longitude);
        if (legible) setDireccion(legible);
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

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!etiqueta.trim()) {
      toast.error('La etiqueta es obligatoria (ej: "Mamá", "Oficina")');
      return;
    }
    if (!direccion.trim()) {
      toast.error('Escribe la dirección');
      return;
    }
    setSaving(true);
    try {
      const nuevaDir: Omit<DireccionCliente, 'id'> = {
        etiqueta: etiqueta.trim(),
        direccion: direccion.trim(),
      };
      if (referencia.trim()) nuevaDir.referencia = referencia.trim();
      if (typeof lat === 'number') nuevaDir.lat = lat;
      if (typeof lng === 'number') nuevaDir.lng = lng;

      const id = await agregarDireccionCliente(clienteId, nuevaDir);
      toast.success('Dirección agregada');
      onSaved?.({ id, ...nuevaDir });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar la dirección');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Nueva dirección · ${clienteNombre}`} size="md">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Etiqueta <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={etiqueta}
            onChange={e => setEtiqueta(e.target.value)}
            placeholder='Ej: "Mamá", "Oficina", "Casa hermana en Naco"'
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            autoFocus
          />
          <p className="text-[11px] text-gray-500 mt-1">Así distingues esta dirección de las demás.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Dirección <span className="text-red-500">*</span>
            <span className="ml-2 text-[10px] text-gray-400 font-normal">
              (Busca en Google, pega URL de Maps o location de WhatsApp)
            </span>
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={direccion}
              onChange={e => handleDireccionChange(e.target.value)}
              placeholder="Escribe un lugar, dirección o pega URL de Google Maps"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={handleUbicacionActual}
              disabled={capturandoGps}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 disabled:opacity-50"
            >
              <MapPin size={12} />
              {capturandoGps ? 'Obteniendo...' : 'Mi ubicación'}
            </button>
          </div>
          {lat !== undefined && lng !== undefined && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <Check size={12} /> Coordenadas exactas guardadas ·{' '}
              <a
                href={`https://maps.google.com/?q=${lat},${lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 hover:underline font-medium"
              >
                Ver en Maps →
              </a>
            </p>
          )}
          {lat !== undefined && lng !== undefined && (
            <MiniMapaCliente lat={lat} lng={lng} direccion={direccion} />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Referencia <span className="text-gray-400">(opcional)</span>
          </label>
          <input
            type="text"
            value={referencia}
            onChange={e => setReferencia(e.target.value)}
            placeholder="Al lado del colmado, casa amarilla..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar dirección'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
