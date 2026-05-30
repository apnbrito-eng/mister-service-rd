import { useState, useEffect, useMemo, Fragment } from 'react';
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Sparkles, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { db } from '../firebase/config';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Historial de conversaciones con el Asistente IA — página admin.
 *
 * Lee `conversaciones_ia` en tiempo real (onSnapshot, top 100 por
 * `ultimoMensajeAt` desc). Filtros in-memory por usuario y rango de fechas.
 * Click en una fila expande los mensajes completos inline (estilo chat).
 *
 * Visibilidad: gateada en App.tsx con RolRoute administrador. No se duplica
 * el guard aquí.
 *
 * Nota de seguridad: se asume que las Firestore security rules restringen
 * read de esta colección a admin (Jorge aplica la rule manualmente). El
 * gating de la ruta es defensa en profundidad; el gate real es la rule.
 */

interface MensajePersistido {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Timestamp;
}

interface ConversacionIA {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  usuarioRol: string;
  usuarioEmail?: string;
  iniciadaAt: Date | null;
  ultimoMensajeAt: Date | null;
  mensajes: MensajePersistido[];
  tokensInputTotal: number;
  tokensOutputTotal: number;
  costoTotalUSD: number;
  cantidadMensajes: number;
}

function toDateSafe(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  const ts = val as { toDate?: () => Date };
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate(); } catch { /* noop */ }
  }
  return null;
}

function formatFecha(d: Date | null): string {
  if (!d) return '—';
  return format(d, "dd MMM yyyy · HH:mm", { locale: es });
}

