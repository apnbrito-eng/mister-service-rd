import { useState, useMemo } from 'react';
import Modal from '../Modal';
import { LiquidacionEmpleado, Usuario } from '../../types';
import { agregarDescuentoAdHoc } from '../../services/nomina.service';
import { crearPrestamo } from '../../services/prestamos.service';
import { formatMoneda } from '../../utils';
import { calcularQuincenaActual } from '../../utils/comisiones';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  liquidacionId: string;
  liquidacionQuincena: string;
  empleado: LiquidacionEmpleado;
  user: Usuario;
  onSuccess?: () => void;
}

type Tab = 'adhoc' | 'prestamo';

/**
 * Modal para agregar un descuento al empleado en la liquidación abierta.
 * Dos modos:
 *  - Ad-hoc: descuento puntual de esta quincena (vive solo en la
 *    liquidación, no genera doc en `prestamos_empleados`).
 *  - Préstamo: crea un préstamo programado en N cuotas. Si la fecha de
 *    inicio cae en la quincena actual, se sugiere al admin re-generar la
 *    liquidación para que la primera cuota aparezca como descuento. Lo
 *    indicamos en el toast.
 *
 * Decisión: la primera cuota NO se aplica como ad-hoc automáticamente.
 * Mantener separado mantiene la fuente de verdad clara: las cuotas de
 * préstamos viven en `cuotasPrestamos[]` (no en `descuentosAdHoc[]`)
 * y se calculan al regenerar la liquidación. Esto mantiene el reporte
 * consistente entre quincenas (todas las cuotas siguen el mismo flujo).
 */
