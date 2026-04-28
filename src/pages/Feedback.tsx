import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OrdenServicio } from '../types';
import { parseOrden, formatFechaCorta, whatsappLink } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { useConfigWeb } from '../hooks/useConfigWeb';
import {
  Star, MessageCircle, AlertTriangle, TrendingUp, Users, ThumbsUp,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

type RangoFechas = { inicio: Date; fin: Date };

function rangoMes(year: number, month: number): RangoFechas {
  const inicio = new Date(year, month, 1, 0, 0, 0, 0);
  const fin = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

function npsScore(detr: number, prom: number, total: number): number {
  if (total === 0) return 0;
  return Math.round(((prom / total) - (detr / total)) * 100);
}

function fechaDeFeedback(orden: OrdenServicio): Date | null {
  const f = orden.feedback?.fechaFeedback;
  if (!f) return null;
  if (f instanceof Date) return f;
  if (typeof f === 'object' && 'toDate' in f && typeof (f as { toDate?: () => Date }).toDate === 'function') {
    return (f as { toDate: () => Date }).toDate();
  }
  return null;
}

export default function Feedback() {
  const { userProfile } = useApp();
  const { config: configWeb } = useConfigWeb();
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);

  const hoy = new Date();
  const [mesStr, setMesStr] = useState(format(hoy, 'yyyy-MM'));

  const rango = useMemo(() => {
    const [y, m] = mesStr.split('-').map(Number);
    return rangoMes(y, m - 1);
  }, [mesStr]);

  const rangoPrev = useMemo(() => {
    const [y, m] = mesStr.split('-').map(Number);
    const prevM = m - 1 === 0 ? 12 : m - 1;
    const prevY = m - 1 === 0 ? y - 1 : y;
    return rangoMes(prevY, prevM - 1);
  }, [mesStr]);

  // Listener: traemos todas las órdenes y filtramos client-side por feedback
  // existente. Evita el índice compuesto que requeriría where('feedback', '!=', null) + orderBy.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ordenes_servicio'), (snap) => {
      const arr = snap.docs.map(d => parseOrden(d.id, d.data()));
      setOrdenes(arr);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ─── Datos derivados ──────────────────────────────────

  const ordenesConFeedback = useMemo(
    () => ordenes.filter(o => o.feedback && !o.eliminada),
    [ordenes],
  );

  const ordenesCerradasMes = useMemo(() => {
    return ordenes.filter(o => {
      if (o.eliminada) return false;
      if (o.fase !== 'cerrado') return false;
      const fechaCierre = o.cierreServicio?.fechaCierre instanceof Date
        ? o.cierreServicio.fechaCierre
        : o.updatedAt;
      return fechaCierre >= rango.inicio && fechaCierre <= rango.fin;
    });
  }, [ordenes, rango]);

  const feedbacksMes = useMemo(() => {
    return ordenesConFeedback.filter(o => {
      const fb = fechaDeFeedback(o);
      return fb && fb >= rango.inicio && fb <= rango.fin;
    });
  }, [ordenesConFeedback, rango]);

  const feedbacksMesPrev = useMemo(() => {
    return ordenesConFeedback.filter(o => {
      const fb = fechaDeFeedback(o);
      return fb && fb >= rangoPrev.inicio && fb <= rangoPrev.fin;
    });
  }, [ordenesConFeedback, rangoPrev]);

  const distribucion = useMemo(() => {
    const det = feedbacksMes.filter(o => o.feedback?.ratingTipo === 'detractor').length;
    const pas = feedbacksMes.filter(o => o.feedback?.ratingTipo === 'pasivo').length;
    const pro = feedbacksMes.filter(o => o.feedback?.ratingTipo === 'promotor').length;
    const total = feedbacksMes.length;
    return { det, pas, pro, total };
  }, [feedbacksMes]);

  const distribucionPrev = useMemo(() => {
    const det = feedbacksMesPrev.filter(o => o.feedback?.ratingTipo === 'detractor').length;
    const pro = feedbacksMesPrev.filter(o => o.feedback?.ratingTipo === 'promotor').length;
    const total = feedbacksMesPrev.length;
    return { det, pro, total };
  }, [feedbacksMesPrev]);

  const npsActual = useMemo(
    () => npsScore(distribucion.det, distribucion.pro, distribucion.total),
    [distribucion],
  );
  const npsPrev = useMemo(
    () => npsScore(distribucionPrev.det, distribucionPrev.pro, distribucionPrev.total),
    [distribucionPrev],
  );
  const deltaNPS = npsActual - npsPrev;

  const tasaRespuesta = useMemo(() => {
    const cerradas = ordenesCerradasMes.length;
    if (cerradas === 0) return 0;
    return (feedbacksMes.length / cerradas) * 100;
  }, [feedbacksMes, ordenesCerradasMes]);

  // Detractores recientes (últimos 30 días, no limitado al rango del mes)
  const detractores30d = useMemo(() => {
    const limite = subDays(new Date(), 30);
    return ordenesConFeedback
      .filter(o => o.feedback?.ratingTipo === 'detractor')
      .filter(o => {
        const fb = fechaDeFeedback(o);
        return fb && fb >= limite;
      })
      .sort((a, b) => {
        const fa = fechaDeFeedback(a);
        const fb = fechaDeFeedback(b);
        if (!fa || !fb) return 0;
        return fb.getTime() - fa.getTime();
      });
  }, [ordenesConFeedback]);

  // Promotores no convertidos (no clickearon Google) — ventana 60 días para
  // que el equipo tenga material que recontactar.
  const promotoresNoConvertidos = useMemo(() => {
    const limite = subDays(new Date(), 60);
    return ordenesConFeedback
      .filter(o => o.feedback?.ratingTipo === 'promotor')
      .filter(o => o.feedback?.googleReviewClicked !== true)
      .filter(o => {
        const fb = fechaDeFeedback(o);
        return fb && fb >= limite;
      })
      .sort((a, b) => {
        const fa = fechaDeFeedback(a);
        const fb = fechaDeFeedback(b);
        if (!fa || !fb) return 0;
        return fb.getTime() - fa.getTime();
      });
  }, [ordenesConFeedback]);

  // Helpers de WhatsApp
  function abrirWhatsAppRecontactarDetractor(orden: OrdenServicio) {
    if (!orden.clienteTelefono) {
      alert('Esta orden no tiene teléfono del cliente');
      return;
    }
    const base = configWeb?.feedbackNPS?.mensajeWhatsAppDetractor
      || 'Hola, tuvimos noticia de que tu experiencia reciente con nosotros no fue la esperada.';
    const partes = [
      `Hola ${orden.clienteNombre.split(' ')[0]}, soy ${userProfile?.nombre || 'el equipo'} de Mister Service RD.`,
      base,
      orden.numero ? `Sobre la orden ${orden.numero}.` : '',
      '¿Puedes darnos unos minutos para escucharte?',
    ].filter(Boolean);
    window.open(whatsappLink(orden.clienteTelefono, partes.join(' ')), '_blank');
  }

  function abrirWhatsAppPromotor(orden: OrdenServicio) {
    if (!orden.clienteTelefono) {
      alert('Esta orden no tiene teléfono del cliente');
      return;
    }
    const url = configWeb?.feedbackNPS?.googleReviewsUrl;
    const partes = [
      `Hola ${orden.clienteNombre.split(' ')[0]},`,
      `gracias por tu calificación de ${orden.feedback?.nps}/10.`,
      'Si tienes 30 segundos, ¿nos dejarías una reseña en Google? Significa muchísimo para nosotros.',
      url ? url : '',
    ].filter(Boolean);
    window.open(whatsappLink(orden.clienteTelefono, partes.join(' ')), '_blank');
  }

  if (loading) return <LoadingSpinner fullPage text="Cargando feedback..." />;

  const mesLabel = format(rango.inicio, 'MMMM yyyy', { locale: es });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0f3460] capitalize">
            Feedback NPS — {mesLabel}
          </h1>
          <p className="text-gray-500 text-sm">
            Net Promoter Score y oportunidades de recuperación. Datos del mes seleccionado.
          </p>
        </div>
        <input
          type="month"
          value={mesStr}
          onChange={(e) => setMesStr(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5fa8]"
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="NPS del mes"
          value={`${npsActual}`}
          icon={<TrendingUp size={16} />}
          trend={deltaNPS}
          subtitle={
            distribucion.total === 0
              ? 'Sin feedbacks aún'
              : `${distribucion.total} feedback${distribucion.total === 1 ? '' : 's'}`
          }
          tone="primary"
        />
        <KpiCard
          label="Tasa de respuesta"
          value={`${tasaRespuesta.toFixed(0)}%`}
          icon={<Users size={16} />}
          subtitle={`${feedbacksMes.length} de ${ordenesCerradasMes.length} cerradas`}
        />
        <KpiCard
          label="Promotores"
          value={`${distribucion.pro}`}
          icon={<ThumbsUp size={16} />}
          subtitle={
            distribucion.total > 0
              ? `${((distribucion.pro / distribucion.total) * 100).toFixed(0)}% del total`
              : '—'
          }
          tone="success"
        />
        <KpiCard
          label="Detractores"
          value={`${distribucion.det}`}
          icon={<AlertTriangle size={16} />}
          subtitle={
            distribucion.total > 0
              ? `${((distribucion.det / distribucion.total) * 100).toFixed(0)}% del total`
              : '—'
          }
          tone="danger"
        />
      </div>

      {/* Distribución detallada */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Distribución del mes</h2>
        {distribucion.total === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay feedbacks recibidos este mes.</p>
        ) : (
          <div className="space-y-2">
            <DistribucionBar
              label="Promotores (9-10)"
              count={distribucion.pro}
              total={distribucion.total}
              color="bg-green-500"
            />
            <DistribucionBar
              label="Pasivos (7-8)"
              count={distribucion.pas}
              total={distribucion.total}
              color="bg-amber-400"
            />
            <DistribucionBar
              label="Detractores (0-6)"
              count={distribucion.det}
              total={distribucion.total}
              color="bg-red-500"
            />
          </div>
        )}
      </div>

      {/* Detractores recientes */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600" />
          <h2 className="text-base font-semibold text-gray-900">
            Detractores últimos 30 días ({detractores30d.length})
          </h2>
        </div>
        {detractores30d.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-5">
            Ningún detractor en los últimos 30 días.
          </p>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Técnico</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Orden</th>
                    <th className="text-center px-4 py-2.5 font-semibold">NPS</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Comentario</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detractores30d.map((o) => {
                    const fb = fechaDeFeedback(o);
                    return (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{o.clienteNombre}</td>
                        <td className="px-4 py-2.5 text-gray-600">{fb ? formatFechaCorta(fb) : '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{o.tecnicoNombre || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700 font-mono text-xs">{o.numero || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                            {o.feedback?.nps}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs max-w-xs truncate">
                          {o.feedback?.comentario || <span className="text-gray-400">Sin comentario</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => abrirWhatsAppRecontactarDetractor(o)}
                            disabled={!o.clienteTelefono}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold"
                          >
                            <MessageCircle size={12} /> Recontactar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Promotores no convertidos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-emerald-600" />
          <h2 className="text-base font-semibold text-gray-900">
            Promotores no convertidos a Google ({promotoresNoConvertidos.length})
          </h2>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          Clientes que dieron 9-10 pero no clickearon el botón de reseña en Google. Reenviar el link puede recuperar la reseña.
        </p>
        {promotoresNoConvertidos.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-5">
            No hay promotores pendientes de convertir.
          </p>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Técnico</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Orden</th>
                    <th className="text-center px-4 py-2.5 font-semibold">NPS</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {promotoresNoConvertidos.map((o) => {
                    const fb = fechaDeFeedback(o);
                    return (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{o.clienteNombre}</td>
                        <td className="px-4 py-2.5 text-gray-600">{fb ? formatFechaCorta(fb) : '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{o.tecnicoNombre || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700 font-mono text-xs">{o.numero || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                            {o.feedback?.nps}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => abrirWhatsAppPromotor(o)}
                            disabled={!o.clienteTelefono}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                          >
                            <Star size={12} /> Reenviar link Google
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  subtitle,
  trend,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: number;
  tone?: 'default' | 'primary' | 'success' | 'danger';
}) {
  const cardBg =
    tone === 'primary' ? 'bg-[#0f3460] text-white'
      : tone === 'success' ? 'bg-emerald-50 text-emerald-900'
        : tone === 'danger' ? 'bg-red-50 text-red-900'
          : 'bg-white text-gray-900';
  const labelColor =
    tone === 'primary' ? 'text-white/80'
      : tone === 'success' ? 'text-emerald-700'
        : tone === 'danger' ? 'text-red-700'
          : 'text-gray-500';
  const subColor =
    tone === 'primary' ? 'text-white/70'
      : tone === 'success' ? 'text-emerald-700/80'
        : tone === 'danger' ? 'text-red-700/80'
          : 'text-gray-400';
  return (
    <div className={`rounded-2xl shadow-sm border border-gray-100 p-4 ${cardBg}`}>
      <div className="flex items-center justify-between">
        <p className={`text-[11px] uppercase tracking-wide font-semibold ${labelColor}`}>{label}</p>
        <div className={labelColor}>{icon}</div>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {trend !== undefined && (
        <p className={`text-[11px] mt-0.5 ${subColor}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} vs mes anterior
        </p>
      )}
      {subtitle && <p className={`text-[11px] mt-0.5 ${subColor}`}>{subtitle}</p>}
    </div>
  );
}

function DistribucionBar({
  label, count, total, color,
}: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-500">{count} · {pct.toFixed(0)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
