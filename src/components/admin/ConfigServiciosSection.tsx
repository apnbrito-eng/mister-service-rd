import { useEffect, useMemo, useState } from 'react';
import {
  Wrench,
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  Edit3,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  ConfigWeb,
  ServicioDetalle,
  ServicioFAQ,
  guardarConfigWeb,
  subirImagenWeb,
  slugify,
} from '../../services/configWeb.service';
import { comprimirImagen } from '../../utils/imagen';

const inputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium focus:border-transparent transition';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const cardClass =
  'bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5';
const saveBtnClass =
  'inline-flex items-center gap-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium px-5 py-2.5 transition disabled:opacity-50';

interface Props {
  config: ConfigWeb;
  setConfig: React.Dispatch<React.SetStateAction<ConfigWeb>>;
}

/**
 * Comprime y sube una imagen al folder `web-assets/servicios/...` y retorna
 * la URL pública o null si hubo error. Reutiliza `subirImagenWeb` y el
 * helper `comprimirImagen` (mismo pipeline que las imágenes del hero).
 */
async function comprimirYSubirServicio(file: File): Promise<string | null> {
  try {
    const blob = await comprimirImagen(file, {
      maxBytes: 1_000_000,
      maxDim: 1920,
    });
    const safeName = file.name.replace(/[^\w.-]/g, '_') || 'servicio.jpg';
    const archivo = new File([blob], safeName, { type: 'image/jpeg' });
    return await subirImagenWeb(archivo, 'servicios');
  } catch (err) {
    console.error('Error subiendo imagen del servicio:', err);
    return null;
  }
}

// ───────────────────────────────────────────────────────
// Modal de edición de un servicio
// ───────────────────────────────────────────────────────

interface ModalProps {
  servicio: ServicioDetalle;
  slugOriginal: string;
  todosLosSlugs: string[];
  onSave: (slug: string, servicio: ServicioDetalle) => void;
  onClose: () => void;
}

