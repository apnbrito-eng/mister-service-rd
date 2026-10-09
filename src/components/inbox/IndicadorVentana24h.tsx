import { useEffect, useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

/**
 * Indicador visual de la ventana de respuesta de 24h post-último mensaje
 * entrante (SPRINT-INBOX-3, 2026-05-20).
 *
 * Reglas Meta:
 *   - Ventana abierta = el cliente envió un mensaje hace <24h.
 *   - Mientras esté abierta, el negocio puede mandar `texto_libre`.
 *   - Cerrada → solo se permite mandar plantillas HSM aprobadas (re-engage).
 *
 * Severidad (auditoría alertas 2026-10-08 hallazgo 6):
 *   - abierta >2h restante → severidad `info` (verde): "Ventana abierta — 15h restantes".
 *   - abierta <2h restante → severidad `atencion` (ámbar): "Cierra en 1h 23min".
 *   - abierta <30min        → severidad `atencion` (ámbar fuerte): "Cierra en 12min".
 *   - cerrada                → severidad `atencion` (ámbar): "Ventana cerrada · solo plantillas".
 *     NO es "fallo"; es una restricción de Meta esperable. El aviso rojo
 *     original lo leía como error de conexión, lo que confundía.
 *   - Umbrales 30/120min preservados (no se cambian sin nueva aprobación
 *     de Jorge; sólo se renombra la severidad semántica).
 *
 * El componente re-renderiza cada minuto para que el contador no se
 * congele (los Timestamp llegan del onSnapshot pero el "ahora" cambia).
 */

interface Props {
  ventana24h: {
    abierta: boolean;
    cierraEn: Timestamp | Date;
  };
}

function toDate(t: Timestamp | Date): Date {
  if (t instanceof Date) return t;
  return new Date((t as { toMillis?: () => number }).toMillis?.() ?? 0);
}

function formatearRestante(ms: number): string {
  if (ms <= 0) return 'cerrada';
  const totalMinutos = Math.floor(ms / 60000);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  if (horas === 0) return `${minutos}min`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h ${minutos}min`;
}

export default function IndicadorVentana24h({ ventana24h }: Props) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const cierraEnDate = toDate(ventana24h.cierraEn);
  const msRestantes = cierraEnDate.getTime() - ahora;
  const abierta = ventana24h.abierta && msRestantes > 0;

  if (!abierta) {
    // Severidad `atencion` (ámbar), no `fallo`. La restricción Meta no es
    // un error del sistema. El selector de plantillas (acción esperada)
    // vive en `InboxConversacion.tsx` justo debajo; este indicador queda
    // compacto en el header.
    return (
      <div
        role="status"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-amber-50 text-amber-800 border-amber-200"
      >
        <AlertCircle size={12} aria-hidden="true" />
        Ventana cerrada · solo plantillas
      </div>
    );
  }

  const minRestantes = msRestantes / 60000;
  // info (verde) por default; atencion (ámbar) <2h; atencion fuerte <30min.
  // Los umbrales 30/120min NO cambian — no son nueva aprobación de Jorge.
  let severidad: 'info' | 'atencion' | 'atencion-fuerte' = 'info';
  if (minRestantes < 30) severidad = 'atencion-fuerte';
  else if (minRestantes < 120) severidad = 'atencion';

  const clases = {
    info: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    atencion: 'bg-amber-50 text-amber-800 border-amber-200',
    'atencion-fuerte': 'bg-amber-100 text-amber-900 border-amber-300',
  }[severidad];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${clases}`}
      title={`Ventana cierra a las ${cierraEnDate.toLocaleString('es-DO')}`}
    >
      <Clock size={12} />
      Ventana abierta · cierra en {formatearRestante(msRestantes)}
    </div>
  );
}
