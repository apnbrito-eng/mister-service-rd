import { useState, useMemo } from 'react';
import { useSolicitudes, useEmpresas } from '../hooks/useFormularios';
import { actualizarEstadoSolicitud, convertirAOrden } from '../services/solicitudes.service';
import { SolicitudServicio, EstadoSolicitud } from '../types/formularios';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Inbox, Search, Filter, Eye, MessageCircle, FileText, CheckCircle, XCircle, ArrowRight, ExternalLink, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const ESTADO_BADGE: Record<EstadoSolicitud, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  revisada: 'bg-blue-100 text-blue-700',
  aprobada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
  convertida: 'bg-purple-100 text-purple-700',
};

const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente',
  revisada: 'Revisada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  convertida: 'Convertida',
};

const TABS: { label: string; value: EstadoSolicitud | 'todas' }[] = [
  { label: 'Todas', value: 'todas' },
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'Revisadas', value: 'revisada' },
  { label: 'Aprobadas', value: 'aprobada' },
  { label: 'Rechazadas', value: 'rechazada' },
  { label: 'Convertidas', value: 'convertida' },
];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.includes(ext));
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'hace unos segundos';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHr < 24) return `hace ${diffHr}h`;
  if (diffDay < 7) return `hace ${diffDay}d`;
  return date.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return digits;
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

