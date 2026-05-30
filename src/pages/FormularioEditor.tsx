import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { obtenerFormulario, crearFormulario, actualizarFormulario, generarSlug } from '../services/formularios.service';
import { useEmpresas } from '../hooks/useFormularios';
import { FormularioServicio, CampoFormulario, TipoCampo, CAMPOS_ESTANDAR } from '../types/formularios';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import {
  Save, Eye, Copy, ArrowLeft, Plus, Trash2, Edit, ChevronUp, ChevronDown, GripVertical, Lock,
  Type, Hash, Mail, Phone, AlignLeft, ChevronDown as SelectIcon, CheckSquare, ToggleLeft,
  Calendar, MapPin, Camera, Paperclip, PenTool, Navigation,
} from 'lucide-react';
import toast from 'react-hot-toast';

const TIPO_ICON: Record<TipoCampo, React.ElementType> = {
  texto: Type, numero: Hash, email: Mail, telefono: Phone,
  textarea: AlignLeft, seleccion: SelectIcon, seleccion_multiple: CheckSquare,
  checkbox: ToggleLeft, fecha: Calendar, direccion: MapPin,
  foto: Camera, archivo: Paperclip, firma: PenTool, ubicacion: Navigation,
};

const TIPO_LABEL: Record<TipoCampo, string> = {
  texto: 'Texto', numero: 'Numero', email: 'Email', telefono: 'Telefono',
  textarea: 'Texto largo', seleccion: 'Seleccion', seleccion_multiple: 'Seleccion multiple',
  checkbox: 'Checkbox', fecha: 'Fecha', direccion: 'Direccion',
  foto: 'Foto', archivo: 'Archivo', firma: 'Firma', ubicacion: 'Ubicacion GPS',
};

const TODOS_TIPOS: TipoCampo[] = [
  'texto', 'numero', 'email', 'telefono', 'textarea', 'seleccion',
  'seleccion_multiple', 'checkbox', 'fecha', 'direccion', 'foto',
  'archivo', 'firma', 'ubicacion',
];

const TIPOS_SERVICIO = [
  { value: 'reparacion', label: 'Reparacion' },
  { value: 'instalacion', label: 'Instalacion' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'otro', label: 'Otro' },
] as const;

function campoVacio(): CampoFormulario {
  return {
    id: '',
    tipo: 'texto',
    etiqueta: '',
    placeholder: '',
    requerido: false,
    opciones: [],
    orden: 0,
  };
}

