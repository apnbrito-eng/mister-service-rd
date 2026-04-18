import { useState, useEffect, useRef } from 'react';
import { Settings, Building, Shield, Wrench, Satellite, Plus, X, Eye, EyeOff, MapPin, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfigGPS, ProveedorGPS, Personal, OrdenServicio } from '../types';
import { obtenerConfigGPS, guardarConfigGPS } from '../services/gps.service';
import { geocodificarDireccion } from '../services/geocoding.service';
import { collection, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { parseOrden } from '../utils';
import { useApp } from '../context/AppContext';

export default function Configuracion() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';

  // Geocoding batch state
  const [geocodingRunning, setGeocodingRunning] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ done: 0, total: 0, exitosas: 0, falladas: 0 });
  const [geocodingResumen, setGeocodingResumen] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const cancelarRef = useRef(false);

  const handleGeocodingBatch = async () => {
    if (!esAdmin) return;
    setGeocodingRunning(true);
    setGeocodingResumen('');
    cancelarRef.current = false;
    abortRef.current = new AbortController();

    try {
      const snap = await getDocs(collection(db, 'ordenes_servicio'));
      const todas = snap.docs.map(d => parseOrden(d.id, d.data() as Record<string, unknown>) as OrdenServicio);

      const pendientes = todas.filter(o => {
        const sinGps = o.clienteLat === undefined || o.clienteLat === null || o.clienteLat === 0;
        const conDireccion = !!(o.clienteDireccion && o.clienteDireccion.trim());
        const direccionEsUrl = (o.clienteDireccion || '').startsWith('http');
        return sinGps && conDireccion && !direccionEsUrl && o.fase !== 'cancelado';
      });

      setGeocodingProgress({ done: 0, total: pendientes.length, exitosas: 0, falladas: 0 });

      if (pendientes.length === 0) {
        toast.success('No hay órdenes pendientes de geocodificación');
        setGeocodingRunning(false);
        return;
      }

      let exitosas = 0;
      let falladas = 0;

      for (let i = 0; i < pendientes.length; i++) {
        if (cancelarRef.current) break;
        const orden = pendientes[i];
        try {
          const coords = await geocodificarDireccion(orden.clienteDireccion || '', abortRef.current?.signal);
          if (coords) {
            await updateDoc(doc(db, 'ordenes_servicio', orden.id), {
              clienteLat: coords.lat,
              clienteLng: coords.lng,
              updatedAt: Timestamp.now(),
            });
            exitosas++;
          } else {
            falladas++;
          }
        } catch (err) {
          console.error('Error geocodificando orden', orden.id, err);
          falladas++;
        }
        setGeocodingProgress({ done: i + 1, total: pendientes.length, exitosas, falladas });
        // Respetar rate limit de Nominatim (1 req/s)
        if (i < pendientes.length - 1 && !cancelarRef.current) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      const totalProcesadas = exitosas + falladas;
      const mensaje = cancelarRef.current
        ? `Cancelado. Procesadas ${totalProcesadas}/${pendientes.length}: ${exitosas} exitosas, ${falladas} sin resultado.`
        : `${totalProcesadas} órdenes procesadas: ${exitosas} exitosas, ${falladas} sin resultado.`;
      setGeocodingResumen(mensaje);
      if (!cancelarRef.current) toast.success('Geocodificación finalizada');
    } catch (err) {
      console.error(err);
      toast.error('Error en el proceso de geocodificación');
    } finally {
      setGeocodingRunning(false);
      abortRef.current = null;
    }
  };

  const handleCancelarGeocoding = () => {
    cancelarRef.current = true;
    abortRef.current?.abort();
  };

  const [empresa, setEmpresa] = useState({
    nombre: 'Mister Service RD',
    rnc: '000-000000-0',
    direccion: 'Santo Domingo, República Dominicana',
    telefono: '809-555-0000',
    email: 'info@misterservicerd.com',
  });

  const [gpsConfig, setGpsConfig] = useState<ConfigGPS>({
    proveedor: 'Dispositivo del técnico',
    apiUrl: '',
    apiKey: '',
    activo: false,
    vehiculos: [],
  });
  const [mostrarApiKey, setMostrarApiKey] = useState(false);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [nuevoVehiculo, setNuevoVehiculo] = useState({ id: '', nombre: '', tecnicoId: '' });

  useEffect(() => {
    obtenerConfigGPS().then(c => { if (c) setGpsConfig(c); });
    getDocs(collection(db, 'personal')).then(snap => {
      setPersonal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal)));
    });
  }, []);

  const [tiposEquipo, setTiposEquipo] = useState([
    'Lavadora', 'Secadora', 'Nevera', 'Estufa', 'Aire Acondicionado', 'Microondas', 'Lavavajillas',
  ]);
  const [nuevoTipo, setNuevoTipo] = useState('');

  const handleSaveEmpresa = () => {
    toast.success('Datos de empresa guardados');
  };

  const handleAddTipo = () => {
    if (!nuevoTipo.trim()) return;
    if (tiposEquipo.includes(nuevoTipo.trim())) { toast.error('Ya existe'); return; }
    setTiposEquipo([...tiposEquipo, nuevoTipo.trim()]);
    setNuevoTipo('');
    toast.success('Tipo agregado');
  };

  const handleRemoveTipo = (tipo: string) => {
    setTiposEquipo(tiposEquipo.filter(t => t !== tipo));
    toast.success('Tipo eliminado');
  };

  const handleSaveGPS = async () => {
    try {
      await guardarConfigGPS(gpsConfig);
      toast.success('Configuración GPS guardada');
    } catch {
      toast.error('Error al guardar');
    }
  };

  const handleAddVehiculo = () => {
    if (!nuevoVehiculo.id || !nuevoVehiculo.nombre) {
      toast.error('Completa ID y nombre del vehículo');
      return;
    }
    const tec = personal.find(p => p.id === nuevoVehiculo.tecnicoId);
    setGpsConfig({
      ...gpsConfig,
      vehiculos: [
        ...gpsConfig.vehiculos,
        {
          id: nuevoVehiculo.id,
          nombre: nuevoVehiculo.nombre,
          tecnicoId: nuevoVehiculo.tecnicoId,
          tecnicoNombre: tec?.nombre || '',
        },
      ],
    });
    setNuevoVehiculo({ id: '', nombre: '', tecnicoId: '' });
  };

  const handleRemoveVehiculo = (id: string) => {
    setGpsConfig({ ...gpsConfig, vehiculos: gpsConfig.vehiculos.filter(v => v.id !== id) });
  };

  const handleProbarConexion = async () => {
    if (!gpsConfig.apiUrl || !gpsConfig.apiKey) {
      toast.error('Configura URL y API Key primero');
      return;
    }
    toast.loading('Probando conexión...', { id: 'test' });
    try {
      const res = await fetch(gpsConfig.apiUrl, {
        headers: { 'Authorization': `Bearer ${gpsConfig.apiKey}` },
      });
      toast.dismiss('test');
      if (res.ok) toast.success('✅ Conexión exitosa');
      else toast.error(`Error: ${res.status}`);
    } catch {
      toast.dismiss('test');
      toast.error('No se pudo conectar (CORS o red)');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#0f3460]">Configuración</h1>

      {/* Datos empresa */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Datos de la Empresa</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input type="text" value={empresa.nombre} onChange={e => setEmpresa(f => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RNC</label>
              <input type="text" value={empresa.rnc} onChange={e => setEmpresa(f => ({ ...f, rnc: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="tel" value={empresa.telefono} onChange={e => setEmpresa(f => ({ ...f, telefono: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input type="text" value={empresa.direccion} onChange={e => setEmpresa(f => ({ ...f, direccion: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={empresa.email} onChange={e => setEmpresa(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          </div>
          <button onClick={handleSaveEmpresa}
            className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors">
            Guardar Cambios
          </button>
        </div>
      </div>

      {/* Tipos equipo */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Wrench size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Tipos de Equipo</h2>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {tiposEquipo.map(t => (
            <span key={t} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm">
              {t}
              <button onClick={() => handleRemoveTipo(t)} className="ml-1 text-gray-400 hover:text-red-500">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text" value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)}
            placeholder="Nuevo tipo de equipo..."
            onKeyDown={e => e.key === 'Enter' && handleAddTipo()}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
          <button onClick={handleAddTipo}
            className="px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors">
            Agregar
          </button>
        </div>
      </div>

      {/* GPS Vehicular */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Satellite size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">🛰️ GPS Vehicular</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor GPS</label>
            <select
              value={gpsConfig.proveedor}
              onChange={e => setGpsConfig({ ...gpsConfig, proveedor: e.target.value as ProveedorGPS })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
              <option value="Dispositivo del técnico">Dispositivo del técnico (fallback)</option>
              <option value="Wialon">Wialon</option>
              <option value="Samsara">Samsara</option>
              <option value="Traccar">Traccar</option>
              <option value="Fleet Complete">Fleet Complete</option>
              <option value="API Personalizada">API Personalizada</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Mientras no haya API externa, el sistema usa la ubicación del dispositivo del técnico.
            </p>
          </div>

          {gpsConfig.proveedor !== 'Dispositivo del técnico' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de la API *</label>
                <input type="text" value={gpsConfig.apiUrl}
                  onChange={e => setGpsConfig({ ...gpsConfig, apiUrl: e.target.value })}
                  placeholder="https://api.tuproveedor.com/v1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key / Token *</label>
                <div className="relative">
                  <input type={mostrarApiKey ? 'text' : 'password'} value={gpsConfig.apiKey}
                    onChange={e => setGpsConfig({ ...gpsConfig, apiKey: e.target.value })}
                    className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
                  <button type="button" onClick={() => setMostrarApiKey(!mostrarApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                    {mostrarApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Vehículos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Vehículos registrados</label>
            {gpsConfig.vehiculos.length > 0 && (
              <div className="space-y-2 mb-3">
                {gpsConfig.vehiculos.map(v => (
                  <div key={v.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                    <span className="text-sm">🚐</span>
                    <div className="flex-1 text-sm">
                      <p className="font-medium">{v.nombre} — ID: {v.id}</p>
                      <p className="text-xs text-gray-500">Técnico: {v.tecnicoNombre || 'Sin asignar'}</p>
                    </div>
                    <button onClick={() => handleRemoveVehiculo(v.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input type="text" value={nuevoVehiculo.id}
                onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, id: e.target.value })}
                placeholder="ID del vehículo"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              <input type="text" value={nuevoVehiculo.nombre}
                onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, nombre: e.target.value })}
                placeholder="Nombre (Unidad 1)"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]" />
              <select value={nuevoVehiculo.tecnicoId}
                onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, tecnicoId: e.target.value })}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]">
                <option value="">Técnico</option>
                {personal.filter(p => p.rol === 'tecnico' && p.activo).map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <button onClick={handleAddVehiculo}
                className="flex items-center justify-center gap-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white px-3 py-2 rounded-lg text-sm">
                <Plus size={14} /> Agregar
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={gpsConfig.activo}
                onChange={e => setGpsConfig({ ...gpsConfig, activo: e.target.checked })}
                className="rounded border-gray-300 text-[#1a5fa8] focus:ring-[#1a5fa8]" />
              Activar integración GPS
            </label>
          </div>

          <div className="flex gap-2">
            {gpsConfig.proveedor !== 'Dispositivo del técnico' && (
              <button onClick={handleProbarConexion}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">
                Probar conexión
              </button>
            )}
            <button onClick={handleSaveGPS}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium">
              Guardar
            </button>
          </div>
        </div>
      </div>

      {/* Mantenimiento de datos (solo admin) */}
      {esAdmin && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={20} className="text-[#1a5fa8]" />
            <h2 className="text-lg font-semibold text-gray-900">Mantenimiento de datos</h2>
          </div>
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Geocodificar órdenes sin GPS</h3>
              <p className="text-xs text-gray-600 mb-3">
                Procesa todas las órdenes con dirección pero sin coordenadas GPS y las actualiza con la ubicación
                aproximada usando OpenStreetMap. Tarda ~1 segundo por orden.
              </p>
              {geocodingRunning ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-[#1a5fa8]">
                    <Loader2 size={16} className="animate-spin" />
                    <span>
                      Procesando {geocodingProgress.done} de {geocodingProgress.total} órdenes...
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-[#1a5fa8] transition-all"
                      style={{ width: `${geocodingProgress.total > 0 ? (geocodingProgress.done / geocodingProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Exitosas: <span className="font-semibold text-green-600">{geocodingProgress.exitosas}</span></span>
                    <span>Sin resultado: <span className="font-semibold text-amber-600">{geocodingProgress.falladas}</span></span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelarGeocoding}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGeocodingBatch}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <MapPin size={14} /> Geocodificar órdenes sin GPS
                </button>
              )}
              {geocodingResumen && (
                <p className="text-xs text-gray-600 mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                  {geocodingResumen}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info sistema */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Información del Sistema</h2>
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          <p>Versión: 1.0.0</p>
          <p>Base de datos: Firebase Firestore</p>
          <p>Autenticación: Firebase Auth</p>
          <p>Mapas: OpenStreetMap + Leaflet</p>
          <p>Geocodificación: Nominatim (gratuito)</p>
        </div>
      </div>
    </div>
  );
}
