import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Search,
  Bot,
  PowerOff,
  UserCheck,
  Inbox as InboxIcon,
  Clock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { suscribirConversaciones } from '../services/whatsappInbox.service';
import type { WhatsAppConversacion } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { SkeletonConversacionRow } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

/**
 * Página `/admin/inbox` — bandeja global de conversaciones WhatsApp.
 *
 * SPRINT-INBOX-2 (2026-05-20). Lista todas las conversaciones desde
 * `whatsapp_conversaciones` (rule `esStaffOficina()` permite read), con:
 *   - Filtros chip client-side: Todas / Sin responder / Mías / Bot OFF.
 *   - Búsqueda local por wa_id o preview.
 *   - Badge de mensajes no leídos por conversación.
 *   - Click en card → `/admin/inbox/:waId` (SPRINT-INBOX-3).
 *
 * Sin queries nuevas con `where` → no genera índices compuestos. Toda la
 * lógica de filtro corre en memoria sobre el snapshot completo.
 */

type FiltroChip = 'todas' | 'sin_responder' | 'mias' | 'bot_off';

/**
 * Una conversación está "sin responder" si:
 *   - existe ultimoMensajeEntrante, Y
 *   - (no hay saliente, O el último entrante es más nuevo que el saliente).
 */
function estaSinResponder(c: WhatsAppConversacion): boolean {
  const ent = c.ultimoMensajeEntrante?.timestamp;
  if (!ent) return false;
  const sal = c.ultimoMensajeSaliente?.timestamp;
  if (!sal) return true;
  const tEnt = ent instanceof Date ? ent.getTime() : (ent as { toMillis?: () => number }).toMillis?.() ?? 0;
  const tSal = sal instanceof Date ? sal.getTime() : (sal as { toMillis?: () => number }).toMillis?.() ?? 0;
  return tEnt > tSal;
}

function tiempoRelativo(t: WhatsAppConversacion['ultimaActividad']): string {
  if (!t) return '—';
  const date = t instanceof Date ? t : new Date((t as { toMillis?: () => number }).toMillis?.() ?? 0);
  if (date.getTime() === 0) return '—';
  return formatDistanceToNow(date, { locale: es, addSuffix: true });
}

