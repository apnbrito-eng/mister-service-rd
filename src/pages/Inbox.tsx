import { usePreferenciasChat } from '../hooks/usePreferenciasChat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Search,
  Bot,
  PowerOff,
  UserCheck,
  Inbox as InboxIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { parsearConversacion, suscribirConversaciones } from '../services/whatsappInbox.service';
import { equipoApi } from '../services/equipoApi';
import type { WhatsAppConversacion } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { SkeletonConversacionRow } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

/** Bandeja paginada por API; búsqueda local sobre las páginas cargadas. */

type FiltroChip = 'todas' | 'no_leidos' | 'mias' | 'cartera' | 'hoy' | 'pendientes';

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

function horaConversacion(t: WhatsAppConversacion['ultimaActividad']): string {
  if (!t) return '—';
  const d = t instanceof Date ? t : new Date((t as { toMillis?: () => number }).toMillis?.() ?? 0);
  if (!d.getTime() || Number.isNaN(d.getTime())) return '—';
  return Date.now() - d.getTime() < 86400000
    ? d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit' });
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
  const { currentUser, userProfile } = useApp();
  const navigate = useNavigate();
  const { preferencias, cambiar } = usePreferenciasChat(currentUser?.uid);
  const [menuChat, setMenuChat] = useState<WhatsAppConversacion | null>(null);
  const [adminAccion, setAdminAccion] = useState<'ocultar' | 'eliminar' | null>(null);
  const [adminProcesando, setAdminProcesando] = useState(false);
  const adminRequest = useRef('');
  const administrar = async () => {
    if (!menuChat || !adminAccion || adminProcesando) return;
    setAdminProcesando(true); setAccionError('');
    if (!adminRequest.current) adminRequest.current = adminAccion === 'eliminar' && menuChat.borradoEnCurso ? menuChat.borradoEnCurso : crypto.randomUUID();
    try {
      let completada = false;
      while (!completada) {
        const r = await equipoApi<{completada: boolean}>('/api/crm/administrar-chat', { waId: menuChat.wa_id, accion: adminAccion, requestId: adminRequest.current, confirmacion: menuChat.wa_id });
        completada = r.completada;
      }
      setConversaciones(prev => prev.filter(c => c.wa_id !== menuChat.wa_id));
      setMenuChat(null); setAdminAccion(null); adminRequest.current = '';
    } catch(e) { setAccionError((e as Error).message || 'No se completó. Pulsa Reintentar.'); }
    finally { setAdminProcesando(false); }
  };
  const [lista, setLista] = useState('');
  const [filtroPersonal, setFiltroPersonal] = useState('');
  const [accionError, setAccionError] = useState('');
  const modificar = async (cambio: Record<string, unknown>) => { if (!menuChat) return; try { await cambiar(menuChat.wa_id, cambio); setMenuChat(null); setAccionError(''); } catch { setAccionError('No se pudo guardar. Intenta nuevamente.'); } };

  const [conversaciones, setConversaciones] = useState<WhatsAppConversacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [filtro, setFiltro] = useState<FiltroChip>('todas');
  const [busqueda, setBusqueda] = useState('');

  const [limiteEnVivo, setLimiteEnVivo] = useState(25);
  const [cursor, setCursor] = useState<string | null>(null);
  const ciclo = useRef(0);
  const cargar = useCallback(async (pagina: string | null = null) => {
    const llamada = ++ciclo.current;
    setLoading(true); setErrorCarga('');
    try {
      const data = await equipoApi<{ items: Record<string, any>[]; cursor: string | null }>(`/api/crm/bandeja?filtro=${filtro}${pagina ? `&cursor=${encodeURIComponent(pagina)}` : ''}`);
      if (llamada !== ciclo.current) return;
      const fecha = (t: any) => t && typeof (t._seconds ?? t.seconds) === 'number' ? new Date((t._seconds ?? t.seconds) * 1000) : t;
      const items = data.items.map(d => parsearConversacion(d.id, { ...d, ultimaActividad: fecha(d.ultimaActividad), updatedAt: fecha(d.updatedAt),
        ultimoMensajeEntrante: d.ultimoMensajeEntrante ? { ...d.ultimoMensajeEntrante, timestamp: fecha(d.ultimoMensajeEntrante.timestamp) } : undefined,
        ultimoMensajeSaliente: d.ultimoMensajeSaliente ? { ...d.ultimoMensajeSaliente, timestamp: fecha(d.ultimoMensajeSaliente.timestamp) } : undefined,
      }));
      setConversaciones(prev => pagina ? [...new Map([...prev, ...items].map(c => [c.id, c])).values()] : items);
      setCursor(data.cursor);
    } catch (e) { if (llamada === ciclo.current) setErrorCarga((e as Error).message); }
    finally { if (llamada === ciclo.current) setLoading(false); }
  }, [filtro]);
  useEffect(() => {
    setConversaciones([]); setCursor(null); setLoading(true);
    if (filtro === 'todas') return;
    void cargar();
    return () => { ciclo.current++; };
  }, [cargar, filtro]);
  useEffect(() => {
    if (filtro !== 'todas') return;
    setErrorCarga('');
    return suscribirConversaciones(items => {
      setConversaciones(items);
      setCursor(items.length === limiteEnVivo ? 'mas' : null);
      setLoading(false);
    }, () => { setLoading(false); setErrorCarga('No se pudo actualizar la bandeja. Revisa la conexión.'); }, limiteEnVivo);
  }, [filtro, limiteEnVivo]);
  const conversacionesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conversaciones.filter(c => {
      const p = preferencias[c.wa_id];
      const fecha = c.ultimaActividad instanceof Date ? c.ultimaActividad.getTime() : c.ultimaActividad?.toMillis?.() || 0;
      if (c.ocultoGlobalHastaMs && fecha <= c.ocultoGlobalHastaMs && !c.borradoEnCurso) return false;
      if (p?.ocultoHastaMs && fecha <= p.ocultoHastaMs) return false;
      if (filtroPersonal === 'favoritos' && !p?.favorito) return false;
      if (filtroPersonal.startsWith('lista:') && p?.lista !== filtroPersonal.slice(6)) return false;
      return !q || c.wa_id.includes(q) || c.ultimoMensajeEntrante?.preview?.toLowerCase().includes(q) || c.ultimoMensajeSaliente?.preview?.toLowerCase().includes(q);
    });
  }, [conversaciones, busqueda, preferencias, filtroPersonal]);

  if (errorCarga) return <div role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{errorCarga}<button className="block mt-3 underline" onClick={() => window.location.reload()}>Reintentar</button></div>;

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

      <div className="flex gap-2 mb-3 overflow-x-auto pb-2" aria-label="Buzones de atención">
        {([['todas', 'Todos'], ['no_leidos', 'No leídos'], ['cartera', 'Mi cartera'], ['mias', 'Atiendo yo'], ['hoy', 'Órdenes del día'], ['pendientes', 'Pendientes']] as const).map(([valor, label]) => <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)} className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm ${filtro === valor ? 'bg-brand-600 text-white' : 'bg-white text-gray-700'}`}>{label}</button>)}
      </div>
      <div className="flex justify-between gap-2 text-xs text-gray-500 mb-3"><span>{conversaciones.length} chats cargados · búsqueda en esta lista</span><span>{filtro === 'todas' ? 'Actualización en tiempo real' : <button className="underline min-h-[44px]" disabled={loading} onClick={() => void cargar()}>Actualizar</button>}</span></div>
      {filtro === 'pendientes' && <p className="text-xs text-gray-500 mb-3">Atenciones marcadas como pendientes. Los chats antiguos sin seguimiento siguen disponibles en Todos y No leídos.</p>}
      <div className="flex gap-2 overflow-x-auto mb-3"><button className="min-h-11 px-3 border rounded-full text-sm" aria-pressed={filtroPersonal === 'favoritos'} onClick={() => setFiltroPersonal(v => v === 'favoritos' ? '' : 'favoritos')}>★ Favoritos</button>{[...new Set(Object.values(preferencias).map(p => p.lista).filter(Boolean))].map(nombre => <button key={nombre} className="min-h-11 px-3 border rounded-full text-sm" aria-pressed={filtroPersonal === 'lista:' + nombre} onClick={() => setFiltroPersonal(v => v === 'lista:' + nombre ? '' : 'lista:' + nombre)}>{nombre}</button>)}</div>
      {menuChat && <div className="fixed inset-0 z-[80] bg-black/30 flex items-end sm:items-center justify-center p-3" onClick={() => { if (!adminProcesando) setMenuChat(null); }}><section role="dialog" aria-modal="true" aria-label="Opciones de conversación" className="bg-white rounded-2xl p-4 w-full max-w-sm max-h-[85dvh] overflow-y-auto space-y-2" onClick={e => e.stopPropagation()}><strong>{formatTelRD(menuChat.wa_id)}</strong><p className="text-xs text-gray-500">Estas preferencias afectan únicamente a tu cuenta.</p><button className="block min-h-11" onClick={() => navigate(`/admin/inbox/${menuChat.wa_id}?vista=cliente`)}>Información del cliente</button><button className="block min-h-11" onClick={() => void modificar({ favorito: !preferencias[menuChat.wa_id]?.favorito })}>{preferencias[menuChat.wa_id]?.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}</button><button className="block min-h-11" onClick={() => void modificar({ silenciado: !preferencias[menuChat.wa_id]?.silenciado })}>{preferencias[menuChat.wa_id]?.silenciado ? 'Activar avisos de este chat' : 'Silenciar avisos de este chat'}</button><label className="block text-sm">Añadir a una lista<input className="border rounded p-2 w-full" value={lista} maxLength={60} onChange={e=>setLista(e.target.value)} placeholder="Nombre de la lista" /></label><button className="min-h-11 underline" onClick={() => void modificar({ lista })}>Guardar lista</button><details><summary className="min-h-11 text-red-700 cursor-pointer">Vaciar u ocultar…</summary><p className="text-xs">El historial compartido y los archivos del expediente se conservan. Un mensaje nuevo vuelve a mostrar la conversación.</p><button className="block min-h-11" onClick={() => void modificar({ accion: 'vaciar' })}>Vaciar mi vista del chat</button><button className="block min-h-11" onClick={() => void modificar({ accion: 'ocultar' })}>Eliminar de mi bandeja</button><button className="block min-h-11" onClick={() => void modificar({ accion: 'restaurar' })}>Restaurar mi vista</button></details>{userProfile?.rol === 'administrador' && <div className="border-t pt-2"><p className="text-sm font-semibold">Administración · todo el equipo</p>{!adminAccion ? <><button className="block min-h-11" onClick={() => { adminRequest.current = ''; setAdminAccion('ocultar'); }}>Quitar del buzón de todos</button><button className="block min-h-11 text-red-700" onClick={() => { adminRequest.current = ''; setAdminAccion('eliminar'); }}>{menuChat.borradoEnCurso ? 'Reanudar eliminación' : 'Eliminar historial de conversación'}</button></> : <><p className="text-sm my-2">{adminAccion === 'eliminar' ? 'Se borrarán los mensajes del chat para todo el equipo. No se puede deshacer. Se conservan el cliente, sus órdenes, pagos, garantías y documentos del negocio.' : 'Se ocultará para todo el equipo. El historial se conserva y un mensaje nuevo volverá a mostrar el chat.'}</p><button disabled={adminProcesando} className="min-h-11 px-3 rounded bg-red-700 text-white" onClick={() => void administrar()}>{adminProcesando ? 'Procesando… No cierres esta ventana' : accionError ? 'Reintentar' : 'Confirmar'}</button><button disabled={adminProcesando} className="min-h-11 px-3" onClick={() => setAdminAccion(null)}>Cancelar</button></>}</div>}{accionError && <p role="alert">{accionError}</p>}<button className="min-h-11 w-full border rounded-lg" onClick={() => { if (!adminProcesando) setMenuChat(null); }}>Cerrar</button></section></div>}
      {/* Lista */}
      {loading && conversaciones.length === 0 ? (
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
              onMenu={() => { setMenuChat(c); setAdminAccion(null); setAccionError(''); setLista(preferencias[c.wa_id]?.lista || ''); }}
            />
          ))}
        </ul>
      )}
      {cursor && <button type="button" disabled={loading} onClick={() => filtro === 'todas' ? setLimiteEnVivo(n => n + 25) : void cargar(cursor)} className="min-h-[44px] w-full rounded-lg border p-3 mt-3">{loading ? 'Cargando…' : 'Cargar más'}</button>}
    </div>
  );
}

interface ConversacionCardProps {
  conversacion: WhatsAppConversacion;
  currentUid: string | undefined;
  onClick: () => void;
  onMenu: () => void;
}

function ConversacionCard({ conversacion, currentUid, onClick, onMenu }: ConversacionCardProps) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pulsado = useRef(false);
  const cancelar = () => clearTimeout(timer.current);
  useEffect(() => cancelar, []);
  const { texto: preview, direccion } = previewMensaje(conversacion);
  const noLeidos = conversacion.noLeidos || 0;
  const sinResponder = estaSinResponder(conversacion);
  const botHabilitado = conversacion.bot?.habilitado === true;
  const esMia = conversacion.asignadaA === currentUid;

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => { if (!pulsado.current) onClick(); pulsado.current = false; }}
        onContextMenu={e => { e.preventDefault(); onMenu(); }}
        onPointerDown={() => { pulsado.current = false; timer.current = setTimeout(() => { pulsado.current = true; onMenu(); }, 550); }}
        onPointerUp={cancelar} onPointerCancel={cancelar} onPointerMove={cancelar}
        className={`w-full text-left bg-white rounded-lg border transition-colors hover:shadow-md hover:border-brand-300 p-3 ${
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
                  <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">
                    <UserCheck size={10} />
                    Mía
                  </span>
                )}
                {sinResponder && (
                  <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-medium">
                    Sin responder
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {botHabilitado ? (
                  <Bot size={14} className="hidden sm:block text-emerald-500" aria-label="Bot activo" />
                ) : (
                  <PowerOff size={14} className="hidden sm:block text-gray-400" aria-label="Bot pausado" />
                )}
                <span className="text-xs text-gray-400" title={tiempoRelativo(conversacion.ultimaActividad)}>
                  {horaConversacion(conversacion.ultimaActividad)}
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
                  {noLeidos > 99 ? '99+' : noLeidos}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
      <button aria-label="Opciones de conversación" className="min-h-11 px-3 text-gray-500 text-xs" onClick={onMenu}>••• Opciones</button>
    </li>
  );
}
