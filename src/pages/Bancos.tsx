import { useEffect, useState } from 'react';
import { Building2, Plus, Edit, Trash2, Power, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Banco } from '../types';
import {
  suscribirBancos,
  crearBanco,
  actualizarBanco,
  eliminarBanco,
  migrarBancosGenericosAReales,
} from '../services/bancos.service';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

interface FormState {
  nombre: string;
  numeroCuenta: string;
  tipoCuenta: 'ahorro' | 'corriente';
  titular: string;
  rnc: string;
  cedula: string;
  emailComprobante: string;
  orden: number | '';
}

const initialForm: FormState = {
  nombre: '',
  numeroCuenta: '',
  tipoCuenta: 'ahorro',
  titular: '',
  rnc: '',
  cedula: '',
  emailComprobante: '',
  orden: '',
};

export default function Bancos() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Banco | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);

  const puedeGestionar = puede(userProfile, 'bancosGestionar');

  useEffect(() => {
    // Migración: si los bancos son los genéricos viejos, reemplazarlos por los reales
    migrarBancosGenericosAReales()
      .then(n => {
        if (n > 0) toast.success(`Bancos actualizados (${n})`);
      })
      .catch(err => console.warn('migración bancos:', err));

    const unsub = suscribirBancos(list => {
      setBancos(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const abrirNuevo = () => {
    setEditing(null);
    setForm(initialForm);
    setShowModal(true);
  };

  const abrirEditar = (b: Banco) => {
    setEditing(b);
    setForm({
      nombre: b.nombre,
      numeroCuenta: b.numeroCuenta || '',
      tipoCuenta: b.tipoCuenta || 'ahorro',
      titular: b.titular || '',
      rnc: b.rnc || '',
      cedula: b.cedula || '',
      emailComprobante: b.emailComprobante || '',
      orden: typeof b.orden === 'number' ? b.orden : '',
    });
    setShowModal(true);
  };

  const cerrar = () => {
    setShowModal(false);
    setEditing(null);
    setForm(initialForm);
  };

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }));
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        numeroCuenta: form.numeroCuenta.trim() || undefined,
        tipoCuenta: form.tipoCuenta,
        titular: form.titular.trim() || undefined,
        rnc: form.rnc.trim() || undefined,
        cedula: form.cedula.trim() || undefined,
        emailComprobante: form.emailComprobante.trim() || undefined,
        orden: typeof form.orden === 'number' ? form.orden : undefined,
      };
      if (editing) {
        await actualizarBanco(editing.id, payload);
        toast.success('Banco actualizado');
      } else {
        await crearBanco({ ...payload, nombre: payload.nombre });
        toast.success('Banco creado');
      }
      cerrar();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar banco');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (b: Banco) => {
    try {
      await actualizarBanco(b.id, { activo: !b.activo });
      toast.success(b.activo ? 'Desactivado' : 'Activado');
    } catch {
      toast.error('Error');
    }
  };

  const eliminar = async (b: Banco) => {
    if (!confirm(`¿Eliminar "${b.nombre}"? Esto no borra los pagos ya registrados con este banco.`)) return;
    try {
      await eliminarBanco(b.id);
      toast.success('Banco eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando bancos..." />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Building2 size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Bancos</h1>
            <p className="text-gray-500 text-sm">
              Cuentas para que los clientes hagan transferencias. Las operarias las verán al registrar un pago.
            </p>
          </div>
        </div>
        {puedeGestionar && (
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Nuevo banco
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-16">#</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Banco</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Cuenta</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Titular</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bancos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    Aún no hay bancos. Agrega el primero con "Nuevo banco".
                  </td>
                </tr>
              )}
              {bancos.map(b => (
                <tr key={b.id} className={`hover:bg-gray-50 ${!b.activo ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-sm text-gray-600">{b.orden ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{b.nombre}</div>
                    {b.tipoCuenta && (
                      <div className="text-[11px] text-gray-500 capitalize">Cuenta de {b.tipoCuenta}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                    {b.numeroCuenta || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">{b.titular || <span className="text-gray-400">—</span>}</div>
                    {(b.rnc || b.cedula) && (
                      <div className="text-[11px] text-gray-500">
                        {b.rnc ? `RNC ${b.rnc}` : `Cédula ${b.cedula}`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full w-fit ${
                        b.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {b.activo ? <Check size={12} /> : <X size={12} />}
                      {b.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {puedeGestionar && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => abrirEditar(b)}
                          title="Editar"
                          className="p-2 hover:bg-blue-50 rounded-lg text-blue-500"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => toggleActivo(b)}
                          title={b.activo ? 'Desactivar' : 'Activar'}
                          className={`p-2 rounded-lg ${
                            b.activo ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-500'
                          }`}
                        >
                          <Power size={14} />
                        </button>
                        <button
                          onClick={() => eliminar(b)}
                          title="Eliminar"
                          className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={cerrar}
        title={editing ? `Editar banco — ${editing.nombre}` : 'Nuevo banco'}
        size="md"
      >
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del banco *</label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => setF('nombre', e.target.value)}
                placeholder="Ej: BHD"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Número de cuenta</label>
              <input
                type="text"
                value={form.numeroCuenta}
                onChange={e => setF('numeroCuenta', e.target.value)}
                placeholder="27792170018"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de cuenta</label>
              <select
                value={form.tipoCuenta}
                onChange={e => setF('tipoCuenta', e.target.value as 'ahorro' | 'corriente')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
              >
                <option value="ahorro">Ahorro</option>
                <option value="corriente">Corriente</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Titular de la cuenta</label>
              <input
                type="text"
                value={form.titular}
                onChange={e => setF('titular', e.target.value)}
                placeholder="Jorge L. Brito  /  Fixman SRL"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                RNC <span className="text-gray-400">(empresas)</span>
              </label>
              <input
                type="text"
                value={form.rnc}
                onChange={e => setF('rnc', e.target.value)}
                placeholder="133-118191"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cédula <span className="text-gray-400">(personas)</span>
              </label>
              <input
                type="text"
                value={form.cedula}
                onChange={e => setF('cedula', e.target.value)}
                placeholder="229-0015616-1"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email comprobantes <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="email"
                value={form.emailComprobante}
                onChange={e => setF('emailComprobante', e.target.value)}
                placeholder="misterservicerd@gmail.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Orden <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="number"
                value={form.orden}
                onChange={e => setF('orden', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="1, 2, 3..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={cerrar}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-primary hover:bg-primary-medium text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear banco'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
