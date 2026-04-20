import { useEffect, useState } from 'react';
import { Building2, Plus, Edit, Trash2, Power, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Banco } from '../types';
import {
  suscribirBancos,
  crearBanco,
  actualizarBanco,
  eliminarBanco,
  seedBancosSiVacio,
} from '../services/bancos.service';
import { useApp } from '../context/AppContext';
import { puede } from '../utils/permisos';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

export default function Bancos() {
  const { userProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Banco | null>(null);
  const [nombre, setNombre] = useState('');
  const [orden, setOrden] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const puedeGestionar = puede(userProfile, 'bancosGestionar');

  useEffect(() => {
    // Seed inicial si está vacío
    seedBancosSiVacio().catch(err => console.warn('seed bancos:', err));
    const unsub = suscribirBancos(list => {
      setBancos(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const abrirNuevo = () => {
    setEditing(null);
    setNombre('');
    setOrden('');
    setShowModal(true);
  };

  const abrirEditar = (b: Banco) => {
    setEditing(b);
    setNombre(b.nombre);
    setOrden(typeof b.orden === 'number' ? b.orden : '');
    setShowModal(true);
  };

  const cerrar = () => {
    setShowModal(false);
    setEditing(null);
    setNombre('');
    setOrden('');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await actualizarBanco(editing.id, {
          nombre: nombre.trim(),
          orden: typeof orden === 'number' ? orden : undefined,
        });
        toast.success('Banco actualizado');
      } else {
        await crearBanco(nombre.trim(), typeof orden === 'number' ? orden : undefined);
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
            <Building2 size={20} className="text-[#0f3460]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#0f3460]">Bancos</h1>
            <p className="text-gray-500 text-sm">
              Destinos de transferencias que las operarias pueden seleccionar al registrar un pago.
            </p>
          </div>
        </div>
        {puedeGestionar && (
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-2 px-4 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium"
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
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-16">Orden</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Banco</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bancos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">
                    Aún no hay bancos registrados. Agrega el primero con el botón "Nuevo banco".
                  </td>
                </tr>
              )}
              {bancos.map(b => (
                <tr key={b.id} className={`hover:bg-gray-50 ${!b.activo ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-sm text-gray-600">{b.orden ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{b.nombre}</span>
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
        title={editing ? 'Editar banco' : 'Nuevo banco'}
        size="sm"
      >
        <form onSubmit={guardar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Banco Popular Dominicano"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Orden <span className="text-xs text-gray-400">(opcional, menor = primero)</span>
            </label>
            <input
              type="number"
              value={orden}
              onChange={e => setOrden(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="1, 2, 3..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
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
              className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear banco'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
