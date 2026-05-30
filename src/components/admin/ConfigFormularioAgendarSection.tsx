import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ConfigFormularioAgendar,
  CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
  CampoPersonalizado,
  CampoPersonalizadoTipo,
  ROLES_NOTIFICACION_AGENDAR,
} from '../../types/configFormularioAgendar';
import {
  obtenerConfigFormularioAgendar,
  guardarConfigFormularioAgendar,
} from '../../services/formularioAgendar.service';
import { useApp } from '../../context/AppContext';

const inputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium focus:border-transparent transition';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const cardClass =
  'bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5';
const saveBtnClass =
  'inline-flex items-center gap-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium px-5 py-2.5 transition disabled:opacity-50';

function generarIdCampo(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ConfigFormularioAgendarSection() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigFormularioAgendar>({
    ...CONFIG_FORMULARIO_AGENDAR_DEFAULTS,
  });
  const [nuevoBloque, setNuevoBloque] = useState('');

  useEffect(() => {
    let activo = true;
    obtenerConfigFormularioAgendar()
      .then(c => {
        if (activo) setConfig(c);
      })
      .catch(err => {
        console.error('Error cargando config formulario agendar:', err);
        toast.error('Error al cargar el formulario');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const update = (partial: Partial<ConfigFormularioAgendar>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  };

  // ─── Bloques de hora ───────────────────────────────

  const agregarBloque = () => {
    const v = nuevoBloque.trim();
    if (!v) return;
    const actuales = config.bloquesHora ?? [];
    if (actuales.includes(v)) {
      toast.error('Ese bloque ya existe');
      return;
    }
    update({ bloquesHora: [...actuales, v] });
    setNuevoBloque('');
  };

  const eliminarBloque = (idx: number) => {
    const actuales = config.bloquesHora ?? [];
    update({ bloquesHora: actuales.filter((_, i) => i !== idx) });
  };

  const moverBloque = (idx: number, direccion: -1 | 1) => {
    const actuales = [...(config.bloquesHora ?? [])];
    const destino = idx + direccion;
    if (destino < 0 || destino >= actuales.length) return;
    [actuales[idx], actuales[destino]] = [actuales[destino], actuales[idx]];
    update({ bloquesHora: actuales });
  };

  // ─── Campos personalizados ──────────────────────────

  const agregarCampo = () => {
    const nuevo: CampoPersonalizado = {
      id: generarIdCampo(),
      label: 'Nuevo campo',
      tipo: 'text',
      requerido: false,
    };
    update({
      camposPersonalizados: [...(config.camposPersonalizados ?? []), nuevo],
    });
  };

  const actualizarCampo = (
    idx: number,
    partial: Partial<CampoPersonalizado>,
  ) => {
    const actuales = [...(config.camposPersonalizados ?? [])];
    actuales[idx] = { ...actuales[idx], ...partial };
    update({ camposPersonalizados: actuales });
  };

  const eliminarCampo = (idx: number) => {
    const actuales = [...(config.camposPersonalizados ?? [])];
    actuales.splice(idx, 1);
    update({ camposPersonalizados: actuales });
  };

  const moverCampo = (idx: number, direccion: -1 | 1) => {
    const actuales = [...(config.camposPersonalizados ?? [])];
    const destino = idx + direccion;
    if (destino < 0 || destino >= actuales.length) return;
    [actuales[idx], actuales[destino]] = [actuales[destino], actuales[idx]];
    update({ camposPersonalizados: actuales });
  };

  // Editor de opciones de un campo `select`
  const agregarOpcionCampo = (idx: number, opcion: string) => {
    const v = opcion.trim();
    if (!v) return;
    const campo = (config.camposPersonalizados ?? [])[idx];
    if (!campo) return;
    const actuales = campo.opciones ?? [];
    if (actuales.includes(v)) {
      toast.error('Esa opción ya existe');
      return;
    }
    actualizarCampo(idx, { opciones: [...actuales, v] });
  };

  const eliminarOpcionCampo = (idxCampo: number, idxOpcion: number) => {
    const campo = (config.camposPersonalizados ?? [])[idxCampo];
    if (!campo) return;
    const actuales = (campo.opciones ?? []).filter((_, i) => i !== idxOpcion);
    actualizarCampo(idxCampo, { opciones: actuales });
  };

  // ─── Guardar ─────────────────────────────────────────

  const handleGuardar = async () => {
    setSaving(true);
    try {
      // Validación: debe haber al menos 1 bloque de hora disponible
      const bloques = config.bloquesHora ?? [];
      if (bloques.length === 0) {
        toast.error('Debe haber al menos 1 bloque de hora');
        setSaving(false);
        return;
      }

      // Validación: si un campo es select, debe tener al menos una opción
      const personalizados = config.camposPersonalizados ?? [];
      for (const c of personalizados) {
        if (!c.label?.trim()) {
          toast.error('Todos los campos personalizados deben tener etiqueta');
          setSaving(false);
          return;
        }
        if (c.tipo === 'select' && (!c.opciones || c.opciones.length === 0)) {
          toast.error(`El campo "${c.label}" tipo select necesita al menos una opción`);
          setSaving(false);
          return;
        }
      }

      await guardarConfigFormularioAgendar(config, {
        id: userProfile?.id,
        nombre: userProfile?.nombre,
      });
      toast.success('Formulario guardado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el formulario');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────

  if (loading) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary-medium" />
          <h2 className="text-lg font-semibold text-gray-900">
            Formulario de Agendamiento
          </h2>
        </div>
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    );
  }

  const habilitado = config.habilitado ?? true;
  const mostrarSector = config.mostrarCampoSector ?? true;
  const personalizados = config.camposPersonalizados ?? [];
  const bloques = config.bloquesHora ?? [];
  const bloquesVacios = bloques.length === 0;

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-primary-medium" />
        <h2 className="text-lg font-semibold text-gray-900">
          Formulario de Agendamiento
        </h2>
      </div>
      <p className="text-sm text-gray-500 -mt-2">
        Edita lo que ven los clientes en la página pública{' '}
        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
          /agendar
        </code>
        .
      </p>

      {/* Toggle habilitado */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div>
          <p className="text-sm font-medium text-gray-700">
            Formulario activo
          </p>
          <p className="text-xs text-gray-500">
            Si lo apagas, el sitio muestra un mensaje de cierre temporal con
            botón a WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={() => update({ habilitado: !habilitado })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            habilitado ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              habilitado ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Título principal</label>
          <input
            type="text"
            className={inputClass}
            value={config.tituloHero ?? ''}
            onChange={e => update({ tituloHero: e.target.value })}
            placeholder="Agenda tu cita"
          />
        </div>
        <div>
          <label className={labelClass}>Subtítulo</label>
          <input
            type="text"
            className={inputClass}
            value={config.subtituloHero ?? ''}
            onChange={e => update({ subtituloHero: e.target.value })}
            placeholder="Llena este formulario..."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Mensaje de éxito</label>
          <textarea
            className={`${inputClass} min-h-[70px] resize-y`}
            value={config.mensajeExito ?? ''}
            onChange={e => update({ mensajeExito: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Mensaje cuando esté apagado</label>
          <textarea
            className={`${inputClass} min-h-[70px] resize-y`}
            value={config.mensajeDeshabilitado ?? ''}
            onChange={e => update({ mensajeDeshabilitado: e.target.value })}
          />
        </div>
      </div>

      {/* Campos opcionales */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-700">
          Campos opcionales del formulario
        </h3>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={mostrarSector}
            onChange={e => update({ mostrarCampoSector: e.target.checked })}
            className="rounded border-gray-300 text-primary-medium focus:ring-primary-medium"
          />
          Mostrar campo &quot;Sector&quot;
        </label>
      </div>

      {/* Bloques de hora disponibles */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Bloques de hora disponibles
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Bloques que el cliente verá como botones para elegir su hora
            preferida en <code className="text-xs bg-gray-100 px-1 rounded">/agendar</code>.
            Texto libre (ej: &quot;9:00 AM&quot;, &quot;7:00 PM&quot;).
          </p>
        </div>

        {bloques.length === 0 ? (
          <p className="text-xs text-red-600 font-medium">
            Debe haber al menos 1 bloque de hora.
          </p>
        ) : (
          <div className="space-y-2">
            {bloques.map((bloque, idx) => (
              <div
                key={`${bloque}-${idx}`}
                className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
              >
                <span className="text-sm text-gray-700 font-medium">
                  {bloque}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moverBloque(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Subir"
                  >
                    <ArrowUp className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moverBloque(idx, 1)}
                    disabled={idx === bloques.length - 1}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Bajar"
                  >
                    <ArrowDown className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminarBloque(idx)}
                    className="p-1.5 rounded hover:bg-red-100 transition"
                    title="Eliminar bloque"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            className={`${inputClass} flex-1`}
            placeholder="Ej: 7:00 PM"
            value={nuevoBloque}
            onChange={e => setNuevoBloque(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregarBloque();
              }
            }}
          />
          <button
            type="button"
            onClick={agregarBloque}
            className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium px-3 py-2 transition"
          >
            <Plus className="w-4 h-4" />
            Agregar bloque
          </button>
        </div>
      </div>

      {/* Notificaciones de nueva cita */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Notificaciones de nueva cita
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Roles del staff que reciben una notificación in-app cuando entra
            una solicitud nueva desde el formulario público. Si dejas todos
            sin marcar, se usa el set por defecto (secretaria, coordinadora,
            administrador).
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {ROLES_NOTIFICACION_AGENDAR.map(rol => {
            const seleccionados =
              config.notificarA ??
              CONFIG_FORMULARIO_AGENDAR_DEFAULTS.notificarA;
            const marcado = seleccionados.includes(rol);
            return (
              <label
                key={rol}
                className="flex items-center gap-2 text-sm text-gray-700 capitalize bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={e => {
                    const actuales =
                      config.notificarA ??
                      CONFIG_FORMULARIO_AGENDAR_DEFAULTS.notificarA;
                    const nuevo = e.target.checked
                      ? Array.from(new Set([...actuales, rol]))
                      : actuales.filter(r => r !== rol);
                    update({ notificarA: nuevo });
                  }}
                  className="rounded border-gray-300 text-primary-medium focus:ring-primary-medium"
                />
                {rol}
              </label>
            );
          })}
        </div>
      </div>

      {/* Campos personalizados */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Campos personalizados
          </h3>
          <button
            type="button"
            onClick={agregarCampo}
            className="inline-flex items-center gap-1.5 text-sm text-primary-medium hover:text-primary font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Agregar campo
          </button>
        </div>

        {personalizados.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            Sin campos personalizados. Los clientes solo verán los campos
            estándar.
          </p>
        ) : (
          <div className="space-y-3">
            {personalizados.map((campo, idx) => (
              <CampoPersonalizadoEditor
                key={campo.id}
                campo={campo}
                indice={idx}
                total={personalizados.length}
                onActualizar={partial => actualizarCampo(idx, partial)}
                onEliminar={() => eliminarCampo(idx)}
                onMover={dir => moverCampo(idx, dir)}
                onAgregarOpcion={op => agregarOpcionCampo(idx, op)}
                onEliminarOpcion={i => eliminarOpcionCampo(idx, i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Guardar */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleGuardar}
          disabled={saving || bloquesVacios}
          className={saveBtnClass}
          title={
            bloquesVacios
              ? 'Agrega al menos 1 bloque de hora antes de guardar'
              : undefined
          }
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Formulario'}
        </button>
      </div>
    </div>
  );
}

// ─── Subcomponente: editor de un campo personalizado ───────────────

interface CampoPersonalizadoEditorProps {
  campo: CampoPersonalizado;
  indice: number;
  total: number;
  onActualizar: (partial: Partial<CampoPersonalizado>) => void;
  onEliminar: () => void;
  onMover: (direccion: -1 | 1) => void;
  onAgregarOpcion: (opcion: string) => void;
  onEliminarOpcion: (idx: number) => void;
}

function CampoPersonalizadoEditor({
  campo,
  indice,
  total,
  onActualizar,
  onEliminar,
  onMover,
  onAgregarOpcion,
  onEliminarOpcion,
}: CampoPersonalizadoEditorProps) {
  const [opcionTemp, setOpcionTemp] = useState('');

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-500">
          Campo #{indice + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMover(-1)}
            disabled={indice === 0}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Subir"
          >
            <ArrowUp className="w-4 h-4 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            disabled={indice === total - 1}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Bajar"
          >
            <ArrowDown className="w-4 h-4 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={onEliminar}
            className="p-1.5 rounded hover:bg-red-100 transition"
            title="Eliminar campo"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Etiqueta</label>
          <input
            type="text"
            className={inputClass}
            value={campo.label}
            onChange={e => onActualizar({ label: e.target.value })}
            placeholder="Ej: ¿Tu equipo está bajo garantía?"
          />
        </div>
        <div>
          <label className={labelClass}>Tipo</label>
          <select
            className={inputClass}
            value={campo.tipo}
            onChange={e =>
              onActualizar({
                tipo: e.target.value as CampoPersonalizadoTipo,
                // limpiar opciones si cambia de select a otro tipo
                opciones:
                  e.target.value === 'select'
                    ? campo.opciones ?? []
                    : undefined,
              })
            }
          >
            <option value="text">Texto corto</option>
            <option value="textarea">Texto largo</option>
            <option value="select">Selección (dropdown)</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={!!campo.requerido}
          onChange={e => onActualizar({ requerido: e.target.checked })}
          className="rounded border-gray-300 text-primary-medium focus:ring-primary-medium"
        />
        Requerido
      </label>

      {campo.tipo === 'select' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Opciones del dropdown:</p>
          <div className="flex flex-wrap gap-2">
            {(campo.opciones ?? []).map((op, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm px-3 py-1.5 rounded-lg"
              >
                {op}
                <button
                  type="button"
                  onClick={() => onEliminarOpcion(i)}
                  className="text-gray-400 hover:text-red-500 transition"
                  title="Eliminar opción"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder="Nueva opción"
              value={opcionTemp}
              onChange={e => setOpcionTemp(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAgregarOpcion(opcionTemp);
                  setOpcionTemp('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                onAgregarOpcion(opcionTemp);
                setOpcionTemp('');
              }}
              className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium px-3 py-2 transition"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
