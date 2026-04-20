import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { DireccionCliente } from '../../types';
import { agregarDireccionCliente } from '../../services/clientes.service';
import { MapPin, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNombre: string;
  /** Se llama cuando se creó la dirección; recibe la dirección completa. */
  onSaved?: (direccion: DireccionCliente) => void;
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

  useEffect(() => {
    if (isOpen) {
      setEtiqueta('');
      setDireccion('');
      setReferencia('');
      setLat(undefined);
      setLng(undefined);
    }
  }, [isOpen]);

  const handleUbicacionActual = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización');
      return;
    }
    setCapturandoGps(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
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
    <Modal isOpen={isOpen} onClose={onClose} title={`Nueva dirección · ${clienteNombre}`} size="sm">
      <form onSubmit={guardar} className="space-y-3">
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
          </label>
          <input
            type="text"
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            placeholder="Calle Principal #123, Sector, Santo Domingo"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
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

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Coordenadas <span className="text-gray-400">(opcional)</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUbicacionActual}
              disabled={capturandoGps}
              className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium disabled:opacity-60"
            >
              <MapPin size={12} />
              {capturandoGps ? 'Obteniendo...' : 'Usar mi ubicación'}
            </button>
            {lat !== undefined && lng !== undefined && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2">
                <Check size={12} /> {lat.toFixed(4)}, {lng.toFixed(4)}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Si estás en el sitio, usa "Mi ubicación" para guardar GPS preciso. Si no, déjalo en blanco — se resuelve después.
          </p>
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
