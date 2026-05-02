import { useMemo, useState } from 'react';
import { AlertCircle, Calendar, Loader2, X } from 'lucide-react';
import { SLOTS_HORARIOS, MAX_DIAS_FUTURO } from '../../utils/agenda';
import { obtenerAppCheckToken } from '../../lib/appCheck';

/** Mensajes de error UI ↔ código de error del backend. */
const MENSAJES_ERROR: Record<string, string> = {
  fecha_domingo: 'No atendemos domingos. Elegí otro día.',
  fecha_pasada_o_muy_proxima: 'La fecha debe ser al menos un día después de hoy.',
  fecha_muy_lejana: 'La fecha no puede ser más de 60 días en el futuro.',
  fecha_invalida: 'La fecha elegida no es válida.',
  motivo_largo: 'El motivo es muy largo (máx. 500 caracteres).',
  no_reprogramable: 'Esta cita ya no se puede reprogramar (fue cerrada o cancelada).',
  limite_propuestas: 'Has enviado muchas propuestas. Esperá la respuesta antes de enviar más.',
  orden_no_encontrada: 'No encontramos esta orden.',
  token_invalido: 'El link no es válido.',
  orden_sin_fecha_agendada: 'Esta orden todavía no está agendada. Cuando la oficina te confirme una fecha, vas a poder pedir reprogramarla.',
};

interface Props {
  /** Token del portal del cliente (de la URL `/cliente/:token`). */
  token: string;
  /** Cierre desde X o cancelar. */
  onClose: () => void;
  /** Llamado tras submit exitoso para refrescar la vista padre. */
  onSubmitted?: () => void;
}

/**
 * Devuelve YYYY-MM-DD para el día dado (sin offset horario, asumido en
 * zona local del navegador del cliente).
 */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Modal para que el cliente proponga una nueva fecha/hora de cita desde
 * `/cliente/:token`. POSTea a `/api/portal-cliente/<token>/posponer`.
 */
