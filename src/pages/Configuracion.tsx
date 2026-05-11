import { useState, useEffect, useRef } from 'react';
import { Building, Shield, Wrench, Satellite, Plus, X, Eye, EyeOff, MapPin, Loader2, FileText, ChevronUp, ChevronDown, ListPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfigGPS, ProveedorGPS, Personal, OrdenServicio } from '../types';
import { obtenerConfigGPS, guardarConfigGPS } from '../services/gps.service';
import { geocodificarDireccion } from '../services/geocoding.service';
import { suscribirConfigFiscal, actualizarConfigFiscal, ConfigFiscal } from '../services/configFiscal.service';
import { suscribirConfigEmpresa, actualizarConfigEmpresa, CONFIG_EMPRESA_DEFAULT, ConfigEmpresa } from '../services/configEmpresa.service';
import { suscribirTiposEquipo, actualizarTiposEquipo } from '../services/configTiposEquipo.service';
import {
  sincronizarTiposEquipoPublicos,
  sincronizarModelosPorTipoEquipo,
} from '../services/configWeb.service';
import { useConfigWeb } from '../hooks/useConfigWeb';
import { collection, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { parseOrden, TIPOS_EQUIPO } from '../utils';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';

export default function Configuracion() {
  const { userProfile } = useApp();
  const esAdmin = userProfile?.rol === 'administrador' || userProfile?.rol === 'coordinadora';
  const puedeModificar = puede(userProfile, 'configuracionModificar');

  // Geocoding batch state
  const [geocodingRunning, setGeocodingRunning] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ done: 0, total: 0, exitosas: 0, falladas: 0 });
  const [geocodingResumen, setGeocodingResumen] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const cancelarRef = useRef(false);

  // Config fiscal (ITBIS + datos empresa fiscales)
  const [configFiscal, setConfigFiscalState] = useState<ConfigFiscal>({
    itbisPorcentaje: 18,
    rncEmpresa: '133-118191',
    razonSocial: 'Fixman SRL',
  });
  const [fiscalSaving, setFiscalSaving] = useState(false);

  useEffect(() => {
    const unsub = suscribirConfigFiscal(cfg => setConfigFiscalState(cfg));
    return () => unsub();
  }, []);

  const handleSaveFiscal = async () => {
    if (!puedeModificar) return;
    if (configFiscal.itbisPorcentaje < 0 || configFiscal.itbisPorcentaje > 100) {
      toast.error('El porcentaje de ITBIS debe estar entre 0 y 100');
      return;
    }
    setFiscalSaving(true);
    try {
      await actualizarConfigFiscal(
        {
          itbisPorcentaje: Number(configFiscal.itbisPorcentaje),
          rncEmpresa: configFiscal.rncEmpresa?.trim() || undefined,
          razonSocial: configFiscal.razonSocial?.trim() || undefined,
          direccionFiscal: configFiscal.direccionFiscal?.trim() || undefined,
        },
        userProfile?.nombre,
      );
      toast.success('Configuración fiscal guardada');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setFiscalSaving(false);
    }
  };

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

  const [empresa, setEmpresa] = useState<ConfigEmpresa>({ ...CONFIG_EMPRESA_DEFAULT });
  const [empresaSaving, setEmpresaSaving] = useState(false);
  const [tiposEquipo, setTiposEquipo] = useState<string[]>([...TIPOS_EQUIPO]);
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [savingTipos, setSavingTipos] = useState(false);

  // ─── Catálogo de modelos por tipo ─────────────────────
  // Solo el rol `administrador` edita. Coordinadora/secretaria lo ven en
  // read-only. Buffer local + botón "Guardar" para evitar persistir cada
  // tecla y permitir reordenar antes de commitear.
  const esAdminPuro = userProfile?.rol === 'administrador';
  const { config: configWebSnapshot } = useConfigWeb();
  const [modelosPorTipo, setModelosPorTipo] = useState<{ [tipo: string]: string[] }>({});
  const [modelosDirty, setModelosDirty] = useState(false);
  const [modelosSaving, setModelosSaving] = useState(false);
  const [nuevoModeloPorTipo, setNuevoModeloPorTipo] = useState<{ [tipo: string]: string }>({});

  // Sincroniza el buffer local con la última config publicada cuando NO hay
  // cambios pendientes. Si el admin tiene cambios en buffer, no los pisa
  // (evita perder edición si llegan eventos del listener mientras edita).
  useEffect(() => {
    if (modelosDirty) return;
    const fromConfig = configWebSnapshot?.modelosPorTipoEquipo;
    if (fromConfig && Object.keys(fromConfig).length > 0) {
      setModelosPorTipo(fromConfig);
    } else {
      // Defaults sensatos cuando el admin nunca tocó esta sección.
      setModelosPorTipo({
        'Lavadora': ['Torre', 'Individual'],
        'Nevera': ['Side-by-side', 'French door', 'Top freezer', 'Mini bar'],
        'Estufa': ['Eléctrica', 'Gas', 'Mixta'],
        'Aire Acondicionado': ['Split', 'Ventana', 'Portátil', 'Cassette'],
        'Secadora': ['Torre', 'Individual'],
      });
    }
  }, [configWebSnapshot, modelosDirty]);

  useEffect(() => {
    const unsubEmpresa = suscribirConfigEmpresa(cfg => setEmpresa(cfg));
    const unsubTipos = suscribirTiposEquipo(lista => setTiposEquipo(lista));
    return () => {
      unsubEmpresa();
      unsubTipos();
    };
  }, []);

  const handleAgregarModelo = (tipo: string) => {
    if (!esAdminPuro) return;
    const valor = (nuevoModeloPorTipo[tipo] || '').trim();
    if (!valor) return;
    const actuales = modelosPorTipo[tipo] || [];
    if (actuales.some(m => m.toLowerCase() === valor.toLowerCase())) {
      toast.error('Ese modelo ya existe en este tipo');
      return;
    }
    setModelosPorTipo(prev => ({
      ...prev,
      [tipo]: [...(prev[tipo] || []), valor],
    }));
    setNuevoModeloPorTipo(prev => ({ ...prev, [tipo]: '' }));
    setModelosDirty(true);
  };

  const handleEliminarModelo = (tipo: string, modelo: string) => {
    if (!esAdminPuro) return;
    setModelosPorTipo(prev => ({
      ...prev,
      [tipo]: (prev[tipo] || []).filter(m => m !== modelo),
    }));
    setModelosDirty(true);
  };

  const handleMoverModelo = (tipo: string, indice: number, direccion: -1 | 1) => {
    if (!esAdminPuro) return;
    setModelosPorTipo(prev => {
      const lista = [...(prev[tipo] || [])];
      const destino = indice + direccion;
      if (destino < 0 || destino >= lista.length) return prev;
      [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
      return { ...prev, [tipo]: lista };
    });
    setModelosDirty(true);
  };

  const handleGuardarModelos = async () => {
    if (!esAdminPuro) return;
    if (!modelosDirty) return;
    setModelosSaving(true);
    try {
      // Solo persistimos las keys que están en `tiposEquipo` actual + las
      // que ya existían en buffer. Si un tipo fue eliminado de la lista
      // de tipos, ya no aparece como sección, pero preservamos la entrada
      // en Firestore por si lo agregan de nuevo.
      await sincronizarModelosPorTipoEquipo(modelosPorTipo);
      setModelosDirty(false);
      toast.success('Catálogo de modelos guardado');
    } catch (err) {
      console.error('[Configuracion] Error guardando modelos:', err);
      toast.error('No se pudo guardar el catálogo. Intenta de nuevo.');
    } finally {
      setModelosSaving(false);
    }
  };

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

  const handleSaveEmpresa = async () => {
    if (!puedeModificar) return;
    if (empresaSaving) return;
    setEmpresaSaving(true);
    try {
      const precioChequeoNum = Number(empresa.precioChequeoDefault);
      await actualizarConfigEmpresa(
        {
          nombre: empresa.nombre?.trim() || '',
          rnc: empresa.rnc?.trim() || '',
          direccion: empresa.direccion?.trim() || '',
          telefono: empresa.telefono?.trim() || '',
          email: empresa.email?.trim() || '',
          precioChequeoDefault:
            !isNaN(precioChequeoNum) && precioChequeoNum > 0
              ? precioChequeoNum
              : undefined,
        },
        userProfile?.nombre,
      );
      toast.success('Datos de la empresa guardados y sincronizados al sitio público');
    } catch (err) {
      console.error('[Configuracion] Error guardando empresa:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setEmpresaSaving(false);
    }
  };

  const handleAddTipo = async () => {
    if (!esAdminPuro) return;
    const nombreLimpio = nuevoTipo.trim();
    if (nombreLimpio.length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres');
      return;
    }
    if (nombreLimpio.length > 50) {
      toast.error('El nombre no puede exceder 50 caracteres');
      return;
    }
    const yaExiste = tiposEquipo.some(
      t => t.toLowerCase() === nombreLimpio.toLowerCase(),
    );
    if (yaExiste) {
      toast.error(`"${nombreLimpio}" ya existe`);
      return;
    }
    const nuevaLista = [...tiposEquipo, nombreLimpio];
    setSavingTipos(true);
    try {
      await actualizarTiposEquipo(nuevaLista, userProfile?.nombre);
      // Sincronizar al doc público (`config_web/sitio`) para que el
      // formulario `/agendar` la vea sin depender de las reglas auth
      // del doc admin `config/tiposEquipo`.
      try {
        await sincronizarTiposEquipoPublicos(nuevaLista);
      } catch (errSync) {
        console.warn('[Configuracion] No se pudo sincronizar tiposEquipoPublicos:', errSync);
      }
      // Auto-init: crea sección vacía en el catálogo de modelos para que
      // aparezca automáticamente como sección lista para editar abajo.
      // Lee los modelos persistidos en Firestore (no el buffer local) para
      // no pisar ediciones en curso del catálogo de modelos.
      const modelosPersistidos = configWebSnapshot?.modelosPorTipoEquipo || {};
      if (!(nombreLimpio in modelosPersistidos)) {
        const nuevosModelos = { ...modelosPersistidos, [nombreLimpio]: [] };
        try {
          await sincronizarModelosPorTipoEquipo(nuevosModelos);
        } catch (errSync) {
          console.warn('[Configuracion] No se pudo auto-inicializar modelos:', errSync);
        }
        // Reflejar el cambio en el buffer local sólo si no hay edición sucia,
        // para evitar pisar cambios en curso del editor de modelos.
        if (!modelosDirty) {
          setModelosPorTipo(prev => ({ ...prev, [nombreLimpio]: [] }));
        }
      }
      setNuevoTipo('');
      toast.success(`"${nombreLimpio}" agregado`);
    } catch (err) {
      console.error('[Configuracion] Error agregando tipo:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSavingTipos(false);
    }
  };

  const handleRemoveTipo = async (tipo: string) => {
    if (!esAdminPuro) return;
    // Source-of-truth para la cascada: modelos persistidos en Firestore.
    // No usamos el buffer local porque el admin podría tener cambios sin
    // guardar que no queremos descartar/duplicar al borrar.
    const modelosPersistidos = configWebSnapshot?.modelosPorTipoEquipo || {};
    const modelosAsociados = modelosPersistidos[tipo] || [];
    let mensaje: string;
    if (modelosAsociados.length === 0) {
      mensaje = `¿Eliminar "${tipo}"? Las órdenes históricas con este tipo seguirán mostrándolo.`;
    } else {
      const lista = modelosAsociados.map(m => `• ${m}`).join('\n');
      mensaje = `Eliminar "${tipo}" también borrará ${modelosAsociados.length} modelo(s) asociado(s):\n\n${lista}\n\nLas órdenes históricas con este tipo seguirán mostrándolo. ¿Confirmas?`;
    }
    if (!window.confirm(mensaje)) return;

    const nuevaLista = tiposEquipo.filter(t => t !== tipo);
    setSavingTipos(true);
    try {
      await actualizarTiposEquipo(nuevaLista, userProfile?.nombre);
      try {
        await sincronizarTiposEquipoPublicos(nuevaLista);
      } catch (errSync) {
        console.warn('[Configuracion] No se pudo sincronizar tiposEquipoPublicos:', errSync);
      }
      // Cascada: si el tipo tenía modelos asociados, los borramos también.
      if (tipo in modelosPersistidos) {
        const nuevosModelos = { ...modelosPersistidos };
        delete nuevosModelos[tipo];
        try {
          await sincronizarModelosPorTipoEquipo(nuevosModelos);
        } catch (errSync) {
          console.warn('[Configuracion] No se pudo borrar modelos en cascada:', errSync);
        }
        // Reflejar cambio en buffer local si no hay edición sucia.
        if (!modelosDirty) {
          setModelosPorTipo(prev => {
            const copia = { ...prev };
            delete copia[tipo];
            return copia;
          });
        }
      }
      toast.success(`"${tipo}" eliminado`);
    } catch (err) {
      console.error('[Configuracion] Error quitando tipo:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSavingTipos(false);
    }
  };

  const handleMoverTipo = async (indice: number, direccion: -1 | 1) => {
    if (!esAdminPuro) return;
    const destino = indice + direccion;
    if (destino < 0 || destino >= tiposEquipo.length) return;
    const nuevaLista = [...tiposEquipo];
    [nuevaLista[indice], nuevaLista[destino]] = [nuevaLista[destino], nuevaLista[indice]];
    setSavingTipos(true);
    try {
      await actualizarTiposEquipo(nuevaLista, userProfile?.nombre);
      try {
        await sincronizarTiposEquipoPublicos(nuevaLista);
      } catch (errSync) {
        console.warn('[Configuracion] No se pudo sincronizar tiposEquipoPublicos:', errSync);
      }
    } catch (err) {
      console.error('[Configuracion] Error reordenando tipos:', err);
      toast.error('No se pudo reordenar. Intenta de nuevo.');
    } finally {
      setSavingTipos(false);
    }
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
    // SPRINT-132: (p.uid || p.id) — el campo persistido nuevoVehiculo.tecnicoId puede ser auth.uid post-c4be345.
    const tec = personal.find(p => (p.uid || p.id) === nuevoVehiculo.tecnicoId);
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Precio default del chequeo (RD$)
            </label>
            <input
              type="number"
              min={0}
              step={50}
              value={empresa.precioChequeoDefault ?? ''}
              onChange={e => {
                const raw = e.target.value;
                const num = Number(raw);
                setEmpresa(f => ({
                  ...f,
                  precioChequeoDefault:
                    raw === '' || isNaN(num) ? undefined : num,
                }));
              }}
              placeholder="2000"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Monto sugerido al cerrar una orden como "solo chequeo" cuando el cliente no procede con la reparación.
            </p>
          </div>
          {puedeModificar && (
            <button
              onClick={handleSaveEmpresa}
              disabled={empresaSaving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {empresaSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}
          {empresa.updatedAt && (
            <p className="text-[11px] text-gray-400">
              Última actualización: {empresa.updatedAt.toLocaleString('es-DO')}
              {empresa.updatedPor ? ` · por ${empresa.updatedPor}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Configuración Fiscal (ITBIS, RNC, Razón Social) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Configuración Fiscal</h2>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-900 mb-4">
          Estos datos se usan al generar facturas. El porcentaje de ITBIS se aplica al desglose de cada factura y afecta la ganancia neta sobre la que se calculan las comisiones.
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Porcentaje de ITBIS <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={configFiscal.itbisPorcentaje}
                onChange={e => setConfigFiscalState(f => ({ ...f, itbisPorcentaje: Number(e.target.value) }))}
                disabled={!puedeModificar}
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
              />
              <span className="text-sm text-gray-500">%</span>
              <span className="text-xs text-gray-400 ml-2">Estándar RD: 18%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
              <input
                type="text"
                value={configFiscal.razonSocial || ''}
                onChange={e => setConfigFiscalState(f => ({ ...f, razonSocial: e.target.value }))}
                disabled={!puedeModificar}
                placeholder="Fixman SRL"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RNC de la empresa</label>
              <input
                type="text"
                value={configFiscal.rncEmpresa || ''}
                onChange={e => setConfigFiscalState(f => ({ ...f, rncEmpresa: e.target.value }))}
                disabled={!puedeModificar}
                placeholder="133-118191"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección fiscal</label>
            <input
              type="text"
              value={configFiscal.direccionFiscal || ''}
              onChange={e => setConfigFiscalState(f => ({ ...f, direccionFiscal: e.target.value }))}
              disabled={!puedeModificar}
              placeholder="Dirección que aparecerá en las facturas"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
          </div>

          {/* Preview del desglose */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs">
            <div className="font-semibold text-gray-700 mb-1">Vista previa del desglose para una factura de RD$ 10,000:</div>
            {(() => {
              const total = 10000;
              const pct = Number(configFiscal.itbisPorcentaje) || 0;
              const sub = total / (1 + pct / 100);
              const itbis = total - sub;
              return (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-white rounded p-2">
                    <div className="text-[10px] text-gray-500">Subtotal</div>
                    <div className="font-semibold text-gray-900">RD${sub.toFixed(2)}</div>
                  </div>
                  <div className="bg-white rounded p-2">
                    <div className="text-[10px] text-gray-500">ITBIS ({pct}%)</div>
                    <div className="font-semibold text-orange-600">RD${itbis.toFixed(2)}</div>
                  </div>
                  <div className="bg-white rounded p-2">
                    <div className="text-[10px] text-gray-500">Total</div>
                    <div className="font-semibold text-[#0f3460]">RD${total.toFixed(2)}</div>
                  </div>
                </div>
              );
            })()}
          </div>

          {puedeModificar && (
            <button
              onClick={handleSaveFiscal}
              disabled={fiscalSaving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {fiscalSaving ? 'Guardando...' : 'Guardar Configuración Fiscal'}
            </button>
          )}

          {configFiscal.updatedAt && (
            <p className="text-[11px] text-gray-400">
              Última actualización: {configFiscal.updatedAt.toLocaleString('es-DO')}
              {configFiscal.updatedPor ? ` · por ${configFiscal.updatedPor}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Tipos equipo */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Wrench size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Tipos de Equipo</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Define qué tipos de equipo aparecen en el formulario público{' '}
          <span className="font-mono">/agendar</span> y al crear órdenes. Si agregas
          uno nuevo, también aparecerá como nueva sección en el catálogo de modelos
          abajo.
        </p>
        {!esAdminPuro && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 mb-4">
            Solo el administrador puede editar tipos de equipo. Estás viendo la
            configuración en modo lectura.
          </div>
        )}

        {tiposEquipo.length === 0 ? (
          <p className="text-sm text-gray-400 italic mb-4">
            Sin tipos definidos. Agrega el primero abajo.
          </p>
        ) : (
          <div className="space-y-1.5 mb-4">
            {tiposEquipo.map((tipo, idx) => (
              <div
                key={tipo}
                className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
              >
                <span className="flex-1 text-sm text-gray-800">{tipo}</span>
                {esAdminPuro && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleMoverTipo(idx, -1)}
                      disabled={idx === 0 || savingTipos}
                      className="p-1 text-gray-400 hover:text-[#1a5fa8] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Subir"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoverTipo(idx, 1)}
                      disabled={idx === tiposEquipo.length - 1 || savingTipos}
                      className="p-1 text-gray-400 hover:text-[#1a5fa8] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Bajar"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveTipo(tipo)}
                      disabled={savingTipos}
                      className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Eliminar"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {esAdminPuro && (
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevoTipo}
              onChange={e => setNuevoTipo(e.target.value)}
              placeholder="Nuevo tipo (ej: Calefón, Lavavajillas)..."
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTipo();
                }
              }}
              maxLength={50}
              disabled={savingTipos}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={handleAddTipo}
              disabled={savingTipos}
              className="px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus size={14} /> Agregar tipo
            </button>
          </div>
        )}
      </div>

      {/* Catálogo de modelos por tipo de equipo */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-2">
          <ListPlus size={20} className="text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Catálogo de modelos por tipo</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Define las opciones de modelo que aparecen al cliente en{' '}
          <span className="font-mono">/agendar</span> y al crear órdenes. Si dejas la lista
          vacía, el campo Modelo será texto libre.
        </p>
        {!esAdminPuro && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 mb-4">
            Solo administradores pueden editar el catálogo. Estás viendo la configuración en modo lectura.
          </div>
        )}

        <div className="space-y-4">
          {tiposEquipo.map(tipo => {
            const modelos = modelosPorTipo[tipo] || [];
            return (
              <div key={tipo} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-[#0f3460]">{tipo}</span>
                  <span className="text-[11px] text-gray-400">
                    {modelos.length === 0 ? 'sin modelos · texto libre' : `${modelos.length} modelo(s)`}
                  </span>
                </div>

                {modelos.length > 0 ? (
                  <div className="space-y-1.5 mb-3">
                    {modelos.map((modelo, idx) => (
                      <div
                        key={`${tipo}-${modelo}-${idx}`}
                        className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5"
                      >
                        <span className="flex-1 text-sm text-gray-800">{modelo}</span>
                        {esAdminPuro && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMoverModelo(tipo, idx, -1)}
                              disabled={idx === 0}
                              className="p-1 text-gray-400 hover:text-[#1a5fa8] disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Subir"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoverModelo(tipo, idx, 1)}
                              disabled={idx === modelos.length - 1}
                              className="p-1 text-gray-400 hover:text-[#1a5fa8] disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Bajar"
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarModelo(tipo, modelo)}
                              className="p-1 text-gray-400 hover:text-red-500"
                              title="Eliminar"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic mb-3">
                    Sin modelos definidos — el cliente verá input texto libre.
                  </p>
                )}

                {esAdminPuro && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoModeloPorTipo[tipo] || ''}
                      onChange={e =>
                        setNuevoModeloPorTipo(prev => ({ ...prev, [tipo]: e.target.value }))
                      }
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAgregarModelo(tipo);
                        }
                      }}
                      placeholder="Nuevo modelo..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAgregarModelo(tipo)}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium inline-flex items-center gap-1 transition-colors"
                    >
                      <Plus size={14} /> Agregar
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {tiposEquipo.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              Agrega tipos de equipo arriba para configurar sus modelos.
            </p>
          )}
        </div>

        {esAdminPuro && (
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleGuardarModelos}
              disabled={!modelosDirty || modelosSaving}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {modelosSaving ? 'Guardando...' : modelosDirty ? 'Guardar cambios' : 'Sin cambios'}
            </button>
            {modelosDirty && (
              <span className="text-xs text-amber-700">Hay cambios sin guardar</span>
            )}
          </div>
        )}
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
                {/* @safe-tecnicoid-id: ubicaciones_vehiculos.tecnicoId es descriptor que matchea
                    con personal.id (joins UI), NO gateado por rule auth.uid (firestore.rules:259-262
                    valida solo esStaff()). Cambiar a uid rompería el join con personal.find(p.id===tecnicoId)
                    en TecnicoVista.tsx:236 que el técnico usa para identificar SU vehículo. */}
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
            {puedeModificar && (
              <button onClick={handleSaveGPS}
                className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium">
                Guardar
              </button>
            )}
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