function ServicioEditorModal({
  servicio: inicial,
  slugOriginal,
  todosLosSlugs,
  onSave,
  onClose,
}: ModalProps) {
  const [draft, setDraft] = useState<ServicioDetalle>(inicial);
  const [uploadingCard, setUploadingCard] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);

  const update = (patch: Partial<ServicioDetalle>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  // ─── Imágenes ─────────────────────────────────────
  const handleSubirImagen = async (
    e: React.ChangeEvent<HTMLInputElement>,
    campo: 'imagenCard' | 'imagenHero',
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen');
      return;
    }
    if (campo === 'imagenCard') setUploadingCard(true);
    else setUploadingHero(true);

    const url = await comprimirYSubirServicio(file);

    if (campo === 'imagenCard') setUploadingCard(false);
    else setUploadingHero(false);

    if (!url) {
      toast.error('Error al subir la imagen');
      return;
    }
    update({ [campo]: url });
    toast.success('Imagen subida');
  };

  // Borra el campo en Firestore con `deleteField()` (mismo patrón que el
  // botón "Quitar imagen" del hero), para evitar que un valor stale
  // resucite el viejo URL en lecturas defensivas.
  const handleQuitarImagen = async (campo: 'imagenCard' | 'imagenHero') => {
    if (!slugOriginal) {
      // El servicio aún no existe en Firestore (solo en memoria).
      update({ [campo]: undefined });
      return;
    }
    try {
      await updateDoc(doc(db, 'config_web', 'sitio'), {
        [`servicios.${slugOriginal}.${campo}`]: deleteField(),
      });
      update({ [campo]: undefined });
      toast.success('Imagen eliminada');
    } catch (err) {
      console.error('Error al quitar imagen del servicio:', err);
      toast.error('Error al quitar la imagen');
    }
  };

  // ─── Listas (problemas, marcas) ───────────────────
  const updateLista = (
    campo: 'problemasComunes' | 'marcasReparadas',
    nueva: string[],
  ) => {
    update({ [campo]: nueva });
  };

  const moverItem = (
    campo: 'problemasComunes' | 'marcasReparadas',
    idx: number,
    dir: -1 | 1,
  ) => {
    const arr = [...draft[campo]];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    updateLista(campo, arr);
  };

  // ─── FAQs ─────────────────────────────────────────
  const updateFAQ = (idx: number, patch: Partial<ServicioFAQ>) => {
    const arr = [...draft.faqs];
    arr[idx] = { ...arr[idx], ...patch };
    update({ faqs: arr });
  };

  const moverFAQ = (idx: number, dir: -1 | 1) => {
    const arr = [...draft.faqs];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    update({ faqs: arr });
  };

  const eliminarFAQ = (idx: number) => {
    update({ faqs: draft.faqs.filter((_, i) => i !== idx) });
  };

  const agregarFAQ = () => {
    update({ faqs: [...draft.faqs, { pregunta: '', respuesta: '' }] });
  };

  // ─── Guardar ─────────────────────────────────────
  const handleSave = () => {
    const tituloTrim = draft.titulo.trim();
    if (!tituloTrim) {
      toast.error('El título es requerido');
      return;
    }
    const slugLimpio = slugify(draft.slug || tituloTrim);
    if (!slugLimpio) {
      toast.error('Slug inválido');
      return;
    }
    // Si cambió el slug, validar que no choque con uno existente (excluyendo el original).
    if (
      slugLimpio !== slugOriginal &&
      todosLosSlugs.includes(slugLimpio)
    ) {
      toast.error(`Ya existe un servicio con el slug "${slugLimpio}"`);
      return;
    }
    onSave(slugLimpio, { ...draft, slug: slugLimpio, titulo: tituloTrim });
  };

  const charsCorta = draft.descripcionCorta.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full my-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-bold text-gray-900">
            {slugOriginal ? `Editar servicio: ${slugOriginal}` : 'Nuevo servicio'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Imágenes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Imagen de card (home)</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium px-3 py-2 transition">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingCard ? 'Subiendo...' : 'Subir'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingCard}
                    onChange={(e) => handleSubirImagen(e, 'imagenCard')}
                  />
                </label>
                {draft.imagenCard && (
                  <button
                    type="button"
                    onClick={() => handleQuitarImagen('imagenCard')}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Quitar
                  </button>
                )}
              </div>
              {draft.imagenCard ? (
                <img
                  src={draft.imagenCard}
                  alt="Card"
                  className="mt-3 max-h-32 rounded-lg border border-gray-200 object-cover"
                />
              ) : (
                <div className="mt-3 h-32 bg-gray-50 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300">
                  <ImageIcon size={28} />
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>Imagen de hero (página)</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium px-3 py-2 transition">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingHero ? 'Subiendo...' : 'Subir'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingHero}
                    onChange={(e) => handleSubirImagen(e, 'imagenHero')}
                  />
                </label>
                {draft.imagenHero && (
                  <button
                    type="button"
                    onClick={() => handleQuitarImagen('imagenHero')}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Quitar
                  </button>
                )}
              </div>
              {draft.imagenHero ? (
                <img
                  src={draft.imagenHero}
                  alt="Hero"
                  className="mt-3 max-h-32 rounded-lg border border-gray-200 object-cover w-full"
                />
              ) : (
                <div className="mt-3 h-32 bg-gray-50 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300">
                  <ImageIcon size={28} />
                </div>
              )}
            </div>
          </div>

          {/* Título / tipo / slug */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Título *</label>
              <input
                type="text"
                className={inputClass}
                value={draft.titulo}
                onChange={(e) => update({ titulo: e.target.value })}
                placeholder="Reparación de Lavadoras a Domicilio"
              />
            </div>
            <div>
              <label className={labelClass}>Tipo de equipo</label>
              <input
                type="text"
                className={inputClass}
                value={draft.tipoEquipo}
                onChange={(e) => update({ tipoEquipo: e.target.value })}
                placeholder="Lavadora"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Slug (URL)</label>
              <input
                type="text"
                className={inputClass}
                value={draft.slug}
                onChange={(e) => update({ slug: slugify(e.target.value) })}
                placeholder="lavadoras"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Sólo letras, números y guiones. Página: <code>/servicios/{draft.slug || 'slug'}</code>
              </p>
            </div>
            <div>
              <label className={labelClass}>Tiempo estimado de reparación</label>
              <input
                type="text"
                className={inputClass}
                value={draft.tiempoEstimadoReparacion ?? ''}
                onChange={(e) =>
                  update({ tiempoEstimadoReparacion: e.target.value || undefined })
                }
                placeholder="1-3 horas"
              />
            </div>
          </div>

          {/* Descripciones */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelClass} mb-0`}>
                Descripción corta * (max 100)
              </label>
              <span
                className={`text-[11px] ${
                  charsCorta > 100 ? 'text-red-600 font-semibold' : 'text-gray-400'
                }`}
              >
                {charsCorta}/100
              </span>
            </div>
            <input
              type="text"
              className={inputClass}
              value={draft.descripcionCorta}
              onChange={(e) => update({ descripcionCorta: e.target.value })}
              placeholder="Reparación de todo tipo de lavadoras..."
            />
          </div>

          <div>
            <label className={labelClass}>Descripción larga</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={draft.descripcionLarga ?? ''}
              onChange={(e) =>
                update({ descripcionLarga: e.target.value || undefined })
              }
              placeholder="Texto extendido visible en la página dedicada..."
            />
          </div>

          {/* Problemas comunes */}
          <ListaEditable
            titulo="Problemas comunes"
            placeholder="Ej: No centrifuga / no escurre"
            items={draft.problemasComunes}
            onChange={(items) => updateLista('problemasComunes', items)}
            onMover={(idx, dir) => moverItem('problemasComunes', idx, dir)}
          />

          {/* Marcas */}
          <ListaEditable
            titulo="Marcas que reparamos"
            placeholder="Ej: LG"
            items={draft.marcasReparadas}
            onChange={(items) => updateLista('marcasReparadas', items)}
            onMover={(idx, dir) => moverItem('marcasReparadas', idx, dir)}
          />

          {/* FAQs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`${labelClass} mb-0`}>FAQs</label>
              <button
                type="button"
                onClick={agregarFAQ}
                className="inline-flex items-center gap-1 text-xs text-primary-medium hover:text-primary font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar FAQ
              </button>
            </div>
            <div className="space-y-3">
              {draft.faqs.length === 0 && (
                <p className="text-xs text-gray-400 italic bg-gray-50 rounded-lg p-3 text-center">
                  Aún no hay FAQs.
                </p>
              )}
              {draft.faqs.map((f, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-2"
                >
                  <input
                    type="text"
                    className={inputClass}
                    value={f.pregunta}
                    onChange={(e) => updateFAQ(idx, { pregunta: e.target.value })}
                    placeholder="¿Pregunta?"
                  />
                  <textarea
                    className={`${inputClass} min-h-[60px] resize-y`}
                    value={f.respuesta}
                    onChange={(e) => updateFAQ(idx, { respuesta: e.target.value })}
                    placeholder="Respuesta..."
                  />
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => moverFAQ(idx, -1)}
                      disabled={idx === 0}
                      className="p-1.5 text-gray-500 hover:text-primary hover:bg-white rounded disabled:opacity-30"
                      title="Mover arriba"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moverFAQ(idx, 1)}
                      disabled={idx === draft.faqs.length - 1}
                      className="p-1.5 text-gray-500 hover:text-primary hover:bg-white rounded disabled:opacity-30"
                      title="Mover abajo"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarFAQ(idx)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-white rounded"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Habilitado + orden */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">
                Habilitado en home
              </label>
              <button
                type="button"
                onClick={() => update({ habilitado: !draft.habilitado })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  draft.habilitado ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    draft.habilitado ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div>
              <label className={labelClass}>Orden</label>
              <input
                type="number"
                className={`${inputClass} max-w-[120px]`}
                value={draft.orden}
                onChange={(e) =>
                  update({
                    orden: Number.isFinite(Number(e.target.value))
                      ? Number(e.target.value)
                      : 0,
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={saveBtnClass}
          >
            <Save className="w-4 h-4" />
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────
// Lista editable (para problemasComunes y marcasReparadas)
// ───────────────────────────────────────────────────────

function ListaEditable({
  titulo,
  placeholder,
  items,
  onChange,
  onMover,
}: {
  titulo: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  onMover: (idx: number, dir: -1 | 1) => void;
}) {
  const [nuevo, setNuevo] = useState('');

  const agregar = () => {
    const v = nuevo.trim();
    if (!v) return;
    if (items.includes(v)) {
      toast.error('Ese ítem ya existe');
      return;
    }
    onChange([...items, v]);
    setNuevo('');
  };

  const eliminar = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const editar = (idx: number, valor: string) => {
    const arr = [...items];
    arr[idx] = valor;
    onChange(arr);
  };

  return (
    <div>
      <label className={labelClass}>{titulo}</label>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-gray-400 italic bg-gray-50 rounded-lg p-3 text-center">
            Aún no hay ítems.
          </p>
        )}
        {items.map((item, idx) => (
          <div
            key={`${idx}-${item}`}
            className="flex items-center gap-2 bg-gray-50 rounded-lg border border-gray-100 p-2"
          >
            <input
              type="text"
              className={`${inputClass} flex-1`}
              value={item}
              onChange={(e) => editar(idx, e.target.value)}
            />
            <button
              type="button"
              onClick={() => onMover(idx, -1)}
              disabled={idx === 0}
              className="p-1.5 text-gray-500 hover:text-primary hover:bg-white rounded disabled:opacity-30"
              title="Mover arriba"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onMover(idx, 1)}
              disabled={idx === items.length - 1}
              className="p-1.5 text-gray-500 hover:text-primary hover:bg-white rounded disabled:opacity-30"
              title="Mover abajo"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => eliminar(idx)}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-white rounded"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 mt-2">
        <input
          type="text"
          className={`${inputClass} flex-1`}
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              agregar();
            }
          }}
        />
        <button
          type="button"
          onClick={agregar}
          className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium px-3 py-2 transition"
        >
          <Plus className="w-4 h-4" />
          Agregar
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────
// Sección principal
// ───────────────────────────────────────────────────────

export default function ConfigServiciosSection({ config, setConfig }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{
    slug: string; // '' si es nuevo
    servicio: ServicioDetalle;
  } | null>(null);

  // Mantener la lista local en sync con el config padre.
  useEffect(() => {
    // Sólo aseguramos que `servicios` exista para no romper iteraciones.
    if (!config.servicios) {
      setConfig((prev) => ({ ...prev, servicios: {} }));
    }
  }, [config.servicios, setConfig]);

  // Memoizamos `servicios` porque `?? {}` crea un objeto nuevo en cada render
  // y eso invalida los useMemo dependientes innecesariamente.
  const servicios = useMemo(
    () => config.servicios ?? {},
    [config.servicios],
  );
  const ordenados = useMemo(
    () =>
      Object.values(servicios).sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999)),
    [servicios],
  );
  const slugs = Object.keys(servicios);

  // Tipos de equipo del catálogo público que aún no tienen servicio.
  const tiposSinServicio = useMemo(() => {
    const tipos = config.tiposEquipoPublicos ?? [];
    const tiposExistentes = new Set(
      Object.values(servicios).map((s) => s.tipoEquipo),
    );
    return tipos.filter((t) => !tiposExistentes.has(t));
  }, [config.tiposEquipoPublicos, servicios]);

  // ─── Handlers de la lista ──────────────────────────

  const setServicios = (next: { [slug: string]: ServicioDetalle }) => {
    setConfig((prev) => ({ ...prev, servicios: next }));
  };

  const toggleHabilitado = (slug: string) => {
    const s = servicios[slug];
    if (!s) return;
    setServicios({ ...servicios, [slug]: { ...s, habilitado: !s.habilitado } });
  };

  const moverServicio = (slug: string, dir: -1 | 1) => {
    const idx = ordenados.findIndex((s) => s.slug === slug);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= ordenados.length) return;
    const a = ordenados[idx];
    const b = ordenados[target];
    setServicios({
      ...servicios,
      [a.slug]: { ...a, orden: b.orden },
      [b.slug]: { ...b, orden: a.orden },
    });
  };

  const eliminarServicio = async (slug: string) => {
    if (!confirm(`¿Eliminar el servicio "${slug}"? No se puede deshacer.`))
      return;
    // Borrar la key explícitamente en Firestore con `deleteField()`. Si solo
    // hacemos `setDoc(merge:true)` sin esto, la entrada vieja queda zombie en
    // el doc porque el merge profundo preserva keys ausentes.
    try {
      await updateDoc(doc(db, 'config_web', 'sitio'), {
        [`servicios.${slug}`]: deleteField(),
      });
    } catch (err) {
      console.error('Error eliminando servicio en Firestore:', err);
      toast.error('Error al eliminar');
      return;
    }
    const next = { ...servicios };
    delete next[slug];
    setServicios(next);
    toast.success('Servicio eliminado');
  };

  const abrirEditor = (slug: string) => {
    const s = servicios[slug];
    if (!s) return;
    setEditing({ slug, servicio: { ...s } });
  };

  const crearNuevoVacio = () => {
    const proximo = ordenados.length + 1;
    setEditing({
      slug: '',
      servicio: {
        slug: '',
        tipoEquipo: '',
        titulo: '',
        descripcionCorta: '',
        descripcionLarga: undefined,
        imagenCard: undefined,
        imagenHero: undefined,
        problemasComunes: [],
        marcasReparadas: [],
        faqs: [],
        tiempoEstimadoReparacion: undefined,
        habilitado: true,
        orden: proximo,
      },
    });
  };

  const crearDesdeTipo = (tipoEquipo: string) => {
    const slug = slugify(tipoEquipo);
    if (!slug) {
      toast.error('No se pudo generar slug a partir del tipo');
      return;
    }
    const proximo = ordenados.length + 1;
    setEditing({
      slug: '',
      servicio: {
        slug,
        tipoEquipo,
        titulo: `Reparación de ${tipoEquipo}`,
        descripcionCorta: '',
        descripcionLarga: undefined,
        imagenCard: undefined,
        imagenHero: undefined,
        problemasComunes: [],
        marcasReparadas: [],
        faqs: [],
        tiempoEstimadoReparacion: undefined,
        habilitado: true,
        orden: proximo,
      },
    });
  };

  const handleSaveModal = async (slugFinal: string, servicio: ServicioDetalle) => {
    const slugAnterior = editing?.slug;
    // Si admin renombró el slug, hay que borrar la key vieja en Firestore
    // antes (un `setDoc(merge:true)` posterior NO la quita). Si el servicio
    // recién se creó en memoria y aún no se guardó, `slugAnterior` está vacío
    // y no hay nada que borrar.
    if (slugAnterior && slugAnterior !== slugFinal) {
      try {
        await updateDoc(doc(db, 'config_web', 'sitio'), {
          [`servicios.${slugAnterior}`]: deleteField(),
        });
      } catch (err) {
        console.error('Error renombrando slug en Firestore:', err);
        toast.error('Error al renombrar');
        return;
      }
    }
    const next = { ...servicios };
    if (slugAnterior && slugAnterior !== slugFinal) {
      delete next[slugAnterior];
    }
    next[slugFinal] = servicio;
    setServicios(next);
    setEditing(null);
    toast.success('Servicio actualizado en el editor (recuerda guardar)');
  };

  // ─── Persistir todo el config ────────────────────
  const handleGuardarTodo = async () => {
    setSaving(true);
    try {
      await guardarConfigWeb(config);
      toast.success('Servicios guardados');
    } catch (err) {
      console.error('Error guardando servicios:', err);
      toast.error('Error al guardar servicios');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">Servicios</h2>
          <span className="text-xs text-gray-400 ml-2">
            ({ordenados.length})
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>
      <p className="text-xs text-gray-500 -mt-2">
        Páginas dedicadas <code>/servicios/:slug</code>. Cada servicio se muestra
        en la home con su card y abre su página detallada al click. Los slugs
        canónicos vienen pre-poblados.
      </p>

      {!collapsed && (
        <>
          {/* Lista */}
          <div className="space-y-3">
            {ordenados.length === 0 && (
              <div className="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-4 text-center">
                Aún no hay servicios. Usa "Agregar servicio" o
                pre-pobla desde un tipo del catálogo.
              </div>
            )}

            {ordenados.map((s, idx) => (
              <div
                key={s.slug}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  s.habilitado
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-50 border-gray-100 opacity-70'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                  {s.imagenCard ? (
                    <img
                      src={s.imagenCard}
                      alt={s.titulo}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={20} className="text-gray-300" />
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm truncate">
                      {s.titulo || s.slug}
                    </span>
                    <code className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      /{s.slug}
                    </code>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {s.descripcionCorta || '(sin descripción corta)'}
                  </p>
                </div>
                {/* Acciones */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleHabilitado(s.slug)}
                    className={`p-2 rounded-lg ${
                      s.habilitado
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={s.habilitado ? 'Habilitado' : 'Oculto'}
                  >
                    {s.habilitado ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => moverServicio(s.slug, -1)}
                    disabled={idx === 0}
                    className="p-2 text-gray-500 hover:text-primary hover:bg-gray-50 rounded-lg disabled:opacity-30"
                    title="Mover arriba"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moverServicio(s.slug, 1)}
                    disabled={idx === ordenados.length - 1}
                    className="p-2 text-gray-500 hover:text-primary hover:bg-gray-50 rounded-lg disabled:opacity-30"
                    title="Mover abajo"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirEditor(s.slug)}
                    className="p-2 text-primary-medium hover:bg-primary-medium/10 rounded-lg"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminarServicio(s.slug)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Acciones globales */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={crearNuevoVacio}
              className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium px-3 py-2 transition"
            >
              <Plus className="w-4 h-4" /> Agregar servicio vacío
            </button>

            {tiposSinServicio.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">
                  Agregar para tipos sin página:
                </span>
                {tiposSinServicio.map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => crearDesdeTipo(tipo)}
                    className="inline-flex items-center gap-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg px-2.5 py-1.5 font-medium transition"
                  >
                    <Plus className="w-3 h-3" />
                    {tipo}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleGuardarTodo}
              disabled={saving}
              className={saveBtnClass}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar Servicios'}
            </button>
          </div>
        </>
      )}

      {/* Modal */}
      {editing && (
        <ServicioEditorModal
          servicio={editing.servicio}
          slugOriginal={editing.slug}
          todosLosSlugs={slugs}
          onSave={handleSaveModal}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