export default function ModalPosponer({ token, onClose, onSubmitted }: Props) {
  const hoy = useMemo(() => new Date(), []);
  const minDate = useMemo(() => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + 1);
    return d;
  }, [hoy]);
  const maxDate = useMemo(() => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + MAX_DIAS_FUTURO);
    return d;
  }, [hoy]);

  const [fecha, setFecha] = useState<string>(''); // YYYY-MM-DD
  const [horaIdx, setHoraIdx] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errorClient, setErrorClient] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Validación cliente: domingos → bloqueamos antes de enviar.
  const fechaSeleccionadaEsDomingo = useMemo(() => {
    if (!fecha) return false;
    // Construimos la fecha en zona local explícitamente (Date('YYYY-MM-DD')
    // se interpreta como UTC y puede shiftear el día). Usamos partes.
    const [y, m, d] = fecha.split('-').map(n => parseInt(n, 10));
    if (!y || !m || !d) return false;
    const fechaLocal = new Date(y, m - 1, d, 12, 0, 0); // medio día local
    return fechaLocal.getDay() === 0;
  }, [fecha]);

  const formularioListo = !!fecha && horaIdx !== null && !fechaSeleccionadaEsDomingo;

  function pickHora(idx: number) {
    setHoraIdx(idx);
    setErrorClient(null);
  }

  function handleFechaChange(value: string) {
    setFecha(value);
    setErrorServidor(null);
    if (!value) {
      setErrorClient(null);
      return;
    }
    const [y, m, d] = value.split('-').map(n => parseInt(n, 10));
    if (!y || !m || !d) {
      setErrorClient('La fecha no es válida.');
      return;
    }
    const fechaLocal = new Date(y, m - 1, d, 12, 0, 0);
    if (fechaLocal.getDay() === 0) {
      setErrorClient('No atendemos domingos. Elegí otro día.');
    } else {
      setErrorClient(null);
    }
  }

  async function handleSubmit() {
    if (!formularioListo || horaIdx === null) return;
    setEnviando(true);
    setErrorServidor(null);

    try {
      // Construir Date local con día + hora elegida. Lo convertimos a ISO
      // en zona local del navegador (Date.toISOString() lo serializa a UTC,
      // pero el backend lo parsea como instante puntual y aplica offset RD
      // al validar — así que enviar el ISO local-as-UTC NO es lo que
      // queremos; preferimos enviar el ISO correctamente expresando la hora
      // local del cliente como instante UTC). Para evitar bugs de horario,
      // construimos el Date con `new Date(y, m, d, hour, 0, 0)` que ya está
      // en zona local del navegador, y lo serializamos con toISOString().
      const [y, m, d] = fecha.split('-').map(n => parseInt(n, 10));
      const slot = SLOTS_HORARIOS[horaIdx];
      const fechaInstante = new Date(y, m - 1, d, slot.hour, 0, 0, 0);
      const isoString = fechaInstante.toISOString();

      const appCheckToken = await obtenerAppCheckToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
      const resp = await fetch(`/api/portal-cliente/${token}/posponer`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fechaNuevaPropuesta: isoString,
          motivo: motivo.trim(),
        }),
      });

      if (resp.ok) {
        onSubmitted?.();
        onClose();
        return;
      }

      // Manejo de errores
      let errorCode = '';
      let errorMensaje = '';
      try {
        const body = (await resp.json()) as { error?: string; mensaje?: string };
        errorCode = typeof body.error === 'string' ? body.error : '';
        errorMensaje = typeof body.mensaje === 'string' ? body.mensaje : '';
      } catch {
        // body no parseable
      }

      if (resp.status === 409) {
        setErrorServidor(
          'Ya tenés una propuesta pendiente. Esperá la respuesta del taller antes de enviar otra.',
        );
      } else if (resp.status === 410) {
        setErrorServidor(MENSAJES_ERROR.no_reprogramable);
      } else if (resp.status === 429) {
        setErrorServidor(MENSAJES_ERROR.limite_propuestas);
      } else if (resp.status === 400) {
        setErrorServidor(MENSAJES_ERROR[errorCode] || errorMensaje || 'No pudimos procesar tu propuesta.');
      } else {
        setErrorServidor('Error al enviar. Intentá de nuevo.');
      }
    } catch {
      setErrorServidor('Error al enviar. Verificá tu conexión e intentá de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={enviando ? undefined : onClose}
      />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={18} className="text-[#0f3460]" />
            Pedir posponer mi cita
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <p className="text-xs text-gray-500">
            Elegí una nueva fecha y un horario que te venga bien. La oficina
            revisará tu propuesta y te avisará por WhatsApp.
          </p>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Nueva fecha
            </label>
            <input
              type="date"
              value={fecha}
              min={toIsoDate(minDate)}
              max={toIsoDate(maxDate)}
              onChange={e => handleFechaChange(e.target.value)}
              disabled={enviando}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0f3460] focus:border-transparent disabled:bg-gray-50"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Mínimo mañana, máximo 60 días. No atendemos domingos.
            </p>
            {errorClient && (
              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> {errorClient}
              </p>
            )}
          </div>

          {/* Hora */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Horario preferido
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SLOTS_HORARIOS.map((slot, idx) => {
                const seleccionado = horaIdx === idx;
                return (
                  <button
                    key={slot.label}
                    type="button"
                    disabled={enviando}
                    onClick={() => pickHora(idx)}
                    className={
                      'px-3 py-2 rounded-lg text-sm font-medium border transition-colors ' +
                      (seleccionado
                        ? 'bg-[#0f3460] text-white border-[#0f3460]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400')
                    }
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Motivo (opcional)
            </label>
            <textarea
              rows={3}
              value={motivo}
              maxLength={500}
              onChange={e => setMotivo(e.target.value)}
              disabled={enviando}
              placeholder="Ej: Tengo una emergencia ese día y no podré recibirlos."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0f3460] focus:border-transparent resize-none disabled:bg-gray-50"
            />
            <p className="text-[10px] text-gray-400 mt-1 text-right">
              {motivo.length}/500
            </p>
          </div>

          {/* Error servidor */}
          {errorServidor && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-red-700 mt-0.5 shrink-0" />
              <p className="text-xs text-red-900">{errorServidor}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={enviando || !formularioListo}
            className="flex-1 px-4 py-2.5 bg-[#0f3460] hover:bg-[#1a5fa8] text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {enviando && <Loader2 size={14} className="animate-spin" />}
            {enviando ? 'Enviando...' : 'Enviar propuesta'}
          </button>
        </div>
      </div>
    </div>
  );
}
