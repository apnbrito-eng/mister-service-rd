import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Send, AlertTriangle } from 'lucide-react';
import { db } from '../../firebase/config';

/**
 * SPRINT-WA-TEMPLATE-METRICS (2026-05-21). Vista de rendimiento de
 * plantillas HSM enviadas. Lee `whatsapp_mensajes_outbox` agrupado por
 * `plantilla.nombre` y cuenta por `estado`.
 *
 * Source-of-truth de los estados (WhatsAppEstadoMensajeOutbox):
 *   queued | sent | delivered | read | failed
 *
 * Decisiones de scope:
 *  - Solo `tipo === 'plantilla'` cuenta (mensajes texto_libre / media no
 *    son plantillas HSM y no aplican a este reporte).
 *  - Listener global a la colección (sin where) — la rule
 *    `firestore.rules:697` gatea por esStaffOficina() y el cazador P-012
 *    no aplica (no es rule auth.uid==X).
 *  - Sort client-side por enviadas DESC. Sin índice.
 */

interface FilaPlantilla {
  nombre: string;
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface MensajeOutboxLite {
  estado: string;
  tipo: string;
  plantillaNombre: string | null;
}

function parseMensaje(data: Record<string, unknown>): MensajeOutboxLite {
  const plantilla = data.plantilla as { nombre?: string } | null | undefined;
  return {
    estado: typeof data.estado === 'string' ? data.estado : 'queued',
    tipo: typeof data.tipo === 'string' ? data.tipo : 'texto_libre',
    plantillaNombre: plantilla?.nombre ?? null,
  };
}

function calcularFilas(mensajes: MensajeOutboxLite[]): FilaPlantilla[] {
  const mapa = new Map<string, FilaPlantilla>();
  for (const m of mensajes) {
    if (m.tipo !== 'plantilla' || !m.plantillaNombre) continue;
    if (!mapa.has(m.plantillaNombre)) {
      mapa.set(m.plantillaNombre, {
        nombre: m.plantillaNombre,
        total: 0,
        queued: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      });
    }
    const fila = mapa.get(m.plantillaNombre)!;
    fila.total += 1;
    switch (m.estado) {
      case 'queued': fila.queued += 1; break;
      case 'sent': fila.sent += 1; break;
      case 'delivered': fila.delivered += 1; break;
      case 'read': fila.read += 1; break;
      case 'failed': fila.failed += 1; break;
      default: break;
    }
  }
  const filas = Array.from(mapa.values());
  filas.sort((a, b) => b.total - a.total);
  return filas;
}

export default function MetricasPlantillas({ className = '' }: { className?: string }) {
  const [mensajes, setMensajes] = useState<MensajeOutboxLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // @safe-listener-sin-where: rule `whatsapp_mensajes_outbox`
    // (firestore.rules:697) gatea por esStaffOficina(). MetricasPlantillas
    // se monta dentro de páginas protegidas por permiso rendimientoVer
    // (admin/coord) → staff oficina por definición.
    const unsub = onSnapshot(
      collection(db, 'whatsapp_mensajes_outbox'),
      (snap) => {
        setMensajes(snap.docs.map((d) => parseMensaje(d.data())));
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error('[MetricasPlantillas] listener error', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const filas = useMemo(() => calcularFilas(mensajes), [mensajes]);

  if (loading) {
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
          <Send size={14} className="inline mr-1" />
          Métricas de plantillas WhatsApp
        </h3>
        <p className="text-sm text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (filas.length === 0) {
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
          <Send size={14} className="inline mr-1" />
          Métricas de plantillas WhatsApp
        </h3>
        <p className="text-sm text-gray-400">
          Sin envíos de plantillas registrados.
        </p>
      </div>
    );
  }

  const totalGlobal = filas.reduce((s, f) => s + f.total, 0);
  const totalLeidoGlobal = filas.reduce((s, f) => s + f.read, 0);
  const tasaLecturaGlobal = totalGlobal > 0 ? (totalLeidoGlobal / totalGlobal) * 100 : 0;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase">
          <Send size={14} className="inline mr-1" />
          Métricas de plantillas WhatsApp
        </h3>
        <span className="text-xs text-gray-500">
          {filas.length} plantillas · {totalGlobal} envíos · tasa lectura{' '}
          <span className="font-semibold text-gray-800">
            {tasaLecturaGlobal.toFixed(1)}%
          </span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="py-2 pr-3 font-semibold">Plantilla</th>
              <th className="py-2 px-2 font-semibold text-right">Enviadas</th>
              <th className="py-2 px-2 font-semibold text-right">Entregadas</th>
              <th className="py-2 px-2 font-semibold text-right">Leídas</th>
              <th className="py-2 px-2 font-semibold text-right">Fallidas</th>
              <th className="py-2 px-2 font-semibold text-right">% Lectura</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              // Entregadas reales = sent + delivered + read (todos pasaron por sent).
              // Pero el modelo WA es: sent → delivered → read. El más alto que
              // alcanzó cuenta. Lo más útil es mostrar los buckets directamente.
              const enviadasTotal = f.sent + f.delivered + f.read; // efectivamente enviadas
              const entregadasTotal = f.delivered + f.read; // llegaron al device
              const leidasTotal = f.read;
              const tasaLectura = enviadasTotal > 0 ? (leidasTotal / enviadasTotal) * 100 : 0;
              const tasaColor =
                tasaLectura >= 60 ? 'text-emerald-700'
                : tasaLectura >= 30 ? 'text-amber-700'
                : 'text-red-700';
              return (
                <tr key={f.nombre} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-2 pr-3 font-medium text-gray-800 break-words">
                    {f.nombre}
                  </td>
                  <td className="py-2 px-2 text-right text-gray-700">{enviadasTotal}</td>
                  <td className="py-2 px-2 text-right text-gray-700">{entregadasTotal}</td>
                  <td className="py-2 px-2 text-right text-gray-700">{leidasTotal}</td>
                  <td className="py-2 px-2 text-right">
                    {f.failed > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <AlertTriangle size={11} /> {f.failed}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className={`py-2 px-2 text-right font-semibold ${tasaColor}`}>
                    {tasaLectura.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400 mt-4">
        Estados WhatsApp: <em>queued</em> = en cola (no enviada todavía).{' '}
        <em>sent</em> = saliendo de Meta. <em>delivered</em> = llegó al
        dispositivo. <em>read</em> = el cliente la leyó. <em>failed</em> = error.
        % Lectura = read / (sent + delivered + read).
      </p>
    </div>
  );
}
