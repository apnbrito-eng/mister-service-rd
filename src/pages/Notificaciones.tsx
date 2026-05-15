import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Filter, AlertCircle } from 'lucide-react';
import { Notificacion } from '../types';
import { useApp } from '../context/AppContext';
import {
  suscribirNotificaciones, marcarLeida, marcarTodasLeidas,
} from '../services/notificaciones.service';
import { tiempoTranscurrido } from '../utils';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Historial completo de notificaciones del usuario logueado.
 *
 * SPRINT-171 (2026-05-14): la ruta `/admin/notificaciones` no existía y el
 * fallback `*` del router redirigía al landing público — sacaba al user del
 * contexto admin. Esta página complementa la campanita (NotificacionesPanel,
 * que muestra solo las últimas 20 en un dropdown) ofreciendo:
 *  - listado completo (capado a 50 por el service para no abrir un firehose),
 *  - filtros simples (todas / no leídas),
 *  - acción "marcar todas como leídas",
 *  - click → navega a la orden asociada (igual que la campanita).
 *
 * Seguridad: la rule de Firestore filtra por `userId == auth.uid`, así que
 * cada user ve únicamente las suyas. No requiere PermisoRoute extra. Usa
 * `currentUser.uid` (auth.uid), NO `userProfile.id` — ver gotcha
 * "userProfile.id NO siempre es auth.uid" en CLAUDE.md.
 */
export default function Notificaciones() {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todas' | 'no_leidas'>('todas');

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = suscribirNotificaciones(currentUser.uid, (arr) => {
      setNotifs(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser?.uid]);

  const visibles = useMemo(() => {
    if (filtro === 'no_leidas') return notifs.filter(n => !n.leida);
    return notifs;
  }, [notifs, filtro]);

  const noLeidas = useMemo(() => notifs.filter(n => !n.leida).length, [notifs]);

  const handleClickNotif = async (n: Notificacion) => {
    if (!n.leida) {
      try { await marcarLeida(n.id); } catch (err) { console.error(err); }
    }
    if (n.ordenId) {
      navigate(`/admin/ordenes/${n.ordenId}`);
    }
  };

  const handleMarcarTodas = async () => {
    if (!currentUser?.uid) return;
    try { await marcarTodasLeidas(currentUser.uid); } catch (err) { console.error(err); }
  };

  if (loading) return <LoadingSpinner fullPage text="Cargando notificaciones..." />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0f3460] rounded-lg">
            <Bell size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Notificaciones</h1>
            <p className="text-xs text-gray-500">
              {notifs.length === 0
                ? 'Sin notificaciones'
                : `${notifs.length} total${notifs.length !== 1 ? 'es' : ''}${noLeidas > 0 ? ` — ${noLeidas} sin leer` : ''}`}
            </p>
          </div>
        </div>

        {noLeidas > 0 && (
          <button
            type="button"
            onClick={handleMarcarTodas}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[#0f3460] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <CheckCheck size={16} /> Marcar todas como leídas
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-gray-400" />
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setFiltro('todas')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filtro === 'todas' ? 'bg-white text-[#0f3460] shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFiltro('no_leidas')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filtro === 'no_leidas' ? 'bg-white text-[#0f3460] shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            No leídas {noLeidas > 0 && <span className="ml-1 text-red-600">({noLeidas})</span>}
          </button>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Bell size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            {filtro === 'no_leidas' ? 'No tenés notificaciones sin leer' : 'No hay notificaciones'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {visibles.map(n => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClickNotif(n)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 transition-colors ${
                n.leida ? 'bg-white hover:bg-gray-50' : 'bg-blue-50 hover:bg-blue-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm font-semibold truncate ${n.leida ? 'text-gray-700' : 'text-[#0f3460]'}`}>
                      {n.titulo}
                    </p>
                    {n.ordenNumero && (
                      <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {n.ordenNumero}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{n.mensaje}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {tiempoTranscurrido(n.createdAt)}
                  </p>
                </div>
                {!n.leida && (
                  <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 mt-1.5" aria-label="No leída" />
                )}
              </div>
            </button>
          ))}
          {notifs.length >= 50 && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
              <AlertCircle size={12} />
              Mostrando las 50 más recientes. Las más viejas siguen en el sistema.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
