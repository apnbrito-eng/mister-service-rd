import { useState } from 'react';
import { useEmpresas } from '../hooks/useFormularios';
import { crearEmpresa, actualizarEmpresa, eliminarEmpresa, subirLogoEmpresa } from '../services/empresasAliadas.service';
import { EmpresaAliada } from '../types/formularios';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { Plus, Building2, Edit, Power, Upload, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';

interface EmpresaForm {
  nombre: string;
  contactoNombre: string;
  contactoTelefono: string;
  contactoEmail: string;
}

const emptyForm: EmpresaForm = {
  nombre: '',
  contactoNombre: '',
  contactoTelefono: '',
  contactoEmail: '',
};

export default function EmpresasAliadas() {
  const { empresas, loading } = useEmpresas();
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<EmpresaAliada | null>(null);
  const [form, setForm] = useState<EmpresaForm>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingEmpresa(null);
    setForm(emptyForm);
    setLogoFile(null);
    setLogoPreview(null);
    setShowModal(true);
  };

  const openEdit = (empresa: EmpresaAliada) => {
    setEditingEmpresa(empresa);
    setForm({
      nombre: empresa.nombre,
      contactoNombre: empresa.contactoNombre,
      contactoTelefono: empresa.contactoTelefono,
      contactoEmail: empresa.contactoEmail,
    });
    setLogoFile(null);
    setLogoPreview(empresa.logoUrl || null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEmpresa(null);
    setForm(emptyForm);
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      if (editingEmpresa) {
        // Editing existing empresa
        let logoUrl = editingEmpresa.logoUrl;
        if (logoFile) {
          logoUrl = await subirLogoEmpresa(logoFile, editingEmpresa.id);
        }
        await actualizarEmpresa(editingEmpresa.id, {
          nombre: form.nombre.trim(),
          contactoNombre: form.contactoNombre.trim(),
          contactoTelefono: form.contactoTelefono.trim(),
          contactoEmail: form.contactoEmail.trim(),
          logoUrl,
        });
        toast.success('Empresa actualizada');
      } else {
        // Creating new empresa
        const id = await crearEmpresa({
          nombre: form.nombre.trim(),
          contactoNombre: form.contactoNombre.trim(),
          contactoTelefono: form.contactoTelefono.trim(),
          contactoEmail: form.contactoEmail.trim(),
          logoUrl: '',
          activa: true,
        });
        if (logoFile) {
          const logoUrl = await subirLogoEmpresa(logoFile, id);
          await actualizarEmpresa(id, { logoUrl });
        }
        toast.success('Empresa creada');
      }
      closeModal();
      // Reload page to refresh data from hook
      window.location.reload();
    } catch (err) {
      console.error('Error guardando empresa:', err);
      toast.error('Error al guardar la empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActiva = async (empresa: EmpresaAliada) => {
    setTogglingId(empresa.id);
    try {
      if (empresa.activa) {
        await eliminarEmpresa(empresa.id);
        toast.success('Empresa desactivada');
      } else {
        await actualizarEmpresa(empresa.id, { activa: true });
        toast.success('Empresa activada');
      }
      window.location.reload();
    } catch (err) {
      console.error('Error cambiando estado:', err);
      toast.error('Error al cambiar el estado');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-full bg-[#f0f4f8] p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 p-2 bg-primary rounded-xl">
            <Building2 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Empresas Aliadas</h1>
            <p className="text-sm text-gray-500">{empresas.length} empresa{empresas.length !== 1 ? 's' : ''} registrada{empresas.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-[#0d2d56] transition-colors font-medium text-sm"
        >
          <Plus size={18} />
          Nueva Empresa
        </button>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {empresas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Building2 size={48} strokeWidth={1.5} />
            <p className="mt-4 text-lg font-medium">No hay empresas registradas</p>
            <p className="text-sm mt-1">Crea la primera empresa aliada para comenzar</p>
          </div>
        ) : (
          <>
          <ul aria-label="Empresas Aliadas" className="lg:hidden divide-y divide-gray-100">
            {empresas.map((empresa) => (
              <li key={empresa.id} className="min-w-0 p-4">
                <div className="flex items-start gap-3">
                  {empresa.logoUrl ? <img src={empresa.logoUrl} alt={empresa.nombre} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100"><ImageIcon size={20} className="text-gray-400" /></div>}
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-base font-semibold text-gray-900">{empresa.nombre}</h2>
                    <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${empresa.activa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{empresa.activa ? 'Activa' : 'Inactiva'}</span>
                  </div>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div><dt className="text-xs text-gray-500">Contacto</dt><dd className="break-words text-gray-700">{empresa.contactoNombre || '-'}</dd>{empresa.contactoTelefono && <dd className="break-words text-gray-700">{empresa.contactoTelefono}</dd>}</div>
                  <div><dt className="text-xs text-gray-500">Email</dt><dd className="break-all text-gray-700">{empresa.contactoEmail || '-'}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => openEdit(empresa)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-100"><Edit size={16} />Editar</button>
                  <button type="button" onClick={() => handleToggleActiva(empresa)} disabled={togglingId === empresa.id}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-500 disabled:opacity-50 ${empresa.activa ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-green-50 hover:text-green-600'}`}><Power size={16} />{empresa.activa ? 'Desactivar' : 'Activar'}</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Logo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Nombre</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Contacto</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((empresa) => (
                  <tr key={empresa.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      {empresa.logoUrl ? (
                        <img
                          src={empresa.logoUrl}
                          alt={empresa.nombre}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <ImageIcon size={16} className="text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{empresa.nombre}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{empresa.contactoNombre || '-'}</div>
                      <div className="text-xs text-gray-500">{empresa.contactoTelefono || ''}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700">{empresa.contactoEmail || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      {empresa.activa ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(empresa)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                          title="Editar"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleActiva(empresa)}
                          disabled={togglingId === empresa.id}
                          className={`p-2 rounded-lg transition-colors ${
                            empresa.activa
                              ? 'hover:bg-red-50 text-gray-500 hover:text-red-600'
                              : 'hover:bg-green-50 text-gray-500 hover:text-green-600'
                          } disabled:opacity-50`}
                          title={empresa.activa ? 'Desactivar' : 'Activar'}
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Modal Create / Edit */}
      <Modal
        movimiento
        isOpen={showModal}
        onClose={closeModal}
        title={editingEmpresa ? 'Editar Empresa' : 'Nueva Empresa'}
      >
        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre de la empresa"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
            />
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Preview"
                  className="w-16 h-16 rounded-xl object-cover border border-gray-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-200 border-dashed flex items-center justify-center">
                  <ImageIcon size={24} className="text-gray-300" />
                </div>
              )}
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors text-sm text-gray-600">
                <Upload size={16} />
                Subir imagen
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Contacto Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de contacto</label>
            <input
              type="text"
              value={form.contactoNombre}
              onChange={(e) => setForm({ ...form, contactoNombre: e.target.value })}
              placeholder="Persona de contacto"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
            />
          </div>

          {/* Contacto Telefono */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefono de contacto</label>
            <input
              type="tel"
              value={form.contactoTelefono}
              onChange={(e) => setForm({ ...form, contactoTelefono: e.target.value })}
              placeholder="829-555-1234"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
            />
          </div>

          {/* Contacto Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email de contacto</label>
            <input
              type="email"
              value={form.contactoEmail}
              onChange={(e) => setForm({ ...form, contactoEmail: e.target.value })}
              placeholder="correo@empresa.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
            />
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-primary text-white rounded-xl hover:bg-[#0d2d56] transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : editingEmpresa ? 'Guardar Cambios' : 'Crear Empresa'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
