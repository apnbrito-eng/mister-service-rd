import { useState, useRef, useEffect, useCallback } from 'react';
import { CampoFormulario as CampoType } from '../../types/formularios';
import { MapPin } from 'lucide-react';
import MiniMapaCliente from '../ordenes/MiniMapaCliente';

interface Props {
  campo: CampoType;
  value: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onChange: (value: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  error?: string;
}

const inputClasses =
  'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[3rem]';

const errorClasses = 'text-red-500 text-xs mt-1';

export default function CampoFormulario({ campo, value, onChange, error }: Props) {
  const [geoLoading, setGeoLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // -- Address coords (local only — not sent via onChange to preserve schema) --
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  // -- Firma (signature) state --
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // Google Places Autocomplete for 'direccion' field
  useEffect(() => {
    if (campo.tipo !== 'direccion') return;

    const initAC = () => {
      if (!dirInputRef.current || !window.google?.maps?.places) return;
      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        dirInputRef.current,
        {
          componentRestrictions: { country: 'do' },
          fields: ['formatted_address', 'geometry', 'name'],
        }
      );
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (!place.geometry) return;
        const nombre = place.name || '';
        const direccion = place.formatted_address || '';
        const textoFinal = nombre && !direccion.startsWith(nombre)
          ? `${nombre}, ${direccion}`
          : direccion;
        onChange(textoFinal);
        setCoords({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      });
    };

    if (window.google?.maps?.places) {
      initAC();
      return;
    }

    if (!document.getElementById('google-places-script')) {
      const script = document.createElement('script');
      script.id = 'google-places-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&libraries=places&language=es`;
      script.async = true;
      script.defer = true;
      script.onload = initAC;
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(interval);
          initAC();
        }
      }, 100);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campo.tipo]);

  // Setup canvas white background once
  useEffect(() => {
    if (campo.tipo !== 'firma') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [campo.tipo]);

  // -- Firma drawing helpers --
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if ('touches' in e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const handleDrawStart = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      const { x, y } = getCanvasCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    [getCanvasCoords],
  );

  const handleDrawMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      const { x, y } = getCanvasCoords(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [getCanvasCoords],
  );

  const handleDrawEnd = useCallback(() => {
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onChange(blob);
    }, 'image/png');
  }, [onChange]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    onChange(null);
  }, [onChange]);

  // -- Geolocation helpers --
  const handleGetAddress = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=es`,
            { headers: { 'Accept-Language': 'es' } },
          );
          const data = await res.json();
          onChange(data.display_name || `${latitude}, ${longitude}`);
        } catch {
          onChange(`${latitude}, ${longitude}`);
        } finally {
          setGeoLoading(false);
        }
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true },
    );
  }, [onChange]);

  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true },
    );
  }, [onChange]);

  // -- File change helpers --
  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (file) {
        setImagePreview(URL.createObjectURL(file));
        onChange(file);
      }
    },
    [onChange],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (file) {
        setFileName(file.name);
        onChange(file);
      }
    },
    [onChange],
  );

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // -- Multiple selection helper --
  const handleMultipleToggle = useCallback(
    (option: string) => {
      const current: string[] = Array.isArray(value) ? value : [];
      if (current.includes(option)) {
        onChange(current.filter((v) => v !== option));
      } else {
        onChange([...current, option]);
      }
    },
    [value, onChange],
  );

  // -- Render input by type --
  const renderInput = () => {
    switch (campo.tipo) {
      case 'texto':
        return (
          <input
            type="text"
            className={inputClasses}
            placeholder={campo.placeholder}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'numero':
        return (
          <input
            type="number"
            className={inputClasses}
            placeholder={campo.placeholder}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'email':
        return (
          <input
            type="email"
            className={inputClasses}
            placeholder={campo.placeholder}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'telefono':
        return (
          <input
            type="tel"
            className={inputClasses}
            placeholder={campo.placeholder || '829-555-1234'}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'textarea':
        return (
          <textarea
            rows={4}
            className={inputClasses}
            placeholder={campo.placeholder}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'seleccion':
        return (
          <select
            className={inputClasses}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {campo.opciones.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        );

      case 'seleccion_multiple':
        return (
          <div className="flex flex-col gap-2">
            {campo.opciones.map((op) => {
              const checked = Array.isArray(value) && value.includes(op);
              return (
                <label
                  key={op}
                  className="flex items-center gap-2 min-h-[3rem] cursor-pointer text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    checked={checked}
                    onChange={() => handleMultipleToggle(op)}
                  />
                  {op}
                </label>
              );
            })}
          </div>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 min-h-[3rem] cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
            />
            {campo.etiqueta}
          </label>
        );

      case 'fecha':
        return (
          <input
            type="date"
            className={inputClasses}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'direccion':
        return (
          <div className="space-y-2">
            <input
              ref={dirInputRef}
              type="text"
              className={inputClasses}
              placeholder={campo.placeholder || 'Escribe un lugar, dirección o usa GPS'}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              disabled={geoLoading}
              onClick={handleGetAddress}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 min-h-[3rem]"
            >
              {geoLoading ? (
                'Obteniendo ubicación...'
              ) : (
                <>
                  <MapPin className="w-4 h-4" />
                  Usar mi ubicación
                </>
              )}
            </button>
            {coords && (
              <MiniMapaCliente lat={coords.lat} lng={coords.lng} direccion={value || ''} />
            )}
          </div>
        );

      case 'foto':
        return (
          <div className="space-y-2">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              className={inputClasses + ' cursor-pointer'}
            />
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Vista previa"
                className="w-full max-w-xs rounded-xl border border-gray-200 object-cover"
              />
            )}
          </div>
        );

      case 'archivo':
        return (
          <div className="space-y-1">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.png,.jpeg"
              onChange={handleFileChange}
              className={inputClasses + ' cursor-pointer'}
            />
            {fileName && (
              <p className="text-xs text-gray-500 truncate">Archivo: {fileName}</p>
            )}
          </div>
        );

      case 'firma':
        return (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={300}
              height={150}
              className="w-full max-w-[300px] border border-gray-200 rounded-xl touch-none bg-white"
              onMouseDown={handleDrawStart}
              onMouseMove={handleDrawMove}
              onMouseUp={handleDrawEnd}
              onMouseLeave={handleDrawEnd}
              onTouchStart={handleDrawStart}
              onTouchMove={handleDrawMove}
              onTouchEnd={handleDrawEnd}
            />
            <button
              type="button"
              onClick={clearCanvas}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors min-h-[3rem]"
            >
              Limpiar
            </button>
          </div>
        );

      case 'ubicacion':
        return (
          <div className="space-y-2">
            <button
              type="button"
              disabled={geoLoading}
              onClick={handleGetLocation}
              className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 min-h-[3rem]"
            >
              {geoLoading ? (
                'Capturando...'
              ) : (
                <>
                  <MapPin className="w-4 h-4" />
                  Capturar mi ubicación
                </>
              )}
            </button>
            {value && value.lat != null && value.lng != null && (
              <>
                <p className="text-xs text-gray-500">
                  Lat: {value.lat.toFixed(6)}, Lng: {value.lng.toFixed(6)}
                </p>
                <MiniMapaCliente lat={value.lat} lng={value.lng} />
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // For checkbox type, the label is rendered inline with the input
  const showLabelAbove = campo.tipo !== 'checkbox';

  return (
    <div className="mb-4">
      {showLabelAbove && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {campo.etiqueta}
          {campo.requerido && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {renderInput()}

      {error && <p className={errorClasses}>{error}</p>}
    </div>
  );
}