export default function AgregarDescuentoModal({
  isOpen,
  onClose,
  liquidacionId,
  liquidacionQuincena,
  empleado,
  user,
  onSuccess,
}: Props) {
  const [tab, setTab] = useState<Tab>('adhoc');
  const [saving, setSaving] = useState(false);

  // Form ad-hoc
  const [adhocMonto, setAdhocMonto] = useState('');
  const [adhocMotivo, setAdhocMotivo] = useState('');

  // Form préstamo
  const [prestamoMontoTotal, setPrestamoMontoTotal] = useState('');
  const [prestamoCuotas, setPrestamoCuotas] = useState('4');
  const [prestamoMotivo, setPrestamoMotivo] = useState('');
  const [prestamoFechaInicio, setPrestamoFechaInicio] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const reset = () => {
    setAdhocMonto('');
    setAdhocMotivo('');
    setPrestamoMontoTotal('');
    setPrestamoCuotas('4');
    setPrestamoMotivo('');
    setPrestamoFechaInicio(new Date().toISOString().slice(0, 10));
    setTab('adhoc');
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const montoCuotaPreview = useMemo(() => {
    const total = Number(prestamoMontoTotal) || 0;
    const n = Math.max(1, Math.floor(Number(prestamoCuotas) || 0));
    if (total <= 0 || n <= 0) return 0;
    return Math.round((total / n) * 100) / 100;
  }, [prestamoMontoTotal, prestamoCuotas]);

  const handleGuardarAdHoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = Number(adhocMonto);
    if (!(monto > 0)) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }
    if (!adhocMotivo.trim()) {
      toast.error('El motivo es obligatorio');
      return;
    }
    setSaving(true);
    try {
      await agregarDescuentoAdHoc(
        liquidacionId,
        empleado.personalId,
        { monto, motivo: adhocMotivo.trim() },
        user,
      );
      toast.success(`Descuento de ${formatMoneda(monto)} agregado a ${empleado.personalNombre}`);
      onSuccess?.();
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al agregar descuento';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarPrestamo = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoTotal = Number(prestamoMontoTotal);
    const cuotas = Math.max(1, Math.floor(Number(prestamoCuotas) || 0));
    if (!(montoTotal > 0)) {
      toast.error('El monto total debe ser mayor a 0');
      return;
    }
    if (!(cuotas >= 1)) {
      toast.error('La cantidad de cuotas debe ser al menos 1');
      return;
    }
    if (montoTotal < cuotas) {
      toast.error('El monto total debe ser mayor o igual a la cantidad de cuotas');
      return;
    }
    if (!prestamoMotivo.trim()) {
      toast.error('El motivo es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const fechaInicio = new Date(`${prestamoFechaInicio}T00:00:00`);
      await crearPrestamo({
        personalId: empleado.personalId,
        personalNombre: empleado.personalNombre,
        personalRol: empleado.rol,
        montoTotal,
        cuotasTotales: cuotas,
        montoCuota: montoCuotaPreview,
        motivo: prestamoMotivo.trim(),
        fechaInicio,
        creadoPorId: user.id,
        creadoPorNombre: user.nombre,
      });

      // Si la fecha cae en la quincena actual de la liquidación abierta,
      // avisamos al admin que regenere la liquidación para ver la primera
      // cuota descontada. No aplicamos automáticamente para mantener una
      // sola fuente de verdad (cuotasPrestamos[]) consistente entre
      // quincenas y para no mezclar préstamo + ad-hoc en la misma fila.
      const quincenaInicio = calcularQuincenaActual(fechaInicio);
      if (quincenaInicio === liquidacionQuincena) {
        toast.success(
          `Préstamo creado. Regenera la liquidación de ${liquidacionQuincena} para incluir la primera cuota.`,
          { duration: 6000 },
        );
      } else {
        toast.success(`Préstamo creado. Primera cuota se descontará en ${quincenaInicio}.`);
      }
      onSuccess?.();
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear préstamo';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Agregar descuento: ${empleado.personalNombre}`}
      size="md"
    >
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          type="button"
          onClick={() => setTab('adhoc')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'adhoc'
              ? 'border-[#1a5fa8] text-[#0f3460]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Ad-hoc (esta quincena)
        </button>
        <button
          type="button"
          onClick={() => setTab('prestamo')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'prestamo'
              ? 'border-[#1a5fa8] text-[#0f3460]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Préstamo programado
        </button>
      </div>

      {tab === 'adhoc' ? (
        <form onSubmit={handleGuardarAdHoc} className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
            Se descuenta una sola vez de esta quincena ({liquidacionQuincena}).
            Para descuentos en N cuotas usá la pestaña de préstamo programado.
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monto a descontar (RD$) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={adhocMonto}
              onChange={e => setAdhocMonto(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo *</label>
            <textarea
              rows={3}
              value={adhocMotivo}
              onChange={e => setAdhocMotivo(e.target.value)}
              placeholder="Ej: anticipo del día, ajuste manual, descuento por equipo perdido..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Agregar descuento'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleGuardarPrestamo} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            Se crea un préstamo en N cuotas quincenales. Cada quincena se
            descuenta automáticamente la cuota hasta saldar el monto total.
            El historial vive en /admin/prestamos.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto total (RD$) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={prestamoMontoTotal}
                onChange={e => setPrestamoMontoTotal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1"># de cuotas *</label>
              <input
                type="number"
                min="1"
                step="1"
                value={prestamoCuotas}
                onChange={e => setPrestamoCuotas(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
              />
            </div>
          </div>
          {montoCuotaPreview > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
              <div className="flex justify-between">
                <span>Monto por cuota:</span>
                <span className="font-semibold">{formatMoneda(montoCuotaPreview)}</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio *</label>
            <input
              type="date"
              value={prestamoFechaInicio}
              onChange={e => setPrestamoFechaInicio(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              La primera cuota se descontará en la quincena que contenga esta fecha.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo *</label>
            <textarea
              rows={2}
              value={prestamoMotivo}
              onChange={e => setPrestamoMotivo(e.target.value)}
              placeholder="Ej: préstamo para reparación de carro, adelanto de salario..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Creando...' : 'Crear préstamo'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
