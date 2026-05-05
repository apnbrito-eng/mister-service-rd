import { useEffect, useMemo, useState } from 'react';
import { Eye, FileText, Plus, Save, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { CampanaMarketing, PlantillaMarketing } from '../types';
import {
  PLANTILLAS_INICIALES,
  guardarPlantillas,
  seedPlantillasIniciales,
  subscribeToCampanas,
  subscribeToPlantillas,
} from '../services/campanasMarketing.service';
import {
  VARIABLES_PLANTILLA,
  variablesEnFallback,
} from '../utils/plantillaRender';

/**
 * Página `/admin/configuracion-marketing`. Solo admin (gateado en App.tsx
 * con RolRoute roles=['administrador']).
 *
 * Permite:
 *  - Listar las plantillas existentes (real-time onSnapshot al doc).
 *  - Editar nombre / mensaje / activa de cada una con preview.
 *  - Crear plantilla nueva (id slug auto desde el nombre).
 *  - Eliminar plantilla (queda fuera del array; campañas históricas
 *    siguen referenciando por id pero no aparecen en selector).
 *  - Botón "Crear plantillas iniciales" cuando el doc no existe.
 */
export default function ConfiguracionMarketing() {
  const { userProfile } = useApp();
  const [plantillas, setPlantillas] = useState<PlantillaMarketing[]>([]);
  const [loading, setLoading] = useState(true);
  const [docExiste, setDocExiste] = useState<boolean>(false);
  const [editando, setEditando] = useState<Record<string, PlantillaMarketing>>({});
  const [guardando, setGuardando] = useState(false);
  const [seedeando, setSeedeando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  // Sprint Mapa Clientes Commit 3 — sección ROI con histórico de campañas.
  const [campanas, setCampanas] = useState<CampanaMarketing[]>([]);

  useEffect(() => {
    const unsub = subscribeToPlantillas((list) => {
      setPlantillas(list);
      setDocExiste(list.length > 0);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToCampanas((list) => {
      setCampanas(list);
    });
    return () => unsub();
  }, []);

  const handleSeed = async () => {
    if (!userProfile) return;
    setSeedeando(true);
    try {
      await seedPlantillasIniciales();
      toast.success('Plantillas iniciales creadas.');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo crear el seed.');
    } finally {
      setSeedeando(false);
    }
  };

  const startEdit = (p: PlantillaMarketing) => {
    setEditando((prev) => ({ ...prev, [p.id]: { ...p } }));
  };

  const cancelEdit = (id: string) => {
    setEditando((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSaveEdit = async (id: string) => {
    const cambios = editando[id];
    if (!cambios) return;
    if (!cambios.nombre.trim() || !cambios.mensaje.trim()) {
      toast.error('Nombre y mensaje son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const next = plantillas.map((p) => (p.id === id ? { ...cambios } : p));
      await guardarPlantillas(next);
      toast.success('Plantilla guardada.');
      cancelEdit(id);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActiva = async (id: string) => {
    setGuardando(true);
    try {
      const next = plantillas.map((p) => p.id === id ? { ...p, activa: !p.activa } : p);
      await guardarPlantillas(next);
      toast.success('Estado actualizado.');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar.');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (id: string) => {
    if (!window.confirm('Eliminar esta plantilla? Las campañas históricas la siguen referenciando por id, pero no aparecerá en el selector.')) {
      return;
    }
    setGuardando(true);
    try {
      const next = plantillas.filter((p) => p.id !== id);
      await guardarPlantillas(next);
      toast.success('Plantilla eliminada.');
      cancelEdit(id);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo eliminar.');
    } finally {
      setGuardando(false);
    }
  };

  const slugify = (nombre: string): string => {
    return nombre
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || `plantilla_${Date.now()}`;
  };

  const handleCrear = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      toast.error('Escribí un nombre.');
      return;
    }
    let id = slugify(nombre);
    // Si ya existe, le sumamos sufijo numérico.
    if (plantillas.some((p) => p.id === id)) {
      let i = 2;
      while (plantillas.some((p) => p.id === `${id}_${i}`)) i++;
      id = `${id}_${i}`;
    }
    const nueva: PlantillaMarketing = {
      id,
      nombre,
      mensaje: 'Hola {nombre}, te escribimos de Mister Service RD.',
      activa: true,
    };
    setGuardando(true);
    try {
      const next = [...plantillas, nueva];
      await guardarPlantillas(next);
      toast.success('Plantilla creada.');
      setNuevoNombre('');
      // Auto-abre el editor de la recién creada.
      setEditando((prev) => ({ ...prev, [id]: { ...nueva } }));
    } catch (err) {
      console.error(err);
      toast.error('No se pudo crear.');
    } finally {
      setGuardando(false);
    }
  };

  // Cliente fake para preview (admin no tiene cliente seleccionado acá).
  const clientePreviewFake = useMemo(() => ({
    id: 'preview',
    nombre: 'Juan Pérez',
    telefono: '8095551234',
    direccion: '',
    zona: 'Distrito Nacional',
    legacyMetricas: {
      totalServicios: 3,
      fechaUltimoServicio: '2025-08-15',
      montoTotalHistorico: 12000,
      equiposAtendidos: 'Lavadora,Nevera',
      marcasHabituales: 'Whirlpool',
      bancosPago: '',
    },
    createdAt: new Date(),
  }), []);

  if (loading) return <LoadingSpinner fullPage text="Cargando plantillas..." />;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] flex items-center gap-2">
            <Sparkles size={20} /> Configuración de Marketing
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Plantillas de WhatsApp usadas en el tab Reactivación de Clientes.
          </p>
        </div>
      </div>

      {/* Seed inicial cuando el doc no existe */}
      {!docExiste && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <FileText size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Sin plantillas configuradas</p>
            <p className="text-xs text-amber-800 mt-0.5 mb-3">
              Podés sembrar las {PLANTILLAS_INICIALES.length} plantillas iniciales del sistema o crear una desde cero.
            </p>
            <button
              type="button"
              onClick={handleSeed}
              disabled={seedeando}
              className="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-60"
            >
              {seedeando ? 'Creando...' : `Crear plantillas iniciales (${PLANTILLAS_INICIALES.length})`}
            </button>
          </div>
        </div>
      )}

      {/* Alta rápida */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="Nombre de la nueva plantilla"
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        />
        <button
          type="button"
          onClick={handleCrear}
          disabled={guardando || !nuevoNombre.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          <Plus size={14} /> Crear
        </button>
      </div>

      {/* Variables disponibles */}
      <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs uppercase tracking-wide text-blue-800 font-semibold mb-2">Variables disponibles</p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES_PLANTILLA.map((v) => (
            <code key={v} className="text-[11px] px-2 py-0.5 bg-white border border-blue-100 text-blue-900 rounded font-mono">
              {`{${v}}`}
            </code>
          ))}
        </div>
        <p className="text-[11px] text-blue-800 mt-2">
          Las variables se reemplazan por los datos del cliente. Si el dato falta, se usa un fallback razonable
          (ej: <code>{'{equipoTipo}'}</code> → "tu equipo").
        </p>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {plantillas.map((p) => {
          const enEdicion = !!editando[p.id];
          const draft = editando[p.id];
          const previewSrc = enEdicion ? draft.mensaje : p.mensaje;
          const fallbacks = variablesEnFallback(previewSrc, clientePreviewFake);
          const previewText = previewSrc.replace(/\{(\w+)\}/g, (m, k) => {
            const map: Record<string, string> = {
              nombre: 'Juan',
              telefono: '8095551234',
              ultimoServicio: 'hace 8 meses',
              mesesUltimoServicio: '8',
              equipoTipo: 'Lavadora',
              zona: 'Distrito Nacional',
            };
            return map[k] || m;
          });
          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl shadow-sm border ${
                p.activa ? 'border-gray-100' : 'border-gray-200 bg-gray-50/40'
              } p-4`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="flex-1 min-w-0">
                  {enEdicion ? (
                    <input
                      type="text"
                      value={draft.nombre}
                      onChange={(e) =>
                        setEditando((prev) => ({ ...prev, [p.id]: { ...draft, nombre: e.target.value } }))
                      }
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    />
                  ) : (
                    <h3 className="text-sm font-semibold text-gray-900">{p.nombre}</h3>
                  )}
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">id: {p.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={p.activa}
                      onChange={() => handleToggleActiva(p.id)}
                      disabled={guardando}
                      className="accent-[#0f3460]"
                    />
                    {p.activa ? 'Activa' : 'Inactiva'}
                  </label>
                  {!enEdicion ? (
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      Editar
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(p.id)}
                        disabled={guardando}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg transition-colors disabled:opacity-60"
                      >
                        <Save size={11} /> Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelEdit(p.id)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEliminar(p.id)}
                    disabled={guardando}
                    title="Eliminar plantilla"
                    className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">Mensaje</p>
                  {enEdicion ? (
                    <textarea
                      value={draft.mensaje}
                      onChange={(e) =>
                        setEditando((prev) => ({ ...prev, [p.id]: { ...draft, mensaje: e.target.value } }))
                      }
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
                    />
                  ) : (
                    <pre className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap font-mono">
                      {p.mensaje}
                    </pre>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1 flex items-center gap-1">
                    <Eye size={10} /> Preview (datos de ejemplo)
                  </p>
                  <div className="text-xs bg-emerald-50 border border-emerald-100 rounded-lg p-3 whitespace-pre-wrap min-h-[80px]">
                    {previewText}
                  </div>
                  {fallbacks.length > 0 && (
                    <p className="text-[10px] text-blue-700 mt-1">
                      Variables con fallback en este preview: {fallbacks.map((v) => `{${v}}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {plantillas.length === 0 && docExiste && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            No hay plantillas. Creá una arriba.
          </div>
        )}
      </div>

      {/* ─── Campañas históricas (ROI tracking) ─────────────────────── */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-[#0f3460]" />
          <h2 className="text-lg font-bold text-[#0f3460]">Campañas históricas</h2>
        </div>
        <p className="text-xs text-gray-500">
          Registro de campañas creadas desde el tab Reactivación. La tasa de reactivación se calcula
          como (órdenes nuevas dentro de 60 días post-envío / total enviados).
        </p>
        {campanas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Todavía no hay campañas registradas.
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2 font-semibold">Fecha</th>
                    <th className="px-4 py-2 font-semibold">Plantilla</th>
                    <th className="px-4 py-2 font-semibold">Filtros</th>
                    <th className="px-4 py-2 font-semibold text-right">Enviados</th>
                    <th className="px-4 py-2 font-semibold text-right">Reactivados</th>
                    <th className="px-4 py-2 font-semibold text-right">Tasa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campanas.map((c) => {
                    const fechaCampana = c.fecha instanceof Date
                      ? c.fecha
                      : (c.fecha && typeof (c.fecha as { toDate?: () => Date }).toDate === 'function'
                        ? (c.fecha as { toDate: () => Date }).toDate()
                        : null);
                    const totalReac = typeof c.totalReactivados === 'number' ? c.totalReactivados : 0;
                    const tasa = c.totalEnviados > 0
                      ? `${((totalReac / c.totalEnviados) * 100).toFixed(1)}%`
                      : '—';
                    const filtros: string[] = [];
                    if (c.filtrosAplicados?.zonas?.length) {
                      filtros.push(`Zonas: ${c.filtrosAplicados.zonas.join(', ')}`);
                    }
                    if (c.filtrosAplicados?.rangoUltimoServicio) {
                      filtros.push(`Servicio: ${c.filtrosAplicados.rangoUltimoServicio}`);
                    }
                    if (c.filtrosAplicados?.tipo) {
                      filtros.push(`Tipo: ${c.filtrosAplicados.tipo}`);
                    }
                    if (c.filtrosAplicados?.equipos?.length) {
                      filtros.push(`Equipos: ${c.filtrosAplicados.equipos.join(', ')}`);
                    }
                    if (c.filtrosAplicados?.rangoServiciosTotales) {
                      filtros.push(`Total svcs: ${c.filtrosAplicados.rangoServiciosTotales}`);
                    }
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                          {fechaCampana ? format(fechaCampana, 'd MMM yyyy', { locale: es }) : '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-900">
                          <div className="font-medium">{c.plantillaNombre || c.plantillaId}</div>
                          <div className="text-[11px] text-gray-400 font-mono">{c.plantillaId}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 max-w-xs">
                          {filtros.length > 0 ? filtros.join(' · ') : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                          {c.totalEnviados}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                          {totalReac}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-900 font-semibold tabular-nums">
                          {tasa}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
