import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormularios, useEmpresas } from '../hooks/useFormularios';
import { toggleFormulario } from '../services/formularios.service';
import { FormularioServicio } from '../types/formularios';
import LoadingSpinner from '../components/LoadingSpinner';
import { Plus, FileText, Copy, Power, ExternalLink, ChevronRight, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

const TIPO_BADGE: Record<FormularioServicio['tipoServicio'], string> = {
  reparacion: 'bg-blue-100 text-blue-700',
  instalacion: 'bg-green-100 text-green-700',
  mantenimiento: 'bg-orange-100 text-orange-700',
  otro: 'bg-gray-100 text-gray-700',
};

const TIPO_LABEL: Record<FormularioServicio['tipoServicio'], string> = {
  reparacion: 'Reparación',
  instalacion: 'Instalación',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
};

export default function Formularios() {
  const navigate = useNavigate();
  const [filtroEmpresa, setFiltroEmpresa] = useState<string | undefined>(undefined);
  const { formularios, loading } = useFormularios(filtroEmpresa);
  const { empresas, loading: loadingEmpresas } = useEmpresas();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggle = async (e: React.MouseEvent, form: FormularioServicio) => {
    e.stopPropagation();
    setTogglingId(form.id);
    try {
      await toggleFormulario(form.id, !form.activo);
      toast.success(form.activo ? 'Formulario desactivado' : 'Formulario activado');
      window.location.reload();
    } catch (err) {
      console.error('Error toggling formulario:', err);
      toast.error('Error al cambiar el estado');
    } finally {
      setTogglingId(null);
    }
  };

  const handleCopyLink = (e: React.MouseEvent, slug: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Link copiado');
    });
  };

  if (loading || loadingEmpresas) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-[#f0f4f8] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0f3460] rounded-xl">
            <FileText size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Formularios de Servicio</h1>
            <p className="text-sm text-gray-500">
              {formularios.length} formulario{formularios.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/admin/formularios/nuevo')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0f3460] text-white rounded-xl hover:bg-[#0d2d56] transition-colors font-medium text-sm"
        >
          <Plus size={18} />
          Nuevo Formulario
        </button>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={filtroEmpresa ?? ''}
            onChange={(e) => setFiltroEmpresa(e.target.value || undefined)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#0f3460]/20 focus:border-[#0f3460] outline-none transition-all text-sm text-gray-700"
          >
            <option value="">Todas las empresas</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      {formularios.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 text-gray-400">
          <FileText size={48} strokeWidth={1.5} />
          <p className="mt-4 text-lg font-medium">No hay formularios</p>
          <p className="text-sm mt-1">Crea el primer formulario de servicio para comenzar</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {formularios.map((form) => (
            <div
              key={form.id}
              onClick={() => navigate(`/admin/formularios/${form.id}`)}
              className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                {/* Left content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{form.nombre}</h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TIPO_BADGE[form.tipoServicio]}`}
                    >
                      {TIPO_LABEL[form.tipoServicio]}
                    </span>
                    {form.activo ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-500 mb-2">{form.empresaNombre}</p>

                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{form.camposPersonalizados.length} campo{form.camposPersonalizados.length !== 1 ? 's' : ''} personalizado{form.camposPersonalizados.length !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-1.5">
                      <ExternalLink size={12} />
                      <span className="text-gray-500">misterservicerd.com/f/{form.slug}</span>
                    </div>
                  </div>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={(e) => handleCopyLink(e, form.slug)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                    title="Copiar link público"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={(e) => handleToggle(e, form)}
                    disabled={togglingId === form.id}
                    className={`p-2 rounded-lg transition-colors ${
                      form.activo
                        ? 'hover:bg-red-50 text-gray-400 hover:text-red-600'
                        : 'hover:bg-green-50 text-gray-400 hover:text-green-600'
                    } disabled:opacity-50`}
                    title={form.activo ? 'Desactivar' : 'Activar'}
                  >
                    <Power size={16} />
                  </button>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
