import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Cliente } from '../../types';
import {
  buscarClientePorTelefono,
  buscarOCrearCliente,
  normalizarTelefono,
} from '../../services/clientes.service';
import { parseCliente } from '../../utils';
import { X, AlertCircle, Building2, User } from 'lucide-react';

interface ClienteNuevoDrawerProps {
  open: boolean;
  onClose: () => void;
  onClienteCreado: (cliente: Cliente) => void;
  /** Pre-relleno opcional del input nombre (cuando el autocomplete tipeó texto). */
  prefillNombre?: string;
  /** Pre-relleno opcional del input teléfono (cuando el autocomplete tipeó dígitos). */
  prefillTelefono?: string;
}

/**
 * Drawer reutilizable para crear un cliente sin salir del flujo de creación
 * de Conduce de Garantía.
 *
 * Comportamiento clave (decisiones C3b):
 *  - Default `tipo='particular'` (G4).
 *  - RNC y Razón Social siempre opcionales — la secretaria casi nunca los
 *    tiene a mano al momento de emitir.
 *  - Validación de duplicado por teléfono al onBlur (≥10 dígitos): si
 *    encuentra match, ofrece "Usar cliente existente" sin crear duplicado.
 *  - Reusa `buscarOCrearCliente` (extendido C3b para aceptar tipo/rnc/razonSocial).
 *  - Strip undefined defensivo en cualquier write.
 */
