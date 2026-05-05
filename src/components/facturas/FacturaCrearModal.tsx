import { useState } from 'react';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../firebase/config';
import { EstadoFactura, ItemCotizacion, MetodoPago } from '../../types';
import { formatMoneda } from '../../utils';
import { siguienteNumeroFactura } from '../../services/contadores.service';
import Modal from '../Modal';
import FacturaItemsEditor from './FacturaItemsEditor';

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  link: 'Link',
  otro: 'Otro',
};

interface FormState {
  clienteNombre: string;
  ordenNumero: string;
  notas: string;
  metodoPago: MetodoPago | '';
  bancoDestino: string;
  items: ItemCotizacion[];
}

const INITIAL_FORM: FormState = {
  clienteNombre: '',
  ordenNumero: '',
  notas: '',
  metodoPago: '',
  bancoDestino: '',
  items: [{ descripcion: '', cantidad: 1, precio: 0 }],
};

interface FacturaCrearModalProps {
  open: boolean;
  onClose: () => void;
  /** Disparado luego de crear el conduce con éxito. Recibe el número emitido. */
  onCreated?: (numero: string) => void;
}

/**
 * Modal de creación de Conduces de Garantía (CG-####).
 *
 * C3a (split puro): este componente extrae la lógica de creación que
 * vivía inline en `Facturas.tsx`. NO se agregan features nuevas — el
 * comportamiento es idéntico al pre-split:
 *  - form local con cliente, orden, items, método de pago, notas
 *  - counter atómico vía `siguienteNumeroFactura`
 *  - strip de undefined antes de `addDoc`
 *  - origen: 'manual', tipoCierre: 'reparacion_completa'
 *
 * Selector de catálogo, vendedor por línea, modal Detalles, y resto
 * de features SIBS entran en C3b.
 *
 * Patrón "padre gordo, hijo presentacional": el padre (`Facturas.tsx`)
 * mantiene los `onSnapshot` de la lista; este hijo NO abre listeners
 * nuevos. Solo escribe (vía `addDoc`).
 */
export default function FacturaCrearModal({
  open,
  onClose,
  onCreated,
}: FacturaCrearModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const total = form.items.reduce(
    (sum, item) => sum + item.cantidad * item.precio,
    0,
  );

  const resetForm = () => setForm(INITIAL_FORM);

  const handleClose = () => {
    if (saving) return;
    onClose();
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clienteNombre.trim()) {
      toast.error('El nombre del cliente es requerido');
      return;
    }
    if (form.items.some(i => !i.descripcion.trim())) {
      toast.error('Completa la descripción de todos los items');
      return;
    }
    if (total <= 0) {
      toast.error('El total debe ser mayor a 0');
      return;
    }

    setSaving(true);
    try {
      // Counter oficial: emite `CG-####` con transacción atómica (mismo
      // counter que usa FacturacionPendiente.tsx, evita colisiones).
      const numero = await siguienteNumeroFactura();
      const docData: Record<string, unknown> = {
        numero,
        clienteNombre: form.clienteNombre.trim(),
        items: form.items,
        total,
        estado: 'emitida' as EstadoFactura,
        fechaEmision: Timestamp.now(),
        createdAt: Timestamp.now(),
        // Conduces manuales se asumen como reparación completa (no chequeo).
        tipoCierre: 'reparacion_completa',
        // Origen: distingue conduces creados manualmente desde /admin/facturas
        // de los emitidos automáticamente al cerrar una orden.
        origen: 'manual' as const,
      };
      if (form.ordenNumero.trim()) docData.ordenNumero = form.ordenNumero.trim();
      if (form.notas.trim()) docData.notas = form.notas.trim();
      if (form.metodoPago) docData.metodoPago = form.metodoPago;
      if (form.metodoPago === 'transferencia' && form.bancoDestino.trim()) {
        docData.bancoDestino = form.bancoDestino.trim();
      }
      // Strip undefined defensivo (Firestore rechaza undefined).
      const docLimpio = Object.fromEntries(
        Object.entries(docData).filter(([, v]) => v !== undefined),
      );
      await addDoc(collection(db, 'facturas'), docLimpio);
      toast.success(`Conduce ${numero} creado`);
      onCreated?.(numero);
      onClose();
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al crear el conduce de garantía');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Nuevo Conduce de Garantía"
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
            <input
              type="text"
              value={form.clienteNombre}
              onChange={e => setForm(f => ({ ...f, clienteNombre: e.target.value }))}
              placeholder="Nombre del cliente"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Orden de Servicio</label>
            <input
              type="text"
              value={form.ordenNumero}
              onChange={e => setForm(f => ({ ...f, ordenNumero: e.target.value }))}
              placeholder="Ej: OS-0001 (opcional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
        </div>

        {/* Items */}
        <div>
          <FacturaItemsEditor
            items={form.items}
            onItemsChange={items => setForm(f => ({ ...f, items }))}
            disabled={saving}
          />
          <div className="text-right mt-3 pt-3 border-t border-gray-100">
            <span className="text-lg font-bold text-[#0f3460]">Total: {formatMoneda(total)}</span>
          </div>
        </div>

        {/* Método de pago */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
            <select
              value={form.metodoPago}
              onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value as MetodoPago | '' }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            >
              <option value="">Sin especificar</option>
              {(Object.keys(METODO_PAGO_LABELS) as MetodoPago[]).map(m => (
                <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>
              ))}
            </select>
          </div>
          {form.metodoPago === 'transferencia' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Banco destino</label>
              <input
                type="text"
                value={form.bancoDestino}
                onChange={e => setForm(f => ({ ...f, bancoDestino: e.target.value }))}
                placeholder="Ej: Banreservas, BHD, Popular..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            rows={2}
            placeholder="Observaciones adicionales (opcional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {saving ? 'Guardando...' : 'Crear Factura'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