export default function FormularioEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';

  // General config state
  const [nombre, setNombre] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [tipoServicio, setTipoServicio] = useState<FormularioServicio['tipoServicio']>('reparacion');
  const [descripcion, setDescripcion] = useState('');
  const [slug, setSlug] = useState('');
  const [activo, setActivo] = useState(true);

  // Campos
  const [camposEstandar, setCamposEstandar] = useState<CampoFormulario[]>(
    CAMPOS_ESTANDAR.map(c => ({ ...c }))
  );
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoFormulario[]>([]);

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showCampoModal, setShowCampoModal] = useState(false);
  const [editingCampo, setEditingCampo] = useState<CampoFormulario | null>(null);
  const [campoForm, setCampoForm] = useState<CampoFormulario>(campoVacio());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { empresas, loading: loadingEmpresas } = useEmpresas(true);

  // Load existing formulario
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    obtenerFormulario(id!)
      .then(form => {
        if (cancelled || !form) {
          if (!form) {
            toast.error('Formulario no encontrado');
            navigate('/admin/formularios');
          }
          return;
        }
        setNombre(form.nombre);
        setEmpresaId(form.empresaId);
        setEmpresaNombre(form.empresaNombre);
        setTipoServicio(form.tipoServicio);
        setDescripcion(form.descripcion);
        setSlug(form.slug);
        setActivo(form.activo);
        setCamposEstandar(form.camposEstandar.length > 0 ? form.camposEstandar : CAMPOS_ESTANDAR.map(c => ({ ...c })));
        setCamposPersonalizados(form.camposPersonalizados);
      })
      .catch(() => {
        toast.error('Error al cargar el formulario');
        navigate('/admin/formularios');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, isNew, navigate]);

  // Auto-generate slug when empresa or nombre changes
  useEffect(() => {
    if (empresaNombre || nombre) {
      setSlug(generarSlug(empresaNombre, nombre));
    }
  }, [empresaNombre, nombre]);

  // Handle empresa selection
  const handleEmpresaChange = (newEmpresaId: string) => {
    setEmpresaId(newEmpresaId);
    const emp = empresas.find(e => e.id === newEmpresaId);
    setEmpresaNombre(emp?.nombre || '');
  };

  // All campos combined for preview
  const todosCampos = useMemo(() => {
    return [...camposEstandar, ...camposPersonalizados].sort((a, b) => a.orden - b.orden);
  }, [camposEstandar, camposPersonalizados]);

  // --- Campo CRUD ---
  const openNewCampo = () => {
    setEditingCampo(null);
    setCampoForm({
      ...campoVacio(),
      orden: camposPersonalizados.length + CAMPOS_ESTANDAR.length,
    });
    setShowCampoModal(true);
  };

  const openEditCampo = (campo: CampoFormulario) => {
    setEditingCampo(campo);
    setCampoForm({ ...campo, opciones: [...campo.opciones] });
    setShowCampoModal(true);
  };

  const saveCampo = () => {
    if (!campoForm.etiqueta.trim()) {
      toast.error('La etiqueta es requerida');
      return;
    }
    if ((campoForm.tipo === 'seleccion' || campoForm.tipo === 'seleccion_multiple') && campoForm.opciones.filter(o => o.trim()).length === 0) {
      toast.error('Agrega al menos una opcion');
      return;
    }

    const cleanedOpciones = campoForm.opciones.filter(o => o.trim());

    if (editingCampo) {
      setCamposPersonalizados(prev =>
        prev.map(c => c.id === editingCampo.id ? { ...campoForm, opciones: cleanedOpciones } : c)
      );
    } else {
      const nuevo: CampoFormulario = {
        ...campoForm,
        id: crypto.randomUUID(),
        opciones: cleanedOpciones,
        orden: camposPersonalizados.length + CAMPOS_ESTANDAR.length,
      };
      setCamposPersonalizados(prev => [...prev, nuevo]);
    }
    setShowCampoModal(false);
  };

  const removeCampo = (campoId: string) => {
    setCamposPersonalizados(prev => prev.filter(c => c.id !== campoId));
    setConfirmDelete(null);
  };

  const moveCampo = (index: number, direction: 'up' | 'down') => {
    setCamposPersonalizados(prev => {
      const arr = [...prev];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return arr;
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      return arr.map((c, i) => ({ ...c, orden: i + CAMPOS_ESTANDAR.length }));
    });
  };

  const toggleEmailRequerido = () => {
    setCamposEstandar(prev =>
      prev.map(c => c.id === 'email' ? { ...c, requerido: !c.requerido } : c)
    );
  };

  // --- Save ---
  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error('El nombre del formulario es requerido');
      return;
    }
    if (!empresaId) {
      toast.error('Selecciona una empresa aliada');
      return;
    }

    const finalSlug = slug.trim() || generarSlug(empresaNombre, nombre);

    const data: Omit<FormularioServicio, 'id' | 'createdAt' | 'updatedAt'> = {
      nombre: nombre.trim(),
      empresaId,
      empresaNombre,
      tipoServicio,
      descripcion: descripcion.trim(),
      slug: finalSlug,
      camposEstandar,
      camposPersonalizados: camposPersonalizados.map((c, i) => ({ ...c, orden: i + CAMPOS_ESTANDAR.length })),
      activo,
    };

    setSaving(true);
    try {
      if (isNew) {
        await crearFormulario(data);
        toast.success('Formulario creado exitosamente');
        navigate('/admin/formularios');
      } else {
        await actualizarFormulario(id!, data);
        toast.success('Formulario actualizado');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el formulario');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = () => {
    const link = `misterservicerd.com/f/${slug}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copiado al portapapeles');
  };

  // --- Loading ---
  if (loading) {
    return <LoadingSpinner fullPage text="Cargando formulario..." />;
  }

  // --- Preview renderer ---
  const renderPreviewField = (campo: CampoFormulario) => {
    const Icon = TIPO_ICON[campo.tipo];
    switch (campo.tipo) {
      case 'texto':
      case 'email':
      case 'telefono':
      case 'numero':
        return (
          <input
            type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'email' ? 'email' : campo.tipo === 'telefono' ? 'tel' : 'text'}
            placeholder={campo.placeholder}
            disabled
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50"
          />
        );
      case 'textarea':
        return (
          <textarea
            placeholder={campo.placeholder}
            disabled
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50 resize-none"
          />
        );
      case 'seleccion':
        return (
          <select disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50">
            <option>{campo.placeholder || 'Seleccionar...'}</option>
            {campo.opciones.map((op, i) => <option key={i}>{op}</option>)}
          </select>
        );
      case 'seleccion_multiple':
        return (
          <div className="space-y-1">
            {campo.opciones.map((op, i) => (
              <label key={i} className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" disabled className="rounded" />
                {op}
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" disabled className="rounded" />
            {campo.placeholder || campo.etiqueta}
          </label>
        );
      case 'fecha':
        return (
          <input type="date" disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50" />
        );
      case 'direccion':
        return (
          <div className="relative">
            <input
              placeholder={campo.placeholder || 'Direccion...'}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm text-gray-400 bg-gray-50"
            />
            <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" />
          </div>
        );
      case 'foto':
      case 'archivo':
        return (
          <div className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
            <Icon size={20} className="text-gray-300" />
            <span className="text-sm text-gray-400">
              {campo.tipo === 'foto' ? 'Tomar o subir foto' : 'Subir archivo'}
            </span>
          </div>
        );
      case 'firma':
        return (
          <div className="border border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 flex flex-col items-center gap-2">
            <PenTool size={24} className="text-gray-300" />
            <span className="text-sm text-gray-400">Firmar aqui</span>
          </div>
        );
      case 'ubicacion':
        return (
          <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-400">
            <Navigation size={16} />
            Capturar ubicacion
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f4f8]">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/admin/formularios')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              {isNew ? 'Nuevo Formulario' : `Editar: ${nombre}`}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showPreview ? 'bg-primary-medium text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Eye size={16} />
              <span className="hidden sm:inline">Vista Previa</span>
            </button>
            {!isNew && slug && (
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Copy size={16} />
                <span className="hidden sm:inline">Copiar Link</span>
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary-medium text-white hover:bg-[#164d8a] disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className={`flex flex-col ${showPreview ? 'lg:flex-row' : ''} gap-6`}>
          {/* Left column: Editor */}
          <div className={`space-y-6 ${showPreview ? 'lg:w-2/3' : 'w-full'}`}>
            {/* Section 2: General Config */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Configuracion General</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nombre */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del formulario <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="Ej: Reparacion de Lavadoras"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none"
                  />
                </div>

                {/* Empresa */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Empresa aliada <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={empresaId}
                    onChange={e => handleEmpresaChange(e.target.value)}
                    disabled={loadingEmpresas}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none"
                  >
                    <option value="">Seleccionar empresa...</option>
                    {empresas.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Tipo de servicio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de servicio</label>
                  <select
                    value={tipoServicio}
                    onChange={e => setTipoServicio(e.target.value as FormularioServicio['tipoServicio'])}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none"
                  >
                    {TIPOS_SERVICIO.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Descripcion */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
                  <textarea
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    placeholder="Breve descripcion del servicio..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none resize-none"
                  />
                </div>

                {/* Slug */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    placeholder="se-genera-automaticamente"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none font-mono"
                  />
                  {slug && (
                    <p className="mt-1 text-xs text-gray-500">
                      Link: <span className="font-medium text-primary-medium">misterservicerd.com/f/{slug}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 3: Campos Estandar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Campos Estandar</h2>
              <div className="space-y-2">
                {camposEstandar.map(campo => {
                  const Icon = TIPO_ICON[campo.tipo];
                  return (
                    <div
                      key={campo.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                    >
                      <Lock size={14} className="text-gray-400 shrink-0" />
                      <Icon size={16} className="text-gray-500 shrink-0" />
                      <span className="text-sm font-medium text-gray-700 flex-1">{campo.etiqueta}</span>
                      {campo.id === 'email' ? (
                        <button
                          onClick={toggleEmailRequerido}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                            campo.requerido
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {campo.requerido ? 'Requerido' : 'Opcional'}
                        </button>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          campo.requerido ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {campo.requerido ? 'Requerido' : 'Opcional'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Campos Personalizados */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Campos Personalizados</h2>
              {camposPersonalizados.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No hay campos personalizados. Agrega uno para empezar.
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {camposPersonalizados.map((campo, index) => {
                    const Icon = TIPO_ICON[campo.tipo];
                    return (
                      <div
                        key={campo.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 group"
                      >
                        <GripVertical size={16} className="text-gray-300 shrink-0" />
                        <Icon size={16} className="text-gray-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-700 block truncate">{campo.etiqueta}</span>
                          <span className="text-xs text-gray-400">{TIPO_LABEL[campo.tipo]}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          campo.requerido ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {campo.requerido ? 'Requerido' : 'Opcional'}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => moveCampo(index, 'up')}
                            disabled={index === 0}
                            className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
                          >
                            <ChevronUp size={14} className="text-gray-500" />
                          </button>
                          <button
                            onClick={() => moveCampo(index, 'down')}
                            disabled={index === camposPersonalizados.length - 1}
                            className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
                          >
                            <ChevronDown size={14} className="text-gray-500" />
                          </button>
                          <button
                            onClick={() => openEditCampo(campo)}
                            className="p-1 hover:bg-blue-100 rounded transition-colors"
                          >
                            <Edit size={14} className="text-primary-medium" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(campo.id)}
                            className="p-1 hover:bg-red-100 rounded transition-colors"
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                onClick={openNewCampo}
                className="flex items-center gap-2 w-full justify-center py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-primary-medium hover:text-primary-medium transition-colors"
              >
                <Plus size={16} />
                Agregar Campo
              </button>
            </div>
          </div>

          {/* Right column: Preview */}
          {showPreview && (
            <div className="lg:w-1/3">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:sticky lg:top-20">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Vista Previa</h2>
                <p className="text-xs text-gray-400 mb-4">Asi se vera el formulario para los clientes</p>
                <div className="space-y-4">
                  {todosCampos.map(campo => (
                    <div key={campo.id}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {campo.etiqueta}
                        {campo.requerido && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {renderPreviewField(campo)}
                    </div>
                  ))}
                </div>
                {todosCampos.length > 0 && (
                  <button
                    disabled
                    className="w-full mt-6 py-2.5 bg-primary-medium text-white rounded-lg text-sm font-medium opacity-60"
                  >
                    Enviar Solicitud
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Campo Modal */}
      <Modal
        isOpen={showCampoModal}
        onClose={() => setShowCampoModal(false)}
        title={editingCampo ? 'Editar Campo' : 'Agregar Campo'}
        size="md"
      >
        <div className="space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de campo</label>
            <select
              value={campoForm.tipo}
              onChange={e => setCampoForm({ ...campoForm, tipo: e.target.value as TipoCampo, opciones: [] })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none"
            >
              {TODOS_TIPOS.map(t => (
                <option key={t} value={t}>{TIPO_LABEL[t]}</option>
              ))}
            </select>
          </div>

          {/* Etiqueta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Etiqueta <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={campoForm.etiqueta}
              onChange={e => setCampoForm({ ...campoForm, etiqueta: e.target.value })}
              placeholder="Ej: Modelo del equipo"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none"
            />
          </div>

          {/* Placeholder */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Placeholder</label>
            <input
              type="text"
              value={campoForm.placeholder}
              onChange={e => setCampoForm({ ...campoForm, placeholder: e.target.value })}
              placeholder="Texto de ejemplo dentro del campo"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none"
            />
          </div>

          {/* Requerido */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={campoForm.requerido}
                onChange={e => setCampoForm({ ...campoForm, requerido: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-medium/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-medium"></div>
            </label>
            <span className="text-sm text-gray-700">Campo requerido</span>
          </div>

          {/* Opciones (solo para seleccion / seleccion_multiple) */}
          {(campoForm.tipo === 'seleccion' || campoForm.tipo === 'seleccion_multiple') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Opciones</label>
              <div className="space-y-2">
                {campoForm.opciones.map((op, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={op}
                      onChange={e => {
                        const updated = [...campoForm.opciones];
                        updated[i] = e.target.value;
                        setCampoForm({ ...campoForm, opciones: updated });
                      }}
                      placeholder={`Opcion ${i + 1}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-medium/20 focus:border-primary-medium outline-none"
                    />
                    <button
                      onClick={() => {
                        const updated = campoForm.opciones.filter((_, idx) => idx !== i);
                        setCampoForm({ ...campoForm, opciones: updated });
                      }}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setCampoForm({ ...campoForm, opciones: [...campoForm.opciones, ''] })}
                className="mt-2 flex items-center gap-1 text-sm text-primary-medium hover:text-[#164d8a] font-medium transition-colors"
              >
                <Plus size={14} />
                Agregar opcion
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={() => setShowCampoModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={saveCampo}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-medium rounded-lg hover:bg-[#164d8a] transition-colors"
            >
              {editingCampo ? 'Guardar Cambios' : 'Agregar Campo'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar campo"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-6">
          Estas seguro de que deseas eliminar este campo? Esta accion no se puede deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmDelete(null)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => confirmDelete && removeCampo(confirmDelete)}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </Modal>
    </div>
  );
}
