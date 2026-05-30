import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Filter, AlertCircle, Eye } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Notificacion, Personal } from '../types';
import { useApp } from '../context/AppContext';
import {
  suscribirNotificaciones, marcarLeida, marcarTodasLeidas,
} from '../services/notificaciones.service';
import { tiempoTranscurrido } from '../utils';
import { esAdminOCoord } from '../utils/permisos';
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
  const { currentUser, userProfile } = useApp();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'todas' | 'no_leidas'>('todas');

  // SPRINT-184 parte 2 (2026-05-18): admin/coord puede ver bandeja de otros
  // usuarios para auditar entrega de notifs sin fricción de login-switch.
  // La rule firestore `notificaciones` permite `esStaff()` leer notifs ajenas
  // (rules ya aprobadas, no requirió cambio). Para roles non-admin el
  // selector queda oculto y se ve siempre la bandeja propia.
  const puedeAuditar = esAdminOCoord(userProfile);
  const [verBandejaDe, setVerBandejaDe] = useState<string>('');
  const [personalLista, setPersonalLista] = useState<Personal[]>([]);
  const targetUid = puedeAuditar && verBandejaDe ? verBandejaDe : (currentUser?.uid ?? '');
  const esBandejaPropia = !puedeAuditar || !verBandejaDe || verBandejaDe === currentUser?.uid;

  // Carga de `personal` solo si el user puede auditar. Suscripción liviana
  // (sin filtros, ~15 docs en producción). Si no es admin/coord, no se
  // suscribe ni descarga nada.
  useEffect(() => {
    if (!puedeAuditar) return;
    const unsub = onSnapshot(collection(db, 'personal'), (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() } as Personal));
      setPersonalLista(lista);
    });
    return () => unsub();
  }, [puedeAuditar]);

  useEffect(() => {
    if (!targetUid) return;
    setLoading(true);
    const unsub = suscribirNotificaciones(targetUid, (arr) => {
      setNotifs(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [targetUid]);

  const visibles = useMemo(() => {
    if (filtro === 'no_leidas') return notifs.filter(n => !n.leida);
    return notifs;
  }, [notifs, filtro]);

  const noLeidas = useMemo(() => notifs.filter(n => !n.leida).length, [notifs]);

  const handleClickNotif = async (n: Notificacion) => {
    // SPRINT-184 parte 2: en modo auditoría (bandeja ajena), no marcamos como
    // leídas — confundiría al dueño real de la bandeja.
    if (!n.leida && esBandejaPropia) {
      try { await marcarLeida(n.id); } catch (err) { console.error(err); }
    }
    if (n.ordenId) {
      navigate(`/admin/ordenes/${n.ordenId}`);
    }
  };

  const handleMarcarTodas = async () => {
    if (!currentUser?.uid) return;
    // SPRINT-184: solo "marcar todas como leídas" sobre tu propia bandeja.
    // Marcar como leídas las de otro user sería confuso para el dueño real.
    if (!esBandejaPropia) return;
    try { await marcarTodasLeidas(currentUser.uid); } catch (err) { console.error(err); }
  };

  // Opciones del selector: solo personal con uid (vía Auth). Excluyo
  // ayudantes — no entran al sistema admin. Ordenado por nombre.
  const opcionesBandeja = useMemo(() => {
    if (!puedeAuditar) return [];
    return personalLista
      .filter(p => p.uid && p.rol !== 'ayudante')
      .map(p => ({ uid: p.uid as string, nombre: p.nombre, rol: p.rol }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [personalLista, puedeAuditar]);

  if (loading) return <LoadingSpinner fullPage text="Cargando notificaciones..." />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
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

        {noLeidas > 0 && esBandejaPropia && (
          <button
            type="button"
            onClick={handleMarcarTodas}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <CheckCheck size={16} /> Marcar todas como leídas
          </button>
        )}
      </div>

      {/* SPRINT-184 parte 2 — selector "Ver bandeja de" para admin/coord */}
      {puedeAuditar && opcionesBandeja.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Eye size={14} className="text-gray-400" />
          <label htmlFor="bandejaSelect" className="text-xs font-medium text-gray-600">
            Ver bandeja de:
          </label>
          <select
            id="bandejaSelect"
            value={verBandejaDe || (currentUser?.uid ?? '')}
            onChange={(e) => setVerBandejaDe(e.target.value === (currentUser?.uid ?? '') ? '' : e.target.value)}
            className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary-medium"
          >
            <option value={currentUser?.uid ?? ''}>Yo ({userProfile?.nombre || 'mi sesión'})</option>
            {opcionesBandeja
              .filter(o => o.uid !== currentUser?.uid)
              .map(o => (
                <option key={o.uid} value={o.uid}>
                  {o.nombre} ({o.rol})
                </option>
              ))}
          </select>
          {!esBandejaPropia && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              Modo auditoría — sin acciones de marcado
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-gray-400" />
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setFiltro('todas')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filtro === 'todas' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFiltro('no_leidas')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filtro === 'no_leidas' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-800'
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
                    <p className={`text-sm font-semibold truncate ${n.leida ? 'text-gray-700' : 'text-primary'}`}>
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