export default function ClienteNuevoDrawer({
  open,
  onClose,
  onClienteCreado,
  prefillNombre = '',
  prefillTelefono = '',
}: ClienteNuevoDrawerProps) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [tipo, setTipo] = useState<'particular' | 'b2b'>('particular');
  const [rnc, setRnc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicado, setDuplicado] = useState<Cliente | null>(null);
  const [verificandoDuplicado, setVerificandoDuplicado] = useState(false);

  // Re-inicializa estado cada vez que se abre el drawer.
  useEffect(() => {
    if (!open) return;
    setNombre(prefillNombre || '');
    setTelefono(prefillTelefono || '');
    setEmail('');
    setDireccion('');
    setReferencia('');
    setTipo('particular');
    setRnc('');
    setRazonSocial('');
    setDuplicado(null);
  }, [open, prefillNombre, prefillTelefono]);

  // Si el prefillTelefono ya tiene ≥10 dígitos al montar, validamos duplicado
  // de una para que la UI muestre el banner de inmediato (mejor UX cuando
  // la secretaria viene de tipear el teléfono en el autocomplete).
  useEffect(() => {
    if (!open) return;
    const telNorm = normalizarTelefono(prefillTelefono || '');
    if (telNorm.length < 10) return;
    let cancelado = false;
    setVerificandoDuplicado(true);
    buscarClientePorTelefono(telNorm)
      .then(res => {
        if (cancelado) return;
        if (res) setDuplicado(parseCliente(res.id, res.data as unknown as Record<string, unknown>));
      })
      .catch(err => console.warn('Error verificando duplicado al montar:', err))
      .finally(() => {
        if (!cancelado) setVerificandoDuplicado(false);
      });
    return () => { cancelado = true; };
  }, [open, prefillTelefono]);

  const handleTelefonoBlur = async () => {
    const telNorm = normalizarTelefono(telefono);
    if (telNorm.length < 10) {
      setDuplicado(null);
      return;
    }
    setVerificandoDuplicado(true);
    try {
      const res = await buscarClientePorTelefono(telNorm);
      setDuplicado(res ? parseCliente(res.id, res.data as unknown as Record<string, unknown>) : null);
    } catch (err) {
      console.warn('Error verificando duplicado:', err);
      setDuplicado(null);
    } finally {
      setVerificandoDuplicado(false);
    }
  };

  const usarClienteExistente = () => {
    if (!duplicado) return;
    onClienteCreado(duplicado);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    const telNorm = normalizarTelefono(telefono);
    if (telNorm.length < 10) {
      toast.error('Teléfono inválido (debe tener 10 dígitos RD)');
      return;
    }
    if (duplicado) {
      toast.error('Ya existe un cliente con ese teléfono. Usá el botón "Usar cliente existente".');
      return;
    }
    setSaving(true);
    try {
      const datos: {
        nombre: string;
        email?: string;
        direccion?: string;
        referenciaDireccion?: string;
        tipo: 'particular' | 'b2b';
        rnc?: string;
        razonSocial?: string;
      } = {
        nombre: nombre.trim(),
        tipo,
      };
      if (email.trim()) datos.email = email.trim();
      if (direccion.trim()) datos.direccion = direccion.trim();
      if (referencia.trim()) datos.referenciaDireccion = referencia.trim();
      if (tipo === 'b2b' && rnc.trim()) datos.rnc = rnc.trim();
      if (tipo === 'b2b' && razonSocial.trim()) datos.razonSocial = razonSocial.trim();

      const clienteId = await buscarOCrearCliente(telefono, datos);

      // Construimos un Cliente sintetizado con los datos que acabamos de
      // escribir (más rápido que re-leer Firestore; el listener real-time
      // del padre va a refrescar el estado en milisegundos de todos modos).
      const clienteCreado: Cliente = {
        id: clienteId,
        nombre: datos.nombre,
        telefono: telefono,
        telefonoNormalizado: telNorm,
        email: datos.email,
        direccion: datos.direccion || '',
        referenciaDireccion: datos.referenciaDireccion,
        tipo,
        rnc: datos.rnc,
        razonSocial: datos.razonSocial,
        createdAt: new Date(),
      };

      toast.success('Cliente creado');
      onClienteCreado(clienteCreado);
      onClose();
    } catch (err) {
      console.error('Error creando cliente:', err);
      toast.error('Error al crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => { if (!saving) onClose(); }}
      />
      {/* Drawer panel — slide-in desde la derecha */}
      <div className="relative ml-auto w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Nuevo cliente</h2>
          <button
            onClick={() => { if (!saving) onClose(); }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            disabled={saving}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Banner duplicado */}
          {duplicado && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900 mb-1">
                    Cliente ya existe: {duplicado.nombre}
                  </p>
                  <p className="text-xs text-amber-800 mb-2">
                    Hay un cliente registrado con ese teléfono. ¿Querés usarlo?
                  </p>
                  <button
                    type="button"
                    onClick={usarClienteExistente}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Usar cliente existente
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Nombre del cliente"
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono <span className="text-red-600">*</span>
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              onBlur={handleTelefonoBlur}
              placeholder="809-555-1234"
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
            {verificandoDuplicado && (
              <p className="text-[10px] text-gray-400 mt-1">Verificando duplicados...</p>
            )}
          </div>

          {/* Tipo de cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de cliente</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTipo('particular')}
                disabled={saving}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  tipo === 'particular'
                    ? 'bg-[#0f3460] text-white border-[#0f3460]'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <User size={14} />
                Particular
              </button>
              <button
                type="button"
                onClick={() => setTipo('b2b')}
                disabled={saving}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  tipo === 'b2b'
                    ? 'bg-[#0f3460] text-white border-[#0f3460]'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Building2 size={14} />
                B2B
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {tipo === 'b2b'
                ? 'B2B: empresa, taller aliado o distribuidor (default Mayoreo)'
                : 'Particular: cliente final, mostrador o domicilio (default Detalle)'}
            </p>
          </div>

          {/* Sección B2B (expandible) */}
          {tipo === 'b2b' && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-700">Datos B2B (opcional)</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">RNC</label>
                <input
                  type="text"
                  value={rnc}
                  onChange={e => setRnc(e.target.value)}
                  placeholder="Ej: 130123456 (opcional)"
                  disabled={saving}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Razón Social</label>
                <input
                  type="text"
                  value={razonSocial}
                  onChange={e => setRazonSocial(e.target.value)}
                  placeholder="Nombre legal de la empresa (opcional)"
                  disabled={saving}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="cliente@email.com (opcional)"
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              type="text"
              value={direccion}
              onChange={e => setDireccion(e.target.value)}
              placeholder="Calle, número, sector (opcional)"
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
          </div>

          {/* Referencia */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
            <input
              type="text"
              value={referencia}
              onChange={e => setReferencia(e.target.value)}
              placeholder="Ej: portón verde, al lado del colmado (opcional)"
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8] disabled:bg-gray-50"
            />
          </div>
        </form>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-100 bg-white">
          <button
            type="button"
            onClick={() => { if (!saving) onClose(); }}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !!duplicado}
            className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {saving ? 'Guardando...' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