export default function Solicitudes() {
  const { solicitudes, loading } = useSolicitudes();
  const { empresas, loading: loadingEmpresas } = useEmpresas();

  const [tabActivo, setTabActivo] = useState<EstadoSolicitud | 'todas'>('todas');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [selectedSolicitud, setSelectedSolicitud] = useState<SolicitudServicio | null>(null);
  const [modalEstado, setModalEstado] = useState<EstadoSolicitud>('pendiente');
  const [modalNotas, setModalNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  // Client-side filtering
  const solicitudesFiltradas = useMemo(() => {
    let result = solicitudes;

    if (tabActivo !== 'todas') {
      result = result.filter((s) => s.estado === tabActivo);
    }

    if (filtroEmpresa) {
      result = result.filter((s) => s.empresaId === filtroEmpresa);
    }

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      result = result.filter(
        (s) =>
          (s.datos.nombre && String(s.datos.nombre).toLowerCase().includes(q)) ||
          (s.datos.telefono && String(s.datos.telefono).toLowerCase().includes(q))
      );
    }

    return result;
  }, [solicitudes, tabActivo, filtroEmpresa, busqueda]);

  const pendientesCount = solicitudes.filter((s) => s.estado === 'pendiente').length;

  const openDetail = (sol: SolicitudServicio) => {
    setSelectedSolicitud(sol);
    setModalEstado(sol.estado);
    setModalNotas(sol.notas || '');
  };

  const closeDetail = () => {
    setSelectedSolicitud(null);
    setModalEstado('pendiente');
    setModalNotas('');
  };

  const handleGuardarCambios = async () => {
    if (!selectedSolicitud) return;
    setSaving(true);
    try {
      await actualizarEstadoSolicitud(selectedSolicitud.id, modalEstado, modalNotas);
      toast.success('Solicitud actualizada');
      // Update local reference
      setSelectedSolicitud({ ...selectedSolicitud, estado: modalEstado, notas: modalNotas });
    } catch (err) {
      console.error('Error actualizando solicitud:', err);
      toast.error('Error al actualizar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  const handleConvertir = async () => {
    if (!selectedSolicitud) return;
    setConverting(true);
    try {
      const datos = selectedSolicitud.datos;
      await convertirAOrden(selectedSolicitud.id, {
        clienteNombre: datos.nombre || '',
        clienteTelefono: datos.telefono || '',
        clienteDireccion: datos.direccion || '',
        equipoTipo: datos.tipo_equipo || datos.equipo || 'Sin especificar',
        equipoMarca: '',
        descripcionFalla: datos.falla || datos.descripcion || 'Solicitud de formulario',
        solicitudId: selectedSolicitud.id,
        empresaId: selectedSolicitud.empresaId,
        empresaNombre: selectedSolicitud.empresaNombre,
      });
      toast.success('Orden creada exitosamente');
      closeDetail();
    } catch (err) {
      console.error('Error convirtiendo solicitud:', err);
      toast.error('Error al convertir en orden');
    } finally {
      setConverting(false);
    }
  };

  const handleWhatsApp = () => {
    if (!selectedSolicitud) return;
    const phone = formatPhoneForWhatsApp(String(selectedSolicitud.datos.telefono || ''));
    window.open(`https://wa.me/${phone}`, '_blank');
  };

  const getArchivoForCampo = (campoId: string) => {
    return selectedSolicitud?.archivos.find((a) => a.campoId === campoId);
  };

  if (loading || loadingEmpresas) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-[#f0f4f8] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0f3460] rounded-xl">
            <Inbox size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Solicitudes</h1>
            <p className="text-sm text-gray-500">
              {solicitudes.length} total &middot; {pendientesCount} pendiente{pendientesCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTabActivo(tab.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tabActivo === tab.value
                  ? 'bg-[#0f3460] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Empresa + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
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

          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#0f3460]/20 focus:border-[#0f3460] outline-none transition-all text-sm text-gray-700"
            />
          </div>
        </div>
      </div>

      {/* List */}
      {solicitudesFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 text-gray-400">
          <Inbox size={48} strokeWidth={1.5} />
          <p className="mt-4 text-lg font-medium">No hay solicitudes</p>
          <p className="text-sm mt-1">Las solicitudes de los formularios aparecerán aquí</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {solicitudesFiltradas.map((sol) => {
            const fecha = sol.createdAt?.toDate ? sol.createdAt.toDate() : new Date();
            return (
              <div
                key={sol.id}
                onClick={() => openDetail(sol)}
                className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {sol.datos.nombre || 'Sin nombre'}
                      </h3>
                      <span className="text-sm text-gray-400">{sol.datos.telefono || ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {sol.empresaNombre}
                      </span>
                      <span className="text-xs text-gray-400">{sol.formularioNombre}</span>
                    </div>
                  </div>

                  {/* Right */}
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[sol.estado]}`}
                    >
                      {ESTADO_LABEL[sol.estado]}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(fecha)}</span>
                    <Eye size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedSolicitud}
        onClose={closeDetail}
        title="Detalle de Solicitud"
        size="xl"
      >
        {selectedSolicitud && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedSolicitud.datos.nombre || 'Sin nombre'}
                </h3>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE[selectedSolicitud.estado]}`}
                >
                  {ESTADO_LABEL[selectedSolicitud.estado]}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                <span>Tel: {selectedSolicitud.datos.telefono || 'N/A'}</span>
                <span>Empresa: {selectedSolicitud.empresaNombre}</span>
                <span>Formulario: {selectedSolicitud.formularioNombre}</span>
              </div>
              <p className="text-xs text-gray-400">
                Enviada:{' '}
                {selectedSolicitud.createdAt?.toDate
                  ? selectedSolicitud.createdAt.toDate().toLocaleString('es-DO', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Sin fecha'}
              </p>
              {selectedSolicitud.ordenId && (
                <p className="text-xs text-purple-600 font-medium">
                  Orden asociada: {selectedSolicitud.ordenId}
                </p>
              )}
            </div>

            {/* Data section */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileText size={16} />
                Datos del formulario
              </h4>
              <div className="grid gap-3">
                {Object.entries(selectedSolicitud.datos).map(([key, value]) => {
                  const archivo = getArchivoForCampo(key);
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

                  // If there's an archivo for this field
                  if (archivo) {
                    if (isImageUrl(archivo.url)) {
                      return (
                        <div key={key} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                          <a href={archivo.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={archivo.url}
                              alt={archivo.nombre || key}
                              className="max-w-xs rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        </div>
                      );
                    }
                    return (
                      <div key={key} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                        <a
                          href={archivo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-[#0f3460] hover:underline"
                        >
                          <Download size={14} />
                          {archivo.nombre || 'Descargar archivo'}
                        </a>
                      </div>
                    );
                  }

                  // If value looks like an archivo reference
                  if (typeof value === 'string' && value.startsWith('[archivo')) {
                    return (
                      <div key={key} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                        <p className="text-sm text-gray-400 italic">Archivo pendiente</p>
                      </div>
                    );
                  }

                  // Regular field
                  return (
                    <div key={key} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                      <p className="text-sm text-gray-900">{String(value || '—')}</p>
                    </div>
                  );
                })}

                {/* Firma */}
                {selectedSolicitud.archivos
                  .filter((a) => a.campoId === 'firma')
                  .map((firma) => (
                    <div key="firma" className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-2">Firma</p>
                      <img
                        src={firma.url}
                        alt="Firma"
                        className="max-w-xs rounded-lg border border-gray-200"
                      />
                    </div>
                  ))}

                {/* Archivos not linked to a datos key */}
                {selectedSolicitud.archivos
                  .filter(
                    (a) =>
                      a.campoId !== 'firma' &&
                      !Object.keys(selectedSolicitud.datos).includes(a.campoId)
                  )
                  .map((archivo) => {
                    const label = archivo.campoId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                    if (isImageUrl(archivo.url)) {
                      return (
                        <div key={archivo.campoId} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                          <a href={archivo.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={archivo.url}
                              alt={archivo.nombre || archivo.campoId}
                              className="max-w-xs rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        </div>
                      );
                    }
                    return (
                      <div key={archivo.campoId} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                        <a
                          href={archivo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-[#0f3460] hover:underline"
                        >
                          <Download size={14} />
                          {archivo.nombre || 'Descargar archivo'}
                        </a>
                      </div>
                    );
                  })}

                {/* Ubicacion */}
                {selectedSolicitud.ubicacion && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Ubicacion</p>
                    <a
                      href={`https://www.google.com/maps?q=${selectedSolicitud.ubicacion.lat},${selectedSolicitud.ubicacion.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-[#0f3460] hover:underline"
                    >
                      <ExternalLink size={14} />
                      {'\uD83D\uDCCD'} {selectedSolicitud.ubicacion.lat.toFixed(6)},{' '}
                      {selectedSolicitud.ubicacion.lng.toFixed(6)}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-100 pt-6 space-y-4">
              <h4 className="text-sm font-semibold text-gray-700">Acciones</h4>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                  <select
                    value={modalEstado}
                    onChange={(e) => setModalEstado(e.target.value as EstadoSolicitud)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#0f3460]/20 focus:border-[#0f3460] outline-none transition-all text-sm text-gray-700"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="revisada">Revisada</option>
                    <option value="aprobada">Aprobada</option>
                    <option value="rechazada">Rechazada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notas del admin</label>
                  <textarea
                    value={modalNotas}
                    onChange={(e) => setModalNotas(e.target.value)}
                    rows={2}
                    placeholder="Agregar notas internas..."
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#0f3460]/20 focus:border-[#0f3460] outline-none transition-all text-sm text-gray-700 resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleGuardarCambios}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#0f3460] text-white rounded-xl hover:bg-[#0d2d56] transition-colors font-medium text-sm disabled:opacity-50"
                >
                  <CheckCircle size={16} />
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>

                {(modalEstado === 'aprobada' || selectedSolicitud.estado === 'aprobada') &&
                  selectedSolicitud.estado !== 'convertida' && (
                    <button
                      onClick={handleConvertir}
                      disabled={converting}
                      className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium text-sm disabled:opacity-50"
                    >
                      <ArrowRight size={16} />
                      {converting ? 'Convirtiendo...' : 'Convertir en Orden'}
                    </button>
                  )}

                <button
                  onClick={handleWhatsApp}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium text-sm"
                >
                  <MessageCircle size={16} />
                  WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
