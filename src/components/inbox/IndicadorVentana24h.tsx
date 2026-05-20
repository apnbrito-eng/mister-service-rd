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
 * Colores:
 *   - verde (>2h restante) → "Ventana abierta — 15h restantes".
 *   - ámbar (<2h restante) → "Cierra en 1h 23min".
 *   - rojo (<30min o ya cerrada) → "Cierra en 12min" / "Ventana cerrada".
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
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-700 text-xs font-medium border border-red-200">
        <AlertCircle size={12} />
        Ventana cerrada · solo plantillas
      </div>
    );
  }

  const minRestantes = msRestantes / 60000;
  let color: 'verde' | 'ambar' | 'rojo' = 'verde';
  if (minRestantes < 30) color = 'rojo';
  else if (minRestantes < 120) color = 'ambar';

  const clases = {
    verde: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ambar: 'bg-amber-50 text-amber-700 border-amber-200',
    rojo: 'bg-red-50 text-red-700 border-red-200',
  }[color];

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
