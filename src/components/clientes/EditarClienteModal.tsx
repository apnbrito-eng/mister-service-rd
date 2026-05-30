import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import Modal from '../Modal';
import MiniMapaCliente from '../ordenes/MiniMapaCliente';
import { Cliente, DireccionCliente } from '../../types';
import {
  actualizarCliente,
  actualizarDireccionCliente,
  eliminarDireccionCliente,
} from '../../services/clientes.service';
import AgregarDireccionModal from './AgregarDireccionModal';
import { detectarCoordenadasURL, reverseGeocode, cargarGooglePlaces } from '../../utils/direccion';
import { Home, Edit2, Trash2, Plus, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

interface PlaceAutocompleteLike {
  getPlace: () => {
    formatted_address?: string;
    name?: string;
    geometry?: { location: { lat: () => number; lng: () => number } };
  };
  addListener: (event: string, cb: () => void) => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
  /** Callback opcional cuando el cliente se actualizó (recibe el doc actualizado) */
  onUpdated?: (cliente: Cliente) => void;
}

export default function EditarClienteModal({ isOpen, onClose, clienteId, onUpdated }: Props) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [referenciaDireccion, setReferenciaDireccion] = useState('');
  const [sector, setSector] = useState('');
  const [rnc, setRnc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [cedula, setCedula] = useState('');
  const [tipo, setTipo] = useState<'particular' | 'b2b'>('particular');
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAgregarDir, setShowAgregarDir] = useState(false);
  const [editandoDir, setEditandoDir] = useState<DireccionCliente | null>(null);

  const dirInputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<PlaceAutocompleteLike | null>(null);

  // Cargar Google Places para autocomplete en el input de dirección principal
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    const init = () => {
      if (cancelado) return;
      const w = window as unknown as {
        google?: { maps?: { places?: { Autocomplete: new (i: HTMLInputElement, o: object) => PlaceAutocompleteLike } } };
      };
      const places = w.google?.maps?.places;
      if (!places || !dirInputRef.current) return;
      try {
        acRef.current = new places.Autocomplete(dirInputRef.current, {
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
      if (cancelado || !ok) return;
      setTimeout(init, 200);
    });
    return () => { cancelado = true; acRef.current = null; };
  }, [isOpen]);

  /** onChange del input de dirección — además detecta URL de Maps / coords pegadas. */
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

  // Cargar cliente en tiempo real mientras el modal esté abierto
  useEffect(() => {
    if (!isOpen || !clienteId) return;
    const ref = doc(db, 'clientes', clienteId);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return;
      const raw = snap.data();
      // Migración defensiva: clientes existentes sin `tipo` se tratan como
      // 'particular'. Solo se respeta 'b2b' explícito.
      const tipoNorm: 'particular' | 'b2b' = raw.tipo === 'b2b' ? 'b2b' : 'particular';
      const c: Cliente = {
        id: snap.id,
        nombre: (raw.nombre as string) || '',
        telefono: (raw.telefono as string) || '',
        telefonoNormalizado: (raw.telefonoNormalizado as string) || undefined,
        email: (raw.email as string) || '',
        direccion: (raw.direccion as string) || '',
        referenciaDireccion: (raw.referenciaDireccion as string) || '',
        sector: (raw.sector as string) || undefined,
        ciudad: (raw.ciudad as string) || undefined,
        zona: (raw.zona as string) || undefined,
        rnc: (raw.rnc as string) || undefined,
        razonSocial: (raw.razonSocial as string) || undefined,
        cedula: (raw.cedula as string) || undefined,
        tipo: tipoNorm,
        lat: typeof raw.lat === 'number' ? raw.lat : undefined,
        lng: typeof raw.lng === 'number' ? raw.lng : undefined,
        direcciones: Array.isArray(raw.direcciones) ? (raw.direcciones as DireccionCliente[]) : [],
        createdAt: raw.createdAt?.toDate?.() || new Date(),
        updatedAt: raw.updatedAt?.toDate?.() || undefined,
      };
      // Detectar primera hidratación (antes de setear el cliente, no después)
      // para sincronizar `tipo` solo al abrir el modal y no pisar ediciones
      // locales del usuario en snapshots subsiguientes.
      setCliente(prev => {
        if (prev === null) {
          setTipo(tipoNorm);
        }
        return c;
      });
      // Sincronizar form solo al abrir (primera vez)
      setNombre(n => n || c.nombre);
      setEmail(e => e || c.email || '');
      setDireccion(d => d || c.direccion);
      setReferenciaDireccion(r => r || c.referenciaDireccion || '');
      setSector(s => s || c.sector || '');
      setRnc(r => r || c.rnc || '');
      setRazonSocial(rs => rs || c.razonSocial || '');
      setCedula(x => x || c.cedula || '');
      setLat(l => (l !== undefined ? l : c.lat));
      setLng(l => (l !== undefined ? l : c.lng));
    });
    return () => unsub();
  }, [isOpen, clienteId]);

  // Reset al cerrar
  useEffect(() => {
    if (!isOpen) {
      setCliente(null);
      setNombre('');
      setEmail('');
      setDireccion('');
      setReferenciaDireccion('');
      setSector('');
      setRnc('');
      setRazonSocial('');
      setCedula('');
      setTipo('particular');
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

  // RNC válido en RD: 9, 10 u 11 dígitos (acepta separadores que se descartan
  // al normalizar). Vacío = válido (campo opcional).
  const rncDigitos = rnc.replace(/\D/g, '');
  const rncValido = rncDigitos.length === 0 || (rncDigitos.length >= 9 && rncDigitos.length <= 11);

  const guardarDatosBasicos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!rncValido) {
      toast.error('El RNC debe tener entre 9 y 11 dígitos');
      return;
    }
    // Si el RNC viene vacío, también limpiamos razón social para no dejar
    // datos huérfanos (la razón social solo tiene sentido junto a un RNC).
    const rncFinal = rncDigitos || undefined;
    const razonSocialFinal = rncFinal ? (razonSocial.trim() || undefined) : undefined;

    setSaving(true);
    try {
      await actualizarCliente(clienteId, {
        nombre: nombre.trim(),
        email: email.trim() || undefined,
        direccion: direccion.trim(),
        referenciaDireccion: referenciaDireccion.trim() || undefined,
        sector: sector.trim() || undefined,
        rnc: rncFinal,
        razonSocial: razonSocialFinal,
        cedula: cedula.trim() || undefined,
        tipo,
        lat,
        lng,
      });
      toast.success('Cliente actualizado');
      if (cliente) onUpdated?.({
        ...cliente,
        nombre: nombre.trim(),
        email: email.trim(),
        direccion: direccion.trim(),
        rnc: rncFinal,
        razonSocial: razonSocialFinal,
        cedula: cedula.trim() || undefined,
        tipo,
        lat,
        lng,
      });
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleEditarEtiqueta = async (d: DireccionCliente) => {
    const nuevaEtiqueta = prompt('Nueva etiqueta:', d.etiqueta);
    if (nuevaEtiqueta === null) return;
    const etiquetaTrim = nuevaEtiqueta.trim();
    if (!etiquetaTrim) {
      toast.error('La etiqueta no puede estar vacía');
      return;
    }
    try {
      await actualizarDireccionCliente(clienteId, d.id, { etiqueta: etiquetaTrim });
      toast.success('Etiqueta actualizada');
    } catch {
      toast.error('Error al actualizar');
    }
    setEditandoDir(null);
  };

  const handleEliminarDir = async (d: DireccionCliente) => {
    if (!confirm(`¿Eliminar dirección "${d.etiqueta}"?`)) return;
    try {
      await eliminarDireccionCliente(clienteId, d.id);
      toast.success('Dirección eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (!cliente) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Editar cliente" size="md">
        <p className="text-sm text-gray-500">Cargando datos...</p>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Editar cliente · ${cliente.nombre}`}
        size="md"
      >
        <div className="space-y-5">
          {/* Datos básicos */}
          <form onSubmit={guardarDatosBasicos} className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Datos del cliente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Teléfono <span className="text-gray-400">(no editable)</span>
                </label>
                <input
                  type="tel"
                  value={cliente.telefono}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  RNC <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={rnc}
                  onChange={e => setRnc(e.target.value)}
                  placeholder="000-00000-0"
                  inputMode="numeric"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                    rncValido
                      ? 'border-gray-200 focus:ring-primary-medium'
                      : 'border-red-300 focus:ring-red-400'
                  }`}
                />
                {!rncValido && (
                  <p className="text-[11px] text-red-600 mt-1">
                    El RNC debe tener entre 9 y 11 dígitos.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Cédula <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={cedula}
                  onChange={e => setCedula(e.target.value)}
                  placeholder="000-0000000-0"
                  inputMode="numeric"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de cliente</label>
                <select
                  value={tipo}
                  onChange={e => setTipo(e.target.value as 'particular' | 'b2b')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
                >
                  <option value="particular">Particular</option>
                  <option value="b2b">B2B (empresa o taller aliado)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Particular: cliente final que llega al taller. B2B: empresa, otro taller o distribuidor.
                </p>
              </div>
              {rncDigitos.length > 0 && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Razón social <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={razonSocial}
                    onChange={e => setRazonSocial(e.target.value)}
                    placeholder="Nombre legal de la empresa"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                  />
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Dirección principal
                  <span className="ml-2 text-[10px] text-gray-400 font-normal">
                    (Busca en Google, pega URL de Maps o location de WhatsApp)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    ref={dirInputRef}
                    type="text"
                    value={direccion}
                    onChange={e => handleDireccionChange(e.target.value)}
                    placeholder="Escribe un lugar, dirección o pega URL de Google Maps"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={handleUbicacionActual}
                    disabled={capturandoGps}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium disabled:opacity-60"
                  >
                    <MapPin size={12} />
                    {capturandoGps ? '...' : 'Mi ubicación'}
                  </button>
                </div>
                {lat !== undefined && lng !== undefined && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    ✓ Coordenadas exactas guardadas ·{' '}
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
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Referencia</label>
                <input
                  type="text"
                  value={referenciaDireccion}
                  onChange={e => setReferenciaDireccion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="submit"
                disabled={saving || !rncValido}
                className="px-5 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>

          {/* Direcciones alternativas */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Direcciones alternativas
              </h3>
              <button
                type="button"
                onClick={() => setShowAgregarDir(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-xs font-medium"
              >
                <Plus size={12} /> Agregar
              </button>
            </div>

            {(!cliente.direcciones || cliente.direcciones.length === 0) ? (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">
                Este cliente aún no tiene direcciones alternativas. Agrega una si las órdenes son para un familiar u otra ubicación.
              </p>
            ) : (
              <div className="space-y-2">
                {cliente.direcciones.map(d => (
                  <div key={d.id} className="flex items-start gap-2 bg-gray-50 rounded-lg p-3 text-sm">
                    <Home size={14} className="text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{d.etiqueta}</div>
                      <div className="text-xs text-gray-600 truncate">{d.direccion}</div>
                      {d.referencia && (
                        <div className="text-[11px] text-gray-500 italic">{d.referencia}</div>
                      )}
                      {typeof d.lat === 'number' && typeof d.lng === 'number' && (
                        <div className="text-[11px] text-green-700">
                          ✓ {d.lat.toFixed(4)}, {d.lng.toFixed(4)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditandoDir(d);
                          handleEditarEtiqueta(d);
                        }}
                        title="Editar etiqueta"
                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminarDir(d)}
                        title="Eliminar"
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <AgregarDireccionModal
        isOpen={showAgregarDir}
        onClose={() => setShowAgregarDir(false)}
        clienteId={clienteId}
        clienteNombre={cliente.nombre}
      />

      {/* Ref usado solo para evitar warning — limpiado al cerrar */}
      {editandoDir && <span className="hidden">{editandoDir.id}</span>}
    </>
  );
}
