import { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Hourglass, X } from 'lucide-react';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import type { OrdenServicio, SugerenciaSoloChequeo } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  CONFIG_EMPRESA_DEFAULT,
  PRECIO_CHEQUEO_DEFAULT_FALLBACK,
  suscribirConfigEmpresa,
  type ConfigEmpresa,
} from '../../services/configEmpresa.service';
import { crearSugerenciaSoloChequeo } from '../../services/ordenes.service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenServicio;
  /** Llamado tras submit exitoso para que el caller refresque UI/cierre el modal padre. */
  onSubmitted?: () => void;
}

const MIN_MOTIVO_CHARS = 10;

/**
 * Modal del flujo "Sugerir solo chequeo" del técnico (sprint R4 endurecida).
 *
 * Antes el técnico podía marcar `soloChequeo: true` directo. Ahora abre este
 * modal, ingresa motivo + monto, y se crea una sugerencia con
 * `estado: 'pendiente'`. Oficina aprueba o rechaza desde
 * `/admin/sugerencias-chequeo`.
 *
 * Defensa: las rules R4 bloquean al técnico que escriba `soloChequeo`,
 * `precioFinal` o `estadoAprobacion` directos. Este flujo es la única ruta
 * legítima.
 */
export default function ModalSugerirSoloChequeo({ isOpen, onClose, orden, onSubmitted }: Props) {
  const { userProfile, currentUser } = useApp();

  // Reusamos `config_empresa.precioChequeoDefault` (fuente única — la misma
  // que ya leen TecnicoVista, AgendaDia y OrdenDetalle). Mismo patrón:
  // suscribirConfigEmpresa() en useEffect, state local. Evita duplicar el
  // valor en config_web/sitio (donde admin se olvidaría de mantenerlo en
  // sync — bug latente).
  const [empresaConfig, setEmpresaConfig] = useState<ConfigEmpresa>({
    ...CONFIG_EMPRESA_DEFAULT,
  });

  useEffect(() => {
    const unsub = suscribirConfigEmpresa(cfg => setEmpresaConfig(cfg));
    return () => unsub();
  }, []);

  const montoDefault =
    empresaConfig.precioChequeoDefault ?? PRECIO_CHEQUEO_DEFAULT_FALLBACK;
  const [monto, setMonto] = useState<string>(String(montoDefault));
  const [motivo, setMotivo] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Re-sync default cuando cambia config o se abre el modal
  useEffect(() => {
    if (isOpen) {
      setMonto(String(montoDefault));
      setMotivo('');
    }
  }, [isOpen, montoDefault]);

  const motivoTrim = motivo.trim();
  const motivoValido = motivoTrim.length >= MIN_MOTIVO_CHARS;
  const montoNum = Number(monto);
  const montoValido = !isNaN(montoNum) && montoNum > 0;
  const puedeEnviar = motivoValido && montoValido && !saving;

  const charsRestantes = useMemo(
    () => Math.max(0, MIN_MOTIVO_CHARS - motivoTrim.length),
    [motivoTrim.length],
  );

  const handleSubmit = async () => {
    if (!puedeEnviar) return;
    // P-001: la rule R4 valida sugeridaPor == request.auth.uid. Para
    // perfiles cargados vía cascada personal/, userProfile.id es el
    // personalDocId, NO auth.uid. Usar currentUser.uid del Firebase Auth.
    if (!currentUser?.uid) {
      toast.error('No se identificó al técnico — recargá la página');
      return;
    }
    setSaving(true);
    try {
      const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sug_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const sugerencia: SugerenciaSoloChequeo = {
        id,
        estado: 'pendiente',
        sugeridaPor: currentUser.uid,
        sugeridaPorNombre: userProfile?.nombre || 'Técnico',
        fechaSugerencia: Timestamp.now(),
        motivo: motivoTrim,
        montoChequeo: montoNum,
      };
      await crearSugerenciaSoloChequeo(orden.id, sugerencia, {
        ordenNumero: orden.numero || '',
        clienteNombre: orden.clienteNombre || '',
        tecnicoNombre: userProfile?.nombre || 'Técnico',
      });
      toast.success('Sugerencia enviada a oficina');
      onSubmitted?.();
      onClose();
    } catch (err) {
      console.error('Error creando sugerencia de solo chequeo:', err);
      toast.error('No se pudo enviar la sugerencia. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} title="Sugerir solo chequeo">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-xs">
          <p className="font-semibold text-gray-900">{orden.clienteNombre}</p>
          <p className="text-gray-600">
            {orden.equipoTipo}
            {orden.equipoMarca ? ` · ${orden.equipoMarca}` : ''}
          </p>
          <p className="text-gray-500 mt-0.5 font-mono">{orden.numero || ''}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
          <Hourglass size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Esta sugerencia debe ser aprobada por oficina.</p>
            <p className="mt-1">
              Hasta que admin/coord apruebe, no podrás cerrar la orden. Te llegará
              una notificación cuando se resuelva.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Monto del chequeo (RD$) *
          </label>
          <input
            type="number"
            min={0}
            step={50}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Default: RD${montoDefault.toLocaleString('es-DO')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Motivo *
          </label>
          <textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={saving}
            placeholder="Ej: Cliente no quiere reparar, ya pagó el diagnóstico"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
          />
          {!motivoValido && motivoTrim.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-1">
              Faltan {charsRestantes} caracteres (mínimo {MIN_MOTIVO_CHARS}).
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <X size={14} /> Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!puedeEnviar}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Enviando...' : 'Enviar sugerencia a oficina'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
