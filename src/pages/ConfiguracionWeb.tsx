import { useState, useEffect } from 'react';
import {
  ConfigWeb,
  ConfigWhatsApp,
  ConfigHero,
  ConfigEstadisticas,
  ConfigContacto,
  ConfigFeedbackNPS,
  NumeroWhatsApp,
  obtenerConfigWeb,
  guardarConfigWeb,
  subirImagenWeb,
  CONFIG_WEB_DEFAULTS,
} from '../services/configWeb.service';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  Globe,
  Image,
  BarChart3,
  Phone,
  Save,
  Plus,
  X,
  Trash2,
  Upload,
  Star,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import ConfigFormularioAgendarSection from '../components/admin/ConfigFormularioAgendarSection';
import toast from 'react-hot-toast';
import { comprimirImagen } from '../utils/imagen';

export default function ConfiguracionWeb() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigWeb>(CONFIG_WEB_DEFAULTS);

  // Section-level saving indicators
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [savingHero, setSavingHero] = useState(false);
  const [savingEstadisticas, setSavingEstadisticas] = useState(false);
  const [savingContacto, setSavingContacto] = useState(false);
  const [savingMarcas, setSavingMarcas] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);

  // New marca input
  const [nuevaMarca, setNuevaMarca] = useState('');

  useEffect(() => {
    const cargar = async () => {
      try {
        const data = await obtenerConfigWeb();
        setConfig(data);
      } catch (err) {
        console.error(err);
        toast.error('Error al cargar la configuración');
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, []);

  // ─── WhatsApp helpers ──────────────────────────────────

  const updateWhatsapp = (partial: Partial<ConfigWhatsApp>) => {
    setConfig((prev) => ({
      ...prev,
      whatsapp: { ...prev.whatsapp, ...partial },
    }));
  };

  const updateNumero = (index: number, partial: Partial<NumeroWhatsApp>) => {
    setConfig((prev) => {
      const numeros = [...prev.whatsapp.numeros];
      numeros[index] = { ...numeros[index], ...partial };
      return { ...prev, whatsapp: { ...prev.whatsapp, numeros } };
    });
  };

  const agregarNumero = () => {
    setConfig((prev) => ({
      ...prev,
      whatsapp: {
        ...prev.whatsapp,
        numeros: [
          ...prev.whatsapp.numeros,
          { numero: '', nombre: '', activo: true },
        ],
      },
    }));
  };

  const eliminarNumero = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      whatsapp: {
        ...prev.whatsapp,
        numeros: prev.whatsapp.numeros.filter((_, i) => i !== index),
      },
    }));
  };

  const guardarWhatsapp = async () => {
    setSavingWhatsapp(true);
    try {
      await guardarConfigWeb(config);
      toast.success('WhatsApp guardado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar WhatsApp');
    } finally {
      setSavingWhatsapp(false);
    }
  };

  // ─── Hero helpers ──────────────────────────────────────

  const updateHero = (partial: Partial<ConfigHero>) => {
    setConfig((prev) => ({
      ...prev,
      hero: { ...prev.hero, ...partial },
    }));
  };

  /**
   * Comprime y sube una foto a Storage como JPEG. Reusa el helper
   * `comprimirImagen` (mismo que el formulario público `/agendar`).
   * Retorna la URL pública o null si falla.
   */
  const comprimirYSubirHero = async (file: File): Promise<string | null> => {
    try {
      const blob = await comprimirImagen(file, {
        maxBytes: 1_000_000,
        maxDim: 1920,
      });
      const safeName = file.name.replace(/[^\w.-]/g, '_') || 'hero.jpg';
      const archivo = new File([blob], safeName, { type: 'image/jpeg' });
      const url = await subirImagenWeb(archivo, 'hero');
      return url;
    } catch (err) {
      console.error('Error subiendo imagen del hero:', err);
      return null;
    }
  };

  /**
   * Modo fija: reemplaza la imagen actual.
   */
  const handleHeroImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen');
      return;
    }
    setUploadingHero(true);
    const url = await comprimirYSubirHero(file);
    setUploadingHero(false);
    if (!url) {
      toast.error('Error al subir la imagen');
      return;
    }
    // Persistir en imagenFija (campo nuevo). imagenUrl queda intacto solo
    // por compat con docs viejos (parser lo migra en lectura).
    updateHero({ imagenFija: url });
    toast.success('Imagen subida correctamente');
  };

  /**
   * Modo carrusel: agrega una imagen al final de la lista.
   */
  const handleAgregarImagenCarrusel = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen');
      return;
    }
    const actuales = config.hero.imagenesCarrusel ?? [];
    if (actuales.length >= 6) {
      toast.error('Máximo 6 imágenes en el carrusel');
      return;
    }
    setUploadingHero(true);
    const url = await comprimirYSubirHero(file);
    setUploadingHero(false);
    if (!url) {
      toast.error('Error al subir la imagen');
      return;
    }
    updateHero({ imagenesCarrusel: [...actuales, url] });
    toast.success('Imagen agregada al carrusel');
  };

  const moverImagenCarrusel = (index: number, dir: -1 | 1) => {
    const actuales = config.hero.imagenesCarrusel ?? [];
    const target = index + dir;
    if (target < 0 || target >= actuales.length) return;
    const copia = [...actuales];
    [copia[index], copia[target]] = [copia[target], copia[index]];
    updateHero({ imagenesCarrusel: copia });
  };

  const eliminarImagenCarrusel = (index: number) => {
    const actuales = config.hero.imagenesCarrusel ?? [];
    updateHero({
      imagenesCarrusel: actuales.filter((_, i) => i !== index),
    });
  };

  const guardarHero = async () => {
    // Validación: modo carrusel requiere mínimo 2 imágenes
    const modo = config.hero.modo ?? 'fija';
    const imagenes = config.hero.imagenesCarrusel ?? [];
    if (modo === 'carrusel' && imagenes.length < 2) {
      toast.error('El modo carrusel requiere mínimo 2 imágenes');
      return;
    }
    setSavingHero(true);
    try {
      await guardarConfigWeb(config);
      toast.success('Hero guardado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar Hero');
    } finally {
      setSavingHero(false);
    }
  };

  // ─── Estadísticas helpers ──────────────────────────────

  const updateEstadistica = (
    key: 'experiencia' | 'servicios' | 'satisfaccion' | 'respuesta',
    field: 'valor' | 'etiqueta',
    value: string
  ) => {
    setConfig((prev) => ({
      ...prev,
      estadisticas: {
        ...prev.estadisticas,
        [key]: { ...prev.estadisticas[key], [field]: value },
      },
    }));
  };

  const guardarEstadisticas = async () => {
    setSavingEstadisticas(true);
    try {
      await guardarConfigWeb(config);
      toast.success('Estadísticas guardadas correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar estadísticas');
    } finally {
      setSavingEstadisticas(false);
    }
  };

  // ─── Contacto helpers ──────────────────────────────────

  const updateContacto = (partial: Partial<ConfigContacto>) => {
    setConfig((prev) => ({
      ...prev,
      contacto: { ...prev.contacto, ...partial },
    }));
  };

  const guardarContacto = async () => {
    setSavingContacto(true);
    try {
      await guardarConfigWeb(config);
      toast.success('Contacto guardado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar contacto');
    } finally {
      setSavingContacto(false);
    }
  };

  // ─── Marcas helpers ────────────────────────────────────

  const agregarMarca = () => {
    const marca = nuevaMarca.trim();
    if (!marca) return;
    if (config.marcas.includes(marca)) {
      toast.error('Esa marca ya existe');
      return;
    }
    setConfig((prev) => ({ ...prev, marcas: [...prev.marcas, marca] }));
    setNuevaMarca('');
  };

  const eliminarMarca = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      marcas: prev.marcas.filter((_, i) => i !== index),
    }));
  };

  const guardarMarcas = async () => {
    setSavingMarcas(true);
    try {
      await guardarConfigWeb(config);
      toast.success('Marcas guardadas correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar marcas');
    } finally {
      setSavingMarcas(false);
    }
  };

  // ─── Feedback NPS helpers ──────────────────────────────

  const updateFeedback = (partial: Partial<ConfigFeedbackNPS>) => {
    setConfig((prev) => ({
      ...prev,
      feedbackNPS: {
        habilitado: prev.feedbackNPS?.habilitado ?? true,
        ...prev.feedbackNPS,
        ...partial,
      },
    }));
  };

  const guardarFeedback = async () => {
    setSavingFeedback(true);
    try {
      await guardarConfigWeb(config);
      toast.success('Feedback NPS guardado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar Feedback NPS');
    } finally {
      setSavingFeedback(false);
    }
  };

  // ─── Wa.me preview ────────────────────────────────────

  const getPreviewUrl = () => {
    const activos = config.whatsapp.numeros.filter((n) => n.activo);
    if (activos.length === 0) return '—';
    const digits = activos[0].numero.replace(/\D/g, '');
    const intl = digits.length === 10 ? `1${digits}` : digits;
    return `https://wa.me/${intl}?text=${encodeURIComponent(config.whatsapp.mensajePredeterminado)}`;
  };

  // ─── Shared styles ────────────────────────────────────

  const inputClass =
    'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] focus:border-transparent transition';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
  const cardClass =
    'bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5';
  const saveBtnClass =
    'inline-flex items-center gap-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium px-5 py-2.5 transition disabled:opacity-50';

  // ─── Render ────────────────────────────────────────────

  if (loading) {
    return <LoadingSpinner fullPage text="Cargando configuración..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[#0f3460]/10 rounded-xl">
          <Globe className="w-6 h-6 text-[#0f3460]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460]">
            Configuración de Página Web
          </h1>
          <p className="text-sm text-gray-500">
            Administra el contenido de la página pública
          </p>
        </div>
      </div>

      {/* ────── Section 0: Formulario de Agendamiento ────── */}
      <ConfigFormularioAgendarSection />

      {/* ────── Section 1: WhatsApp ────── */}
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <WhatsAppIcon filled={true} size={20} />
          <h2 className="text-lg font-semibold text-gray-900">WhatsApp</h2>
        </div>

        {/* Numbers list */}
        <div className="space-y-3">
          {config.whatsapp.numeros.map((num, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Número</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={num.numero}
                    onChange={(e) =>
                      updateNumero(idx, { numero: e.target.value })
                    }
                    placeholder="8291234567"
                  />
                </div>
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={num.nombre}
                    onChange={(e) =>
                      updateNumero(idx, { nombre: e.target.value })
                    }
                    placeholder="Línea principal"
                  />
                </div>
              </div>

              {/* Toggle activo */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">Activo</span>
                <button
                  type="button"
                  onClick={() => updateNumero(idx, { activo: !num.activo })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    num.activo ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      num.activo ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Delete */}
              <button
                type="button"
                onClick={() => eliminarNumero(idx)}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                title="Eliminar número"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={agregarNumero}
          className="inline-flex items-center gap-1.5 text-sm text-[#1a5fa8] hover:text-[#0f3460] font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Agregar número
        </button>

        {/* Rotación */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">
            Rotación de números
          </label>
          <button
            type="button"
            onClick={() => updateWhatsapp({ rotacion: !config.whatsapp.rotacion })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              config.whatsapp.rotacion ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                config.whatsapp.rotacion ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Mensaje predeterminado */}
        <div>
          <label className={labelClass}>Mensaje predeterminado</label>
          <input
            type="text"
            className={inputClass}
            value={config.whatsapp.mensajePredeterminado}
            onChange={(e) =>
              updateWhatsapp({ mensajePredeterminado: e.target.value })
            }
            placeholder="Hola, necesito un servicio"
          />
        </div>

        {/* Preview */}
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs font-medium text-green-700 mb-1">
            Vista previa del enlace
          </p>
          <p className="text-xs text-green-800 break-all font-mono">
            {getPreviewUrl()}
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardarWhatsapp}
            disabled={savingWhatsapp}
            className={saveBtnClass}
          >
            <Save className="w-4 h-4" />
            {savingWhatsapp ? 'Guardando...' : 'Guardar WhatsApp'}
          </button>
        </div>
      </div>

      {/* ────── Section 2: Hero ────── */}
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Image className="w-5 h-5 text-[#1a5fa8]" />
          <h2 className="text-lg font-semibold text-gray-900">Sección Hero</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Título</label>
            <input
              type="text"
              className={inputClass}
              value={config.hero.titulo}
              onChange={(e) => updateHero({ titulo: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Título destacado</label>
            <input
              type="text"
              className={inputClass}
              value={config.hero.tituloDestacado}
              onChange={(e) => updateHero({ tituloDestacado: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Subtítulo</label>
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={config.hero.subtitulo}
            onChange={(e) => updateHero({ subtitulo: e.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>Badge</label>
          <input
            type="text"
            className={inputClass}
            value={config.hero.badge}
            onChange={(e) => updateHero({ badge: e.target.value })}
          />
        </div>

        {/* ── Modo de visualización (fija | carrusel) ── */}
        <div className="border-t border-gray-100 pt-5">
          <label className={labelClass}>Modo de visualización del fondo</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {(
              [
                { value: 'fija' as const, label: 'Imagen fija' },
                { value: 'carrusel' as const, label: 'Carrusel rotativo' },
              ] as const
            ).map(({ value, label }) => {
              const activo = (config.hero.modo ?? 'fija') === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateHero({ modo: value })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    activo
                      ? 'bg-[#0f3460] text-white border-[#0f3460]'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1a5fa8]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Si no subes ninguna imagen, el hero conserva el fondo degradado actual.
          </p>
        </div>

        {/* ── Modo: imagen fija ── */}
        {(config.hero.modo ?? 'fija') === 'fija' && (
          <div>
            <label className={labelClass}>Imagen fija del hero</label>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium px-4 py-2.5 transition">
                <Upload className="w-4 h-4" />
                {uploadingHero ? 'Subiendo...' : 'Seleccionar imagen'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleHeroImage}
                  disabled={uploadingHero}
                />
              </label>
              {config.hero.imagenFija && (
                <button
                  type="button"
                  onClick={() => updateHero({ imagenFija: '' })}
                  className="text-xs text-red-500 hover:text-red-700 transition"
                >
                  Quitar imagen
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Mejor calidad: 1920x1080 px, formato JPG. Se comprime automáticamente a máximo 1MB.
            </p>
            {config.hero.imagenFija && (
              <div className="mt-3">
                <img
                  src={config.hero.imagenFija}
                  alt="Hero preview"
                  className="max-h-48 rounded-lg border border-gray-200 object-cover"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Modo: carrusel ── */}
        {(config.hero.modo ?? 'fija') === 'carrusel' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                Imágenes del carrusel ({(config.hero.imagenesCarrusel ?? []).length} / 6)
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                Mínimo 2, máximo 6 imágenes. Recomendado 1920x1080 px JPG. Cada una se comprime a máximo 1MB.
              </p>

              {(config.hero.imagenesCarrusel ?? []).length === 0 && (
                <div className="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-4 text-center">
                  Aún no has agregado imágenes al carrusel.
                </div>
              )}

              <ul className="space-y-2">
                {(config.hero.imagenesCarrusel ?? []).map((url, idx) => (
                  <li
                    key={`${idx}-${url}`}
                    className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <img
                      src={url}
                      alt={`Imagen ${idx + 1}`}
                      className="w-20 h-14 object-cover rounded border border-gray-200 flex-shrink-0"
                    />
                    <div className="flex-1 text-xs text-gray-500 truncate font-mono">
                      Imagen {idx + 1}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moverImagenCarrusel(idx, -1)}
                        disabled={idx === 0}
                        title="Mover arriba"
                        className="p-1.5 text-gray-500 hover:text-[#0f3460] hover:bg-white rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moverImagenCarrusel(idx, 1)}
                        disabled={
                          idx === (config.hero.imagenesCarrusel ?? []).length - 1
                        }
                        title="Mover abajo"
                        className="p-1.5 text-gray-500 hover:text-[#0f3460] hover:bg-white rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarImagenCarrusel(idx)}
                        title="Eliminar imagen"
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-white rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {(config.hero.imagenesCarrusel ?? []).length < 6 && (
                <label className="mt-3 inline-flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium px-4 py-2.5 transition">
                  <Plus className="w-4 h-4" />
                  {uploadingHero ? 'Subiendo...' : 'Agregar imagen'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAgregarImagenCarrusel}
                    disabled={uploadingHero}
                  />
                </label>
              )}
            </div>

            {/* Intervalo */}
            <div>
              <label className={labelClass}>
                Intervalo entre imágenes:{' '}
                <span className="text-[#0f3460] font-semibold">
                  {config.hero.intervaloCarrusel ?? 3} segundos
                </span>
              </label>
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={config.hero.intervaloCarrusel ?? 3}
                onChange={(e) =>
                  updateHero({ intervaloCarrusel: Number(e.target.value) })
                }
                className="w-full max-w-md accent-[#0f3460]"
              />
              <div className="flex justify-between text-[11px] text-gray-400 max-w-md">
                <span>2s</span>
                <span>10s</span>
              </div>
            </div>

            {/* Pausar en hover */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">
                Pausar cuando el cursor está encima
              </label>
              <button
                type="button"
                onClick={() =>
                  updateHero({
                    pausarEnHover: !(config.hero.pausarEnHover ?? true),
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  (config.hero.pausarEnHover ?? true) ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    (config.hero.pausarEnHover ?? true) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardarHero}
            disabled={savingHero}
            className={saveBtnClass}
          >
            <Save className="w-4 h-4" />
            {savingHero ? 'Guardando...' : 'Guardar Hero'}
          </button>
        </div>
      </div>

      {/* ────── Section 3: Estadísticas ────── */}
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">Estadísticas</h2>
        </div>

        <div className="space-y-3">
          {(
            [
              { key: 'experiencia' as const, label: 'Experiencia' },
              { key: 'servicios' as const, label: 'Servicios' },
              { key: 'satisfaccion' as const, label: 'Satisfacción' },
              { key: 'respuesta' as const, label: 'Respuesta' },
            ] as const
          ).map(({ key, label }) => (
            <div
              key={key}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
            >
              <div className="sm:col-span-1">
                <label className={labelClass}>{label} - Valor</label>
                <input
                  type="text"
                  className={inputClass}
                  value={config.estadisticas[key].valor}
                  onChange={(e) =>
                    updateEstadistica(key, 'valor', e.target.value)
                  }
                  placeholder="10+"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{label} - Etiqueta</label>
                <input
                  type="text"
                  className={inputClass}
                  value={config.estadisticas[key].etiqueta}
                  onChange={(e) =>
                    updateEstadistica(key, 'etiqueta', e.target.value)
                  }
                  placeholder="Años de experiencia"
                />
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className={labelClass}>Rating</label>
          <input
            type="text"
            className={`${inputClass} max-w-[120px]`}
            value={config.estadisticas.rating}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                estadisticas: { ...prev.estadisticas, rating: e.target.value },
              }))
            }
            placeholder="4.9"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardarEstadisticas}
            disabled={savingEstadisticas}
            className={saveBtnClass}
          >
            <Save className="w-4 h-4" />
            {savingEstadisticas ? 'Guardando...' : 'Guardar Estadísticas'}
          </button>
        </div>
      </div>

      {/* ────── Section 4: Contacto ────── */}
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Contacto</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Teléfono</label>
            <input
              type="text"
              className={inputClass}
              value={config.contacto.telefono}
              onChange={(e) => updateContacto({ telefono: e.target.value })}
              placeholder="(829) 389-7474"
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={config.contacto.email}
              onChange={(e) => updateContacto({ email: e.target.value })}
              placeholder="info@misterservicerd.com"
            />
          </div>
          <div>
            <label className={labelClass}>Dirección</label>
            <input
              type="text"
              className={inputClass}
              value={config.contacto.direccion}
              onChange={(e) => updateContacto({ direccion: e.target.value })}
              placeholder="Santo Domingo, República Dominicana"
            />
          </div>
          <div>
            <label className={labelClass}>Horario</label>
            <input
              type="text"
              className={inputClass}
              value={config.contacto.horario}
              onChange={(e) => updateContacto({ horario: e.target.value })}
              placeholder="Lun - Sáb: 8:00 AM - 6:00 PM"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardarContacto}
            disabled={savingContacto}
            className={saveBtnClass}
          >
            <Save className="w-4 h-4" />
            {savingContacto ? 'Guardando...' : 'Guardar Contacto'}
          </button>
        </div>
      </div>

      {/* ────── Section 5: Marcas ────── */}
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-[#0f3460]" />
          <h2 className="text-lg font-semibold text-gray-900">Marcas</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {config.marcas.map((marca, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              {marca}
              <button
                type="button"
                onClick={() => eliminarMarca(idx)}
                className="text-gray-400 hover:text-red-500 transition"
                title="Eliminar marca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={labelClass}>Nueva marca</label>
            <input
              type="text"
              className={inputClass}
              value={nuevaMarca}
              onChange={(e) => setNuevaMarca(e.target.value)}
              placeholder="Nombre de la marca"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregarMarca();
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={agregarMarca}
            className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium px-4 py-2.5 transition"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardarMarcas}
            disabled={savingMarcas}
            className={saveBtnClass}
          >
            <Save className="w-4 h-4" />
            {savingMarcas ? 'Guardando...' : 'Guardar Marcas'}
          </button>
        </div>
      </div>

      {/* ────── Section 6: Feedback NPS ────── */}
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Feedback NPS de órdenes</h2>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          Cuando una orden se cierra, el cliente entra a su link de tracking y ve una pregunta NPS (0-10).
          Detractores reciben un canal directo a un coordinador; promotores reciben un enlace a Google Reviews.
        </p>

        {/* Habilitado */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">
            Habilitar feedback en /tracking
          </label>
          <button
            type="button"
            onClick={() =>
              updateFeedback({ habilitado: !(config.feedbackNPS?.habilitado ?? true) })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              config.feedbackNPS?.habilitado !== false ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                config.feedbackNPS?.habilitado !== false ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div>
          <label className={labelClass}>URL de reseñas de Google</label>
          <input
            type="url"
            className={inputClass}
            value={config.feedbackNPS?.googleReviewsUrl || ''}
            onChange={(e) => updateFeedback({ googleReviewsUrl: e.target.value })}
            placeholder="https://g.page/r/CXXX..."
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Cuando un cliente da NPS 9-10, verá un botón para dejarte reseña en este enlace.
          </p>
        </div>

        <div>
          <label className={labelClass}>Mensaje WhatsApp para detractores</label>
          <textarea
            className={`${inputClass} min-h-[70px] resize-y`}
            value={config.feedbackNPS?.mensajeWhatsAppDetractor || ''}
            onChange={(e) =>
              updateFeedback({ mensajeWhatsAppDetractor: e.target.value })
            }
            placeholder="Hola, tuve un servicio recientemente y quiero compartirles mi experiencia."
          />
        </div>

        <div>
          <label className={labelClass}>Mensaje de agradecimiento</label>
          <textarea
            className={`${inputClass} min-h-[70px] resize-y`}
            value={config.feedbackNPS?.mensajeAgradecimiento || ''}
            onChange={(e) => updateFeedback({ mensajeAgradecimiento: e.target.value })}
            placeholder="Gracias por tu feedback. Cada respuesta nos ayuda a mejorar."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={guardarFeedback}
            disabled={savingFeedback}
            className={saveBtnClass}
          >
            <Save className="w-4 h-4" />
            {savingFeedback ? 'Guardando...' : 'Guardar Feedback NPS'}
          </button>
        </div>
      </div>
    </div>
  );
}