/** Formatea un wa_id (10 dígitos) como "(849) 458-0318" para legibilidad RD. */
function formatTelRD(waId: string): string {
  if (!waId || waId.length < 10) return waId;
  const d = waId.replace(/\D/g, '').slice(-10);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function previewMensaje(c: WhatsAppConversacion): { texto: string; direccion: 'entrante' | 'saliente' | 'ninguno' } {
  const ent = c.ultimoMensajeEntrante;
  const sal = c.ultimoMensajeSaliente;
  if (!ent && !sal) return { texto: 'Sin mensajes todavía', direccion: 'ninguno' };
  if (!sal) return { texto: ent?.preview ?? '—', direccion: 'entrante' };
  if (!ent) return { texto: sal?.preview ?? '—', direccion: 'saliente' };
  const tEnt = ent.timestamp instanceof Date ? ent.timestamp.getTime() : (ent.timestamp as { toMillis?: () => number }).toMillis?.() ?? 0;
  const tSal = sal.timestamp instanceof Date ? sal.timestamp.getTime() : (sal.timestamp as { toMillis?: () => number }).toMillis?.() ?? 0;
  return tEnt > tSal
    ? { texto: ent.preview, direccion: 'entrante' }
    : { texto: sal.preview, direccion: 'saliente' };
}

export default function Inbox() {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [conversaciones, setConversaciones] = useState<WhatsAppConversacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroChip>('todas');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const unsub = suscribirConversaciones((items) => {
      setConversaciones(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const conversacionesFiltradas = useMemo(() => {
    let lista = conversaciones;

    // Chip
    if (filtro === 'sin_responder') {
      lista = lista.filter(estaSinResponder);
    } else if (filtro === 'mias') {
      lista = lista.filter((c) => c.asignadaA === currentUser?.uid);
    } else if (filtro === 'bot_off') {
      lista = lista.filter((c) => c.bot?.habilitado === false);
    }

    // Búsqueda
    const q = busqueda.trim().toLowerCase();
    if (q.length > 0) {
      lista = lista.filter((c) => {
        if (c.wa_id.includes(q)) return true;
        const ent = c.ultimoMensajeEntrante?.preview?.toLowerCase() ?? '';
        const sal = c.ultimoMensajeSaliente?.preview?.toLowerCase() ?? '';
        return ent.includes(q) || sal.includes(q);
      });
    }

    return lista;
  }, [conversaciones, filtro, busqueda, currentUser?.uid]);

  // Contadores para los chips (basados en TODAS las conversaciones, no
  // filtradas, para que el badge muestre el universo real).
  const contadores = useMemo(() => {
    return {
      todas: conversaciones.length,
      sin_responder: conversaciones.filter(estaSinResponder).length,
      mias: conversaciones.filter((c) => c.asignadaA === currentUser?.uid).length,
      bot_off: conversaciones.filter((c) => c.bot?.habilitado === false).length,
    };
  }, [conversaciones, currentUser?.uid]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <InboxIcon className="text-brand-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox WhatsApp</h1>
          <p className="text-sm text-gray-500">
            Conversaciones entrantes y salientes con clientes
          </p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-3">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por teléfono o contenido del mensaje..."
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
        />
      </div>

      {/* Chips de filtro */}
      <div className="flex flex-wrap gap-2 mb-4">
        <ChipFiltro
          activo={filtro === 'todas'}
          onClick={() => setFiltro('todas')}
          icon={<MessageSquare size={14} />}
          label="Todas"
          count={contadores.todas}
        />
        <ChipFiltro
          activo={filtro === 'sin_responder'}
          onClick={() => setFiltro('sin_responder')}
          icon={<Clock size={14} />}
          label="Sin responder"
          count={contadores.sin_responder}
          variant="warning"
        />
        <ChipFiltro
          activo={filtro === 'mias'}
          onClick={() => setFiltro('mias')}
          icon={<UserCheck size={14} />}
          label="Mías"
          count={contadores.mias}
        />
        <ChipFiltro
          activo={filtro === 'bot_off'}
          onClick={() => setFiltro('bot_off')}
          icon={<PowerOff size={14} />}
          label="Bot pausado"
          count={contadores.bot_off}
        />
      </div>

      {/* Lista */}
      {loading ? (
        // SPRINT-DISENO-C (2026-05-31): 6 skeletons en lugar de "Cargando…".
        <ul className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonConversacionRow key={i} />
          ))}
        </ul>
      ) : conversacionesFiltradas.length === 0 ? (
        // SPRINT-DISENO-D (2026-05-31): EmptyState reusable con copy
        // dominicano. Cambia de mensaje según haya filtro/búsqueda activos.
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200">
          {filtro === 'todas' && busqueda.length === 0 ? (
            <EmptyState
              icon={<InboxIcon size={40} />}
              titulo="Todavía no hay conversaciones"
              descripcion="Cuando un cliente te escriba por WhatsApp, vas a verlo acá."
            />
          ) : (
            <EmptyState
              icon={<Search size={40} />}
              titulo="Sin resultados"
              descripcion="Probá con otro filtro o limpiá la búsqueda."
            />
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {conversacionesFiltradas.map((c) => (
            <ConversacionCard
              key={c.id}
              conversacion={c}
              currentUid={currentUser?.uid}
              onClick={() => navigate(`/admin/inbox/${c.wa_id}`)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ChipFiltroProps {
  activo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  variant?: 'default' | 'warning';
}

function ChipFiltro({ activo, onClick, icon, label, count, variant }: ChipFiltroProps) {
  const colorActivo =
    variant === 'warning' && count > 0
      ? 'bg-amber-600 text-white border-amber-600'
      : 'bg-brand-600 text-white border-brand-600';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        activo
          ? colorActivo
          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
      <span
        className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
          activo ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

interface ConversacionCardProps {
  conversacion: WhatsAppConversacion;
  currentUid: string | undefined;
  onClick: () => void;
}

function ConversacionCard({ conversacion, currentUid, onClick }: ConversacionCardProps) {
  const { texto: preview, direccion } = previewMensaje(conversacion);
  const noLeidos = conversacion.noLeidos || 0;
  const sinResponder = estaSinResponder(conversacion);
  const botHabilitado = conversacion.bot?.habilitado === true;
  const esMia = conversacion.asignadaA === currentUid;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left bg-white rounded-lg border transition-all hover:shadow-md hover:border-brand-300 p-3 ${
          noLeidos > 0 ? 'border-brand-400 bg-brand-50/30' : 'border-gray-200'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar / icono */}
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              noLeidos > 0 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <MessageSquare size={18} />
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`font-medium text-sm truncate ${
                    noLeidos > 0 ? 'text-gray-900' : 'text-gray-700'
                  }`}
                >
                  {formatTelRD(conversacion.wa_id)}
                </span>
                {esMia && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">
                    <UserCheck size={10} />
                    Mía
                  </span>
                )}
                {sinResponder && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-medium">
                    Sin responder
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {botHabilitado ? (
                  <Bot size={14} className="text-emerald-500" aria-label="Bot activo" />
                ) : (
                  <PowerOff size={14} className="text-gray-400" aria-label="Bot pausado" />
                )}
                <span className="text-xs text-gray-400">
                  {tiempoRelativo(conversacion.ultimaActividad)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-1">
              <p
                className={`text-sm truncate ${
                  direccion === 'entrante' && noLeidos > 0
                    ? 'text-gray-900 font-medium'
                    : 'text-gray-500'
                }`}
              >
                {direccion === 'saliente' && <span className="text-gray-400">Tú: </span>}
                {preview}
              </p>
              {noLeidos > 0 && (
                <span className="bg-brand-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center flex-shrink-0">
                  {noLeidos > 9 ? '9+' : noLeidos}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}
