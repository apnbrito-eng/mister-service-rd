import { useState, useEffect } from 'react';
import {
  ConfigWeb,
  ConfigWhatsApp,
  ConfigHero,
  ConfigEstadisticas,
  ConfigContacto,
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
} from 'lucide-react';
import WhatsAppIcon from '../components/icons/WhatsAppIcon';
import ConfigFormularioAgendarSection from '../components/admin/ConfigFormularioAgendarSection';
import toast from 'react-hot-toast';

export default function ConfiguracionWeb() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigWeb>(CONFIG_WEB_DEFAULTS);

  // Section-level saving indicators
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [savingHero, setSavingHero] = useState(false);
  const [savingEstadisticas, setSavingEstadisticas] = useState(false);
  const [savingContacto, setSavingContacto] = useState(false);
  const [savingMarcas, setSavingMarcas] = useState(false);
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

  const handleHeroImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHero(true);
    try {
      const url = await subirImagenWeb(file, 'hero');
      updateHero({ imagenUrl: url });
      toast.success('Imagen subida correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al subir la imagen');
    } finally {
      setUploadingHero(false);
    }
  };

  const guardarHero = async () => {
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

        {/* Image upload */}
        <div>
          <label className={labelClass}>Imagen del Hero</label>
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
            {config.hero.imagenUrl && (
              <button
                type="button"
                onClick={() => updateHero({ imagenUrl: '' })}
                className="text-xs text-red-500 hover:text-red-700 transition"
              >
                Quitar imagen
              </button>
            )}
          </div>
          {config.hero.imagenUrl && (
            <div className="mt-3">
              <img
                src={config.hero.imagenUrl}
                alt="Hero preview"
                className="max-h-48 rounded-lg border border-gray-200 object-cover"
              />
            </div>
          )}
        </div>

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
    </div>
  );
}
