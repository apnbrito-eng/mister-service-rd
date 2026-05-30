import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck } from 'lucide-react';
import { Notificacion } from '../types';
import { useApp } from '../context/AppContext';
import {
  suscribirNotificaciones, marcarLeida, marcarTodasLeidas,
} from '../services/notificaciones.service';
import { tiempoTranscurrido } from '../utils';

interface Props {
  theme?: 'light' | 'dark';
}

export default function NotificacionesPanel({ theme = 'dark' }: Props) {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // IMPORTANTE: usar `currentUser.uid` (auth.uid), NO `userProfile.id` —
  // cuando el perfil viene del fallback `personal/`, `userProfile.id` es el
  // personalDocId, no el auth.uid. La rule gate `userId == auth.uid` rechaza
  // silenciosamente con permission-denied en ese caso. Gotcha documentado en
  // CLAUDE.md ("userProfile.id NO siempre es auth.uid").
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = suscribirNotificaciones(currentUser.uid, setNotifs);
    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const noLeidas = notifs.filter(n => !n.leida).length;
  const ultimas = notifs.slice(0, 20);

  const handleClickNotif = async (n: Notificacion) => {
    if (!n.leida) {
      try { await marcarLeida(n.id); } catch (err) { console.error(err); }
    }
    setOpen(false);
    if (n.ordenId) {
      navigate(`/admin/ordenes/${n.ordenId}`);
    }
  };

  const handleMarcarTodas = async () => {
    if (!currentUser?.uid) return;
    try { await marcarTodasLeidas(currentUser.uid); } catch (err) { console.error(err); }
  };

  const btnBase = theme === 'dark'
    ? 'text-white hover:bg-white/10'
    : 'text-gray-700 hover:bg-gray-100';

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition-colors ${btnBase}`}
        title="Notificaciones"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-primary" />
              <h3 className="font-semibold text-sm text-gray-800">Notificaciones</h3>
              {noLeidas > 0 && (
                <span className="bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {noLeidas} nueva{noLeidas !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 hover:bg-gray-100 rounded text-gray-500"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {ultimas.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                <Bell size={28} className="mx-auto mb-2 opacity-30" />
                Sin notificaciones
              </div>
            ) : (
              ultimas.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickNotif(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                    n.leida ? 'bg-white hover:bg-gray-50' : 'bg-blue-50 hover:bg-blue-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${n.leida ? 'text-gray-700' : 'text-primary'}`}>
                        {n.titulo}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                        {n.mensaje}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {tiempoTranscurrido(n.createdAt)}
                      </p>
                    </div>
                    {!n.leida && (
                      <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 mt-1.5" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {ultimas.length > 0 && noLeidas > 0 && (
            <div className="border-t border-gray-100 p-2">
              <button
                type="button"
                onClick={handleMarcarTodas}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-primary hover:bg-blue-50 rounded-lg transition-colors"
              >
                <CheckCheck size={14} /> Marcar todas como leídas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
