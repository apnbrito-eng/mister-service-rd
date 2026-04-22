import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useFormularioPublico } from '../../hooks/useFormularios';
import { crearSolicitud, subirArchivoSolicitud } from '../../services/solicitudes.service';
import CampoFormularioInput from '../../components/public/CampoFormulario';
import { CampoFormulario } from '../../types/formularios';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Wrench, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import WhatsAppIcon from '../../components/icons/WhatsAppIcon';
import toast from 'react-hot-toast';

export default function FormularioPublico() {
  const { slug } = useParams<{ slug: string }>();
  const { formulario, empresa, loading, error } = useFormularioPublico(slug || '');

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [solicitudRef, setSolicitudRef] = useState('');

  const formRef = useRef<HTMLFormElement>(null);

  // --- Loading state ---
  if (loading) {
    return <LoadingSpinner fullPage text="Cargando formulario..." />;
  }

  // --- Error state ---
  if (error || !formulario || !formulario.activo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Formulario no disponible</h1>
          <p className="text-gray-500 text-sm">
            El enlace que utilizó no es válido o el formulario fue desactivado.
          </p>
        </div>
      </div>
    );
  }

  // --- Success state ---
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 to-green-600 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            ✓ Solicitud enviada correctamente
          </h1>
          <p className="text-gray-500 mb-4">Nos pondremos en contacto pronto.</p>
          {solicitudRef && (
            <p className="text-sm text-gray-600 mb-6">
              Referencia: <span className="font-mono font-bold text-gray-800">{solicitudRef}</span>
            </p>
          )}
          {empresa?.contactoTelefono && (
            <a
              href={`https://wa.me/${empresa.contactoTelefono.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors"
            >
              <WhatsAppIcon filled={false} className="text-white" size={20} />
              Contactar por WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  // --- Merge and sort all campos ---
  const allCampos: CampoFormulario[] = [
    ...formulario.camposEstandar,
    ...formulario.camposPersonalizados,
  ].sort((a, b) => a.orden - b.orden);

  // --- Validation ---
  const validate = (): boolean => {
    const nuevosErrors: Record<string, string> = {};

    allCampos.forEach((campo) => {
      const val = formData[campo.id];

      if (campo.requerido) {
        if (
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0)
        ) {
          nuevosErrors[campo.id] = 'Este campo es obligatorio';
          return;
        }
      }

      if (campo.tipo === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
        nuevosErrors[campo.id] = 'Email inválido';
      }

      if (campo.tipo === 'telefono' && val && String(val).replace(/\D/g, '').length < 10) {
        nuevosErrors[campo.id] = 'Teléfono debe tener al menos 10 dígitos';
      }
    });

    if (Object.keys(nuevosErrors).length > 0) {
      setErrors(nuevosErrors);
      const firstErrorKey = Object.keys(nuevosErrors)[0];
      document
        .getElementById(`campo-${firstErrorKey}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }

    setErrors({});
    return true;
  };

  // --- Submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const archivos: { campoId: string; url: string; nombre: string }[] = [];

      // Upload files (foto, archivo, firma fields)
      for (const campo of allCampos) {
        const val = formData[campo.id];
        if (!val) continue;

        if ((campo.tipo === 'foto' || campo.tipo === 'archivo') && val instanceof File) {
          const tempId = `temp-${Date.now()}`;
          const url = await subirArchivoSolicitud(val, tempId, campo.id);
          archivos.push({ campoId: campo.id, url, nombre: val.name });
        }

        if (campo.tipo === 'firma' && val instanceof Blob) {
          const tempId = `temp-${Date.now()}`;
          const url = await subirArchivoSolicitud(val as File, tempId, campo.id);
          archivos.push({ campoId: campo.id, url, nombre: 'firma.png' });
        }
      }

      // Build datos (exclude File/Blob values, replace with marker)
      const datos: Record<string, any> = {};
      for (const campo of allCampos) {
        const val = formData[campo.id];
        if (val instanceof File || val instanceof Blob) {
          datos[campo.id] = '[archivo subido]';
        } else if (val !== undefined && val !== null && val !== '') {
          datos[campo.id] = val;
        }
      }

      const solicitudData: Parameters<typeof crearSolicitud>[0] = {
        formularioId: formulario.id,
        formularioNombre: formulario.nombre,
        empresaId: formulario.empresaId,
        empresaNombre: formulario.empresaNombre,
        datos,
        archivos,
        estado: 'pendiente',
        notas: '',
      };
      if (formData['ubicacion']) {
        solicitudData.ubicacion = formData['ubicacion'] as any;
      }
      const solicitudId = await crearSolicitud(solicitudData);

      setSolicitudRef(solicitudId.slice(-8).toUpperCase());
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error('Error al enviar. Intente de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Header (co-branding) */}
        <div className="flex items-center justify-between mb-6">
          {/* Left: Mister Service RD */}
          <div className="flex items-center gap-2">
            <Wrench className="w-6 h-6 text-blue-600" />
            <span className="text-lg font-bold text-gray-800">Mister Service RD</span>
          </div>

          {/* Right: Empresa logo or name */}
          {empresa && (
            <div className="flex items-center">
              {empresa.logoUrl ? (
                <img
                  src={empresa.logoUrl}
                  alt={empresa.nombre}
                  className="h-10 max-w-[140px] object-contain"
                />
              ) : (
                <span className="text-sm font-semibold text-gray-600">{empresa.nombre}</span>
              )}
            </div>
          )}
        </div>

        {/* Title and description */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{formulario.nombre}</h1>
          {formulario.descripcion && (
            <p className="text-gray-500 text-sm">{formulario.descripcion}</p>
          )}
        </div>

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            {allCampos.map((campo) => (
              <div key={campo.id} id={`campo-${campo.id}`}>
                <CampoFormularioInput
                  campo={campo}
                  value={formData[campo.id]}
                  onChange={(v) => setFormData({ ...formData, [campo.id]: v })}
                  error={errors[campo.id]}
                />
              </div>
            ))}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl w-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar Solicitud'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-xs text-gray-400 hover:text-gray-500 transition-colors"
          >
            Powered by Mister Service RD
          </a>
        </div>
      </div>
    </div>
  );
}