function formatCosto(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default function AsistenteIAHistorial() {
  const [conversaciones, setConversaciones] = useState<ConversacionIA[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState<string>('');
  const [filtroDesde, setFiltroDesde] = useState<string>('');
  const [filtroHasta, setFiltroHasta] = useState<string>('');
  const [busqueda, setBusqueda] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'conversaciones_ia'),
      orderBy('ultimoMensajeAt', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: ConversacionIA[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const mensajesRaw = Array.isArray(data.mensajes) ? data.mensajes : [];
        const mensajes: MensajePersistido[] = mensajesRaw
          .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
          .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: typeof m.content === 'string' ? m.content : '',
            timestamp: m.timestamp as Timestamp | undefined,
          }));
        return {
          id: d.id,
          usuarioId: typeof data.usuarioId === 'string' ? data.usuarioId : '',
          usuarioNombre: typeof data.usuarioNombre === 'string' ? data.usuarioNombre : 'Usuario',
          usuarioRol: typeof data.usuarioRol === 'string' ? data.usuarioRol : '',
          usuarioEmail: typeof data.usuarioEmail === 'string' ? data.usuarioEmail : undefined,
          iniciadaAt: toDateSafe(data.iniciadaAt),
          ultimoMensajeAt: toDateSafe(data.ultimoMensajeAt),
          mensajes,
          tokensInputTotal: typeof data.tokensInputTotal === 'number' ? data.tokensInputTotal : 0,
          tokensOutputTotal: typeof data.tokensOutputTotal === 'number' ? data.tokensOutputTotal : 0,
          costoTotalUSD: typeof data.costoTotalUSD === 'number' ? data.costoTotalUSD : 0,
          cantidadMensajes: typeof data.cantidadMensajes === 'number' ? data.cantidadMensajes : mensajes.length,
        };
      });
      setConversaciones(items);
      setLoading(false);
    }, (err) => {
      console.error('[AsistenteIAHistorial] error cargando conversaciones_ia:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Lista distinct de usuarios para el filtro (solo quienes han usado IA).
  const usuariosDistinct = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; rol: string }>();
    for (const c of conversaciones) {
      if (!c.usuarioId) continue;
      if (!map.has(c.usuarioId)) {
        map.set(c.usuarioId, { id: c.usuarioId, nombre: c.usuarioNombre, rol: c.usuarioRol });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [conversaciones]);

  const conversacionesFiltradas = useMemo(() => {
    let lista = conversaciones;

    if (filtroUsuario) {
      lista = lista.filter(c => c.usuarioId === filtroUsuario);
    }

    if (filtroDesde) {
      const desde = new Date(filtroDesde + 'T00:00:00');
      lista = lista.filter(c => c.ultimoMensajeAt && c.ultimoMensajeAt >= desde);
    }

    if (filtroHasta) {
      const hasta = new Date(filtroHasta + 'T23:59:59');
      lista = lista.filter(c => c.ultimoMensajeAt && c.ultimoMensajeAt <= hasta);
    }

    if (busqueda.trim()) {
      const qLower = busqueda.toLowerCase().trim();
      lista = lista.filter(c =>
        c.usuarioNombre.toLowerCase().includes(qLower) ||
        (c.usuarioEmail && c.usuarioEmail.toLowerCase().includes(qLower)) ||
        c.mensajes.some(m => m.content.toLowerCase().includes(qLower))
      );
    }

    return lista;
  }, [conversaciones, filtroUsuario, filtroDesde, filtroHasta, busqueda]);

  const toggleExpanded = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  if (loading) {
    return <LoadingSpinner fullPage text="Cargando historial..." />;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Sparkles size={22} className="text-primary-medium" />
          Historial del Asistente IA
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Audit log de todas las conversaciones con el asistente. Mostrando las 100 más recientes.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
            <select
              value={filtroUsuario}
              onChange={e => setFiltroUsuario(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            >
              <option value="">Todos</option>
              {usuariosDistinct.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.rol})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={filtroDesde}
              onChange={e => setFiltroDesde(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={filtroHasta}
              onChange={e => setFiltroHasta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Nombre, email o texto..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-medium"
              />
            </div>
          </div>
        </div>
        {(filtroUsuario || filtroDesde || filtroHasta || busqueda) && (
          <div className="mt-3 text-xs text-gray-500">
            {conversacionesFiltradas.length} de {conversaciones.length} conversaciones
            <button
              type="button"
              onClick={() => {
                setFiltroUsuario('');
                setFiltroDesde('');
                setFiltroHasta('');
                setBusqueda('');
              }}
              className="ml-3 text-primary-medium hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {conversacionesFiltradas.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No hay conversaciones que coincidan con los filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Usuario</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Iniciada</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Último mensaje</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Mensajes</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Costo</th>
                  <th className="w-10 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {conversacionesFiltradas.map((c) => {
                  const isExpanded = expandedId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => toggleExpanded(c.id)}
                        className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{c.usuarioNombre}</div>
                          <div className="text-xs text-gray-500 capitalize">{c.usuarioRol}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatFecha(c.iniciadaAt)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatFecha(c.ultimoMensajeAt)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{c.cantidadMensajes}</td>
                        <td className="px-4 py-3 text-right text-gray-700 font-medium">
                          {formatCosto(c.costoTotalUSD)}
                        </td>
                        <td className="px-2 py-3 text-gray-400">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-[#f9fafb] px-6 py-4">
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                              {c.usuarioEmail && (
                                <div className="text-xs text-gray-500 mb-2">
                                  Email: {c.usuarioEmail} · Tokens: {c.tokensInputTotal} in / {c.tokensOutputTotal} out
                                </div>
                              )}
                              {c.mensajes.length === 0 ? (
                                <div className="text-sm text-gray-400 italic">
                                  (Sin mensajes guardados)
                                </div>
                              ) : (
                                c.mensajes.map((m, idx) => (
                                  <div
                                    key={idx}
                                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                  >
                                    <div
                                      className={
                                        m.role === 'user'
                                          ? 'bg-primary text-white rounded-2xl px-4 py-2 max-w-[75%] text-sm whitespace-pre-wrap'
                                          : 'bg-white border border-gray-200 text-gray-900 rounded-2xl px-4 py-2 max-w-[75%] text-sm whitespace-pre-wrap'
                                      }
                                    >
                                      {m.content}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
